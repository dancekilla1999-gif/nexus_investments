import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DepositStatus, LedgerAccountType, UserStatus } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BlockchainAdapter, ObservedTransfer } from '../src/blockchain/adapter.interface';
import { BlockchainRegistry } from '../src/blockchain/blockchain.registry';
import { configureApp } from '../src/configure-app';
import { CustodyReconciliationService } from '../src/deposits/custody-reconciliation.service';
import { DepositWatcherService } from '../src/deposits/deposit-watcher.service';
import { DepositsService } from '../src/deposits/deposits.service';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * The deposit pipeline end to end, with a scripted adapter standing in for the chain.
 *
 * The adapter itself is verified against a live Sepolia node in
 * `src/blockchain/evm.adapter.integration.spec.ts`. What cannot be tested against a public
 * testnet is the part that matters most here: a *specific* transfer of a *known* amount to a
 * *known* address, arriving twice, arriving out of order, or arriving before enough
 * confirmations. Those need a chain whose behaviour the test dictates, so this substitutes one
 * at the adapter boundary — the same boundary a real Solana or Bitcoin adapter would plug into.
 */
class ScriptedAdapter implements BlockchainAdapter {
  readonly chainKey = 'ethereum';
  private head = 1000n;
  private transfers: ObservedTransfer[] = [];
  private confirmationsByTx = new Map<string, number>();
  /** The chain's own view of custody, keyed `${address}|${token ?? 'native'}`. */
  private balances = new Map<string, bigint>();

  setHead(n: bigint) {
    this.head = n;
  }
  queueTransfer(t: ObservedTransfer) {
    this.transfers.push(t);
  }
  setConfirmations(txHash: string, n: number) {
    this.confirmationsByTx.set(txHash, n);
  }
  setBalance(address: string, tokenContract: string | null, amount: bigint) {
    this.balances.set(this.balanceKey(address, tokenContract), amount);
  }
  clearBalances() {
    this.balances.clear();
  }

  deriveDepositAddress(accountIndex: number): string {
    return `0x${accountIndex.toString(16).padStart(40, 'a')}`;
  }
  normalizeAddress(address: string): string {
    return address.toLowerCase();
  }
  async getChainHead() {
    return { blockNumber: this.head, timestamp: new Date() };
  }
  async getIncomingTransfers(addresses: string[], _tokens: string[], from: bigint, to: bigint) {
    const watched = new Set(addresses.map((a) => this.normalizeAddress(a)));
    return this.transfers.filter(
      (t) => watched.has(t.to) && t.blockNumber >= from && t.blockNumber <= to,
    );
  }
  async getConfirmations(txHash: string) {
    return this.confirmationsByTx.get(txHash) ?? 0;
  }
  async getBalance(address: string, tokenContract: string | null) {
    return this.balances.get(this.balanceKey(address, tokenContract)) ?? 0n;
  }
  private balanceKey(address: string, tokenContract: string | null) {
    const token = tokenContract ? this.normalizeAddress(tokenContract) : 'native';
    return `${this.normalizeAddress(address)}|${token}`;
  }
  async estimateWithdrawalFee() {
    return { totalNative: 21000n, detail: {} };
  }
  async getNetworkStatus() {
    return { healthy: true, blockNumber: this.head };
  }
}

describe('Deposits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let deposits: DepositsService;
  let watcher: DepositWatcherService;
  let reconciliation: CustodyReconciliationService;
  let redis: Redis;
  let adapter: ScriptedAdapter;

  let chainId: string;
  let nativeAssetId: string;
  let tokenAssetId: string;
  const TOKEN_CONTRACT = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';

  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    adapter = new ScriptedAdapter();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BlockchainRegistry)
      .useValue({
        getAdapter: async () => adapter,
        getConfiguredChainKeys: async () => ['ethereum'],
        isConfigured: async () => true,
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);
    deposits = app.get(DepositsService);
    watcher = app.get(DepositWatcherService);
    reconciliation = app.get(CustodyReconciliationService);
    redis = app.get(REDIS_CLIENT);

    const chain = await prisma.chain.upsert({
      where: { key: 'ethereum' },
      update: { confirmationsRequired: 3, isEnabled: true },
      create: {
        key: 'ethereum',
        name: 'Ethereum (test)',
        type: 'EVM',
        nativeAssetSymbol: 'ETH',
        confirmationsRequired: 3,
        isTestnet: true,
        explorerUrlTemplate: 'https://sepolia.etherscan.io/tx/{txHash}',
      },
    });
    chainId = chain.id;

    nativeAssetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId, symbol: 'ETH' } },
        update: { isEnabled: true },
        create: { symbol: 'ETH', name: 'Ether', chainId, decimals: 18, kind: 'NATIVE' },
      })
    ).id;

    tokenAssetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId, symbol: 'USDC' } },
        update: { contractAddress: TOKEN_CONTRACT, isEnabled: true },
        create: {
          symbol: 'USDC',
          name: 'USD Coin',
          chainId,
          decimals: 6,
          kind: 'TOKEN',
          contractAddress: TOKEN_CONTRACT,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await redis.flushdb();
    await prisma.chain.update({
      where: { id: chainId },
      data: { lastScannedBlock: null, nextDerivationIndex: 0 },
    });
    await prisma.user.upsert({
      where: { id: PLATFORM_SYSTEM_USER_ID },
      update: {},
      create: {
        id: PLATFORM_SYSTEM_USER_ID,
        email: PLATFORM_SYSTEM_USER_EMAIL,
        passwordHash: 'NOT_A_VALID_HASH__SYSTEM_ACCOUNT_CANNOT_LOG_IN',
        status: UserStatus.CLOSED,
      },
    });

    adapter = Object.assign(adapter, new ScriptedAdapter());

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `dep-${randomUUID()}@example.com`, password: 'Str0ng!Passw0rd#2026' })
      .expect(201);
    accessToken = res.body.accessToken;
    userId = res.body.user.id;
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const server = () => app.getHttpServer();

  async function issueAddress(): Promise<string> {
    const res = await request(server())
      .post('/api/v1/wallet/deposits/address/ethereum')
      .set(auth())
      .expect(201);
    return res.body.address;
  }

  async function balance(type: LedgerAccountType, assetId = nativeAssetId): Promise<string> {
    const balances = await ledger.getBalances(userId);
    return balances.find((b) => b.assetId === assetId && b.type === type)?.amount ?? '0';
  }

  function transfer(to: string, overrides: Partial<ObservedTransfer> = {}): ObservedTransfer {
    return {
      txHash: `0x${randomUUID().replace(/-/g, '')}${'0'.repeat(32)}`.slice(0, 66),
      logIndex: 0,
      blockNumber: 1000n,
      from: '0x000000000000000000000000000000000000dead',
      to: to.toLowerCase(),
      amount: 10n ** 18n,
      tokenContract: null,
      ...overrides,
    };
  }

  describe('address issuance', () => {
    it('issues a stable address per user and never reuses a derivation index', async () => {
      const first = await issueAddress();
      const second = await issueAddress();
      expect(second).toBe(first);

      const other = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: `dep2-${randomUUID()}@example.com`, password: 'Str0ng!Passw0rd#2026' })
        .expect(201);
      const otherAddress = await request(server())
        .post('/api/v1/wallet/deposits/address/ethereum')
        .set({ Authorization: `Bearer ${other.body.accessToken}` })
        .expect(201);

      expect(otherAddress.body.address).not.toBe(first);

      const indices = (await prisma.walletAddress.findMany({ select: { derivationIndex: true } })).map(
        (a) => a.derivationIndex,
      );
      expect(new Set(indices).size).toBe(indices.length);
    });

    it('never hands the same index to two concurrent requests', async () => {
      // Ten users asking for an address at the same instant. Without the row lock on the
      // chain's counter, several would read the same nextDerivationIndex and receive the
      // SAME deposit address — making their funds indistinguishable on-chain.
      const tokens = await Promise.all(
        Array.from({ length: 10 }, async () => {
          await redis.flushdb();
          const r = await request(server())
            .post('/api/v1/auth/register')
            .send({ email: `race-${randomUUID()}@example.com`, password: 'Str0ng!Passw0rd#2026' });
          return r.body.accessToken as string;
        }),
      );

      const results = await Promise.all(
        tokens.map((t) =>
          request(server())
            .post('/api/v1/wallet/deposits/address/ethereum')
            .set({ Authorization: `Bearer ${t}` }),
        ),
      );

      const addresses = results.filter((r) => r.status === 201).map((r) => r.body.address);
      expect(addresses.length).toBe(10);
      expect(new Set(addresses).size).toBe(10);
    });

    it('advertises only assets a deposit could actually be credited in', async () => {
      // A token row with no contract address is invisible to the scanner: it is left out of the
      // log filter and cannot be matched to an observed transfer. Listing it next to a deposit
      // address would invite a user to send funds that arrive on chain and are never credited.
      await prisma.asset.deleteMany({ where: { chainId, symbol: 'GHOST' } });
      await prisma.asset.create({
        data: {
          symbol: 'GHOST',
          name: 'Unconfigured Token',
          chainId,
          decimals: 18,
          kind: 'TOKEN',
          contractAddress: null,
        },
      });

      try {
        const res = await request(server())
          .post('/api/v1/wallet/deposits/address/ethereum')
          .set(auth())
          .expect(201);

        expect(res.body.supportedAssets).toEqual(expect.arrayContaining(['ETH', 'USDC']));
        expect(res.body.supportedAssets).not.toContain('GHOST');
      } finally {
        // Assets are seeded once in beforeAll and survive resetDatabase, so this row would
        // otherwise leak into every later test.
        await prisma.asset.deleteMany({ where: { chainId, symbol: 'GHOST' } });
      }
    });

    it('requires authentication', async () => {
      await request(server()).post('/api/v1/wallet/deposits/address/ethereum').expect(401);
      await request(server()).get('/api/v1/wallet/deposits').expect(401);
    });
  });

  describe('detection and crediting', () => {
    it('credits a detected transfer to PENDING, not to AVAILABLE', async () => {
      const address = await issueAddress();
      adapter.queueTransfer(transfer(address));
      adapter.setHead(1000n);

      await watcher.scanChain('ethereum');

      expect(await balance(LedgerAccountType.PENDING)).toBe('1');
      expect(await balance(LedgerAccountType.AVAILABLE)).toBe('0');

      const deposit = await prisma.deposit.findFirstOrThrow();
      expect(deposit.status).toBe(DepositStatus.PENDING_CONFIRMATION);
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });

    it('moves PENDING to AVAILABLE only once the chain confirms it deeply enough', async () => {
      const address = await issueAddress();
      const t = transfer(address);
      adapter.queueTransfer(t);
      await watcher.scanChain('ethereum');

      // Below the chain's threshold of 3 — must stay unspendable.
      adapter.setConfirmations(t.txHash, 2);
      await deposits.advancePendingDeposits('ethereum');
      expect(await balance(LedgerAccountType.PENDING)).toBe('1');
      expect(await balance(LedgerAccountType.AVAILABLE)).toBe('0');

      adapter.setConfirmations(t.txHash, 3);
      await deposits.advancePendingDeposits('ethereum');
      expect(await balance(LedgerAccountType.PENDING)).toBe('0');
      expect(await balance(LedgerAccountType.AVAILABLE)).toBe('1');

      const deposit = await prisma.deposit.findFirstOrThrow();
      expect(deposit.status).toBe(DepositStatus.CREDITED);
      expect(deposit.creditedAt).toBeTruthy();
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });

    it('credits a token transfer using that token\'s decimals, not the chain\'s', async () => {
      const address = await issueAddress();
      // 250 USDC at 6 decimals. Treating this as 18-decimal would credit 0.00000000000025.
      adapter.queueTransfer(
        transfer(address, { amount: 250_000_000n, tokenContract: TOKEN_CONTRACT }),
      );

      await watcher.scanChain('ethereum');
      expect(await balance(LedgerAccountType.PENDING, tokenAssetId)).toBe('250');
    });

    it('is idempotent: rescanning the same blocks never double-credits', async () => {
      const address = await issueAddress();
      adapter.queueTransfer(transfer(address));

      await watcher.scanChain('ethereum');
      // Rewind the cursor and scan the same range again — exactly what a restart or a
      // reorg-driven rewind does.
      await prisma.chain.update({ where: { id: chainId }, data: { lastScannedBlock: null } });
      await watcher.scanChain('ethereum');
      await prisma.chain.update({ where: { id: chainId }, data: { lastScannedBlock: null } });
      await watcher.scanChain('ethereum');

      expect(await prisma.deposit.count()).toBe(1);
      expect(await balance(LedgerAccountType.PENDING)).toBe('1');
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });

    it('does not double-release a deposit when confirmation checks run repeatedly', async () => {
      const address = await issueAddress();
      const t = transfer(address);
      adapter.queueTransfer(t);
      await watcher.scanChain('ethereum');

      adapter.setConfirmations(t.txHash, 10);
      await deposits.advancePendingDeposits('ethereum');
      await deposits.advancePendingDeposits('ethereum');
      await deposits.advancePendingDeposits('ethereum');

      expect(await balance(LedgerAccountType.AVAILABLE)).toBe('1');
      expect(await balance(LedgerAccountType.PENDING)).toBe('0');
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });

    it('ignores transfers to addresses the platform does not own', async () => {
      await issueAddress();
      adapter.queueTransfer(transfer('0x000000000000000000000000000000000000beef'));

      await watcher.scanChain('ethereum');

      expect(await prisma.deposit.count()).toBe(0);
      expect(await balance(LedgerAccountType.PENDING)).toBe('0');
    });

    it('ignores an unsupported token rather than inventing an asset for it', async () => {
      const address = await issueAddress();
      adapter.queueTransfer(
        transfer(address, { amount: 5n, tokenContract: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }),
      );

      await watcher.scanChain('ethereum');

      expect(await prisma.deposit.count()).toBe(0);
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });

    it('records the platform boundary as the mirror of every credited deposit', async () => {
      const address = await issueAddress();
      adapter.queueTransfer(transfer(address, { amount: 3n * 10n ** 18n }));
      await watcher.scanChain('ethereum');

      const external = await prisma.balance.findFirstOrThrow({
        where: { userId: PLATFORM_SYSTEM_USER_ID, type: LedgerAccountType.EXTERNAL, assetId: nativeAssetId },
      });
      expect(external.amount.toString()).toBe('-3');
    });
  });

  describe('scan cursor', () => {
    it('starts at the chain head rather than replaying history', async () => {
      await issueAddress();
      adapter.setHead(5_000n);
      await watcher.scanChain('ethereum');

      const chain = await prisma.chain.findUniqueOrThrow({ where: { id: chainId } });
      expect(chain.lastScannedBlock).toBe(5_000n);
    });

    it('advances in bounded batches and does not skip blocks', async () => {
      await issueAddress();
      adapter.setHead(1_000n);
      await watcher.scanChain('ethereum'); // initialises the cursor at the head

      adapter.setHead(1_500n);
      const pass = await watcher.scanChain('ethereum');

      expect(pass!.from).toBe(1_001n);
      // DEPOSIT_SCAN_BATCH_BLOCKS defaults to 50, so a 500-block gap is covered over many
      // passes rather than one enormous RPC call.
      expect(pass!.to).toBe(1_050n);

      const chain = await prisma.chain.findUniqueOrThrow({ where: { id: chainId } });
      expect(chain.lastScannedBlock).toBe(1_050n);
    });
  });

  describe('user-facing history', () => {
    it('lists deposits with confirmation progress and an explorer link', async () => {
      const address = await issueAddress();
      const t = transfer(address);
      adapter.queueTransfer(t);
      await watcher.scanChain('ethereum');
      adapter.setConfirmations(t.txHash, 2);
      await deposits.advancePendingDeposits('ethereum');

      const res = await request(server()).get('/api/v1/wallet/deposits').set(auth()).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        chainKey: 'ethereum',
        assetSymbol: 'ETH',
        amount: '1',
        status: DepositStatus.PENDING_CONFIRMATION,
        confirmations: 2,
        confirmationsRequired: 3,
      });
      expect(res.body[0].explorerUrl).toContain(t.txHash);
    });

    it('never shows one user another user\'s deposits', async () => {
      const address = await issueAddress();
      adapter.queueTransfer(transfer(address));
      await watcher.scanChain('ethereum');

      const other = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: `nosee-${randomUUID()}@example.com`, password: 'Str0ng!Passw0rd#2026' })
        .expect(201);

      const res = await request(server())
        .get('/api/v1/wallet/deposits')
        .set({ Authorization: `Bearer ${other.body.accessToken}` })
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  /**
   * Reconciliation is the check that the ledger is not merely self-consistent but actually
   * *backed*. A double-entry ledger stays perfectly balanced while describing money that does
   * not exist, so these tests deliberately create that exact situation — a credited deposit
   * with nothing behind it on chain — and assert the platform notices.
   */
  describe('custody reconciliation', () => {
    /** Credits a real deposit, leaving the chain's custody balance for the test to dictate. */
    async function depositOf(baseUnits: bigint, token: string | null = null): Promise<string> {
      const address = await issueAddress();
      const t = transfer(address, { amount: baseUnits, tokenContract: token });
      adapter.queueTransfer(t);
      await watcher.scanChain('ethereum');
      return address;
    }

    async function openMismatches() {
      return prisma.riskEvent.findMany({
        where: { type: 'RECONCILIATION_MISMATCH', status: 'OPEN' },
      });
    }

    it('reports a match when on-chain custody backs the ledger exactly', async () => {
      const address = await depositOf(10n ** 18n);
      adapter.setBalance(address, null, 10n ** 18n);

      const reports = await reconciliation.reconcileChain('ethereum');
      const eth = reports.find((r) => r.assetSymbol === 'ETH')!;

      expect(eth).toMatchObject({ status: 'MATCHED', obligation: '1', custody: '1', difference: '0' });
      expect(await openMismatches()).toHaveLength(0);
    });

    it('files a high-severity risk event when custody falls short of the ledger', async () => {
      // The scenario that matters: the ledger says a user owns 1 ETH, the chain holds 0.4.
      // Nothing about the ledger itself is inconsistent — this is only visible from outside.
      const address = await depositOf(10n ** 18n);
      adapter.setBalance(address, null, 4n * 10n ** 17n);

      const reports = await reconciliation.reconcileChain('ethereum');
      const eth = reports.find((r) => r.assetSymbol === 'ETH')!;

      expect(eth.status).toBe('SHORTFALL');
      expect(eth.obligation).toBe('1');
      expect(eth.custody).toBe('0.4');
      expect(eth.difference).toBe('-0.6');

      const events = await openMismatches();
      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe(5);
      expect(events[0].details).toMatchObject({
        kind: 'SHORTFALL',
        asset: 'ETH',
        ledgerObligation: '1',
        onChainCustody: '0.4',
        difference: '-0.6',
      });
    });

    it('files a low-severity event for a surplus — funds held but not yet credited', async () => {
      const address = await depositOf(10n ** 18n);
      // A second transfer has landed on chain but has not been scanned yet. The user's money is
      // safe but, from their point of view, missing — so it is recorded, just not as an alarm.
      adapter.setBalance(address, null, 3n * 10n ** 18n);

      const [eth] = (await reconciliation.reconcileChain('ethereum')).filter(
        (r) => r.assetSymbol === 'ETH',
      );

      expect(eth.status).toBe('SURPLUS');
      expect(eth.difference).toBe('2');

      const events = await openMismatches();
      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe(1);
    });

    it('reconciles each asset against its own decimals, not the chain\'s', async () => {
      // 250 USDC is 250_000000 base units at 6 decimals. Reconciling it with 18 decimals would
      // report a catastrophic shortfall on a perfectly healthy platform.
      const address = await depositOf(250_000000n, TOKEN_CONTRACT);
      adapter.setBalance(address, TOKEN_CONTRACT, 250_000000n);

      const reports = await reconciliation.reconcileChain('ethereum');
      const usdc = reports.find((r) => r.assetSymbol === 'USDC')!;

      expect(usdc).toMatchObject({ status: 'MATCHED', obligation: '250', custody: '250' });
    });

    it('keeps a persistent mismatch as one open incident, refreshed rather than duplicated', async () => {
      const address = await depositOf(10n ** 18n);
      adapter.setBalance(address, null, 4n * 10n ** 17n);
      await reconciliation.reconcileChain('ethereum');

      // The gap widens between runs. An on-call responder must see the current number, and must
      // not have to page through one event per scan interval to find it.
      adapter.setBalance(address, null, 1n * 10n ** 17n);
      await reconciliation.reconcileChain('ethereum');

      const events = await openMismatches();
      expect(events).toHaveLength(1);
      expect(events[0].details).toMatchObject({ onChainCustody: '0.1', difference: '-0.9' });
    });

    it('sums custody across every deposit address on the chain', async () => {
      const first = await depositOf(10n ** 18n);

      const other = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: `recon-${randomUUID()}@example.com`, password: 'Str0ng!Passw0rd#2026' })
        .expect(201);
      const secondAddress = (
        await request(server())
          .post('/api/v1/wallet/deposits/address/ethereum')
          .set({ Authorization: `Bearer ${other.body.accessToken}` })
          .expect(201)
      ).body.address as string;
      const t = transfer(secondAddress, { amount: 2n * 10n ** 18n, blockNumber: 1001n });
      adapter.setHead(1_001n);
      adapter.queueTransfer(t);
      await watcher.scanChain('ethereum');

      adapter.setBalance(first, null, 10n ** 18n);
      adapter.setBalance(secondAddress, null, 2n * 10n ** 18n);

      const eth = (await reconciliation.reconcileChain('ethereum')).find(
        (r) => r.assetSymbol === 'ETH',
      )!;
      expect(eth).toMatchObject({ status: 'MATCHED', obligation: '3', custody: '3' });
      expect(eth.addressesChecked).toBe(2);
    });

    it('is not fooled by a PENDING deposit: an uncredited-to-AVAILABLE deposit is still owed', async () => {
      // PENDING value is the user's money even though they cannot spend it yet, so it must be
      // backed. Excluding it would let a platform look solvent while holding nothing.
      const address = await depositOf(10n ** 18n);
      expect(await balance(LedgerAccountType.PENDING)).toBe('1');
      expect(await balance(LedgerAccountType.AVAILABLE)).toBe('0');

      adapter.setBalance(address, null, 0n);
      const eth = (await reconciliation.reconcileChain('ethereum')).find(
        (r) => r.assetSymbol === 'ETH',
      )!;

      expect(eth.obligation).toBe('1');
      expect(eth.status).toBe('SHORTFALL');
    });

    it('skips a token whose balance cannot be read rather than reconciling it as native', async () => {
      // A TOKEN row with no contract address has no readable on-chain balance. Reconciling it
      // anyway would call getBalance(address, null) — the *native* balance — and report the
      // chain's ETH holdings under the token's symbol. The resulting phantom mismatch is not
      // merely noise: it is loud enough to bury a real shortfall on another asset.
      await prisma.asset.deleteMany({ where: { chainId, symbol: 'GHOST' } });
      await prisma.asset.create({
        data: {
          symbol: 'GHOST',
          name: 'Unconfigured Token',
          chainId,
          decimals: 18,
          kind: 'TOKEN',
          contractAddress: null,
        },
      });

      try {
        const address = await depositOf(10n ** 18n);
        adapter.setBalance(address, null, 10n ** 18n);

        const reports = await reconciliation.reconcileChain('ethereum');

        expect(reports.map((r) => r.assetSymbol)).not.toContain('GHOST');
        expect(reports.every((r) => r.status === 'MATCHED')).toBe(true);
        expect(await openMismatches()).toHaveLength(0);
      } finally {
        await prisma.asset.deleteMany({ where: { chainId, symbol: 'GHOST' } });
      }
    });

    it('refuses the reconciliation endpoint to ordinary users', async () => {
      // It exposes the platform's aggregate holdings — not a user-facing number.
      await request(server()).post('/api/v1/wallet/deposits/reconcile').set(auth()).expect(403);
    });

    it('allows risk operations to run reconciliation on demand', async () => {
      const promoted = await prisma.user.update({
        where: { id: userId },
        data: { role: 'RISK_OPS' },
      });
      // Re-authenticate rather than reuse the existing token: the role is baked into the JWT at
      // issue time, so the old token still says USER — which is the correct behaviour, and
      // worth having the test depend on.
      const elevated = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: promoted.email, password: 'Str0ng!Passw0rd#2026' })
        .expect(201);

      const res = await request(server())
        .post('/api/v1/wallet/deposits/reconcile')
        .set({ Authorization: `Bearer ${elevated.body.accessToken}` })
        .expect(201);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.every((r: { status: string }) => r.status === 'MATCHED')).toBe(true);
    });
  });
});
