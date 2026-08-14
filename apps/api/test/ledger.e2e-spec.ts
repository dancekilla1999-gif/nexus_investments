import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LedgerAccountType, LedgerTransactionType, Prisma, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './utils/reset-database';

/**
 * The ledger's correctness suite. Runs against a real PostgreSQL because the properties under
 * test — deferred constraint triggers, row-level locking under concurrency, append-only
 * enforcement — live in the database, not in TypeScript. A mocked Prisma would happily "pass"
 * every one of these while the real system quietly lost money.
 *
 * These are docs/09-roadmap.md §MVP2's acceptance criteria, one describe block each.
 */
describe('Ledger (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;

  let userId: string;
  let otherUserId: string;
  let assetId: string;
  let secondAssetId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);

    const chain = await prisma.chain.upsert({
      where: { key: 'ledger-test-chain' },
      update: {},
      create: {
        key: 'ledger-test-chain',
        name: 'Ledger Test Chain',
        type: 'EVM',
        nativeAssetSymbol: 'TST',
        isTestnet: true,
      },
    });
    assetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'TST' } },
        update: {},
        create: { symbol: 'TST', name: 'Test Token', chainId: chain.id, decimals: 18, kind: 'NATIVE' },
      })
    ).id;
    secondAssetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'TST2' } },
        update: {},
        create: { symbol: 'TST2', name: 'Second Test Token', chainId: chain.id, decimals: 18, kind: 'TOKEN' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await ensurePlatformUser(prisma);
    userId = (await createUser(prisma)).id;
    otherUserId = (await createUser(prisma)).id;
  });

  /** Puts value in an account the way a real deposit will: debit EXTERNAL, credit the user. */
  async function credit(
    target: string,
    amount: string,
    type: LedgerAccountType = LedgerAccountType.AVAILABLE,
    asset: string = assetId,
  ) {
    return ledger.post({
      type: LedgerTransactionType.DEPOSIT,
      idempotencyKey: `credit-${randomUUID()}`,
      legs: [
        { userId: PLATFORM_SYSTEM_USER_ID, assetId: asset, type: LedgerAccountType.EXTERNAL, amount: `-${amount}` },
        { userId: target, assetId: asset, type, amount },
      ],
    });
  }

  async function balanceOf(
    uid: string,
    type: LedgerAccountType = LedgerAccountType.AVAILABLE,
    asset: string = assetId,
  ): Promise<string> {
    const balances = await ledger.getBalances(uid);
    return balances.find((b) => b.assetId === asset && b.type === type)?.amount ?? '0';
  }

  describe('conservation of value', () => {
    it('moves value between users, leaving the system total at exactly zero', async () => {
      await credit(otherUserId, '1000');

      await ledger.post({
        type: LedgerTransactionType.TRANSFER_INTERNAL,
        idempotencyKey: `t-${randomUUID()}`,
        legs: [
          { userId: otherUserId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-250' },
          { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '250' },
        ],
      });

      expect(await balanceOf(userId)).toBe('250');
      expect(await balanceOf(otherUserId)).toBe('750');

      // The defining property of double-entry: every entry ever written sums to zero.
      const systemTotal = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
      expect(systemTotal._sum.amount?.toString()).toBe('0');
    });

    it('records the platform boundary as the mirror image of user holdings', async () => {
      await credit(userId, '400');
      await credit(otherUserId, '600');

      const external = await prisma.balance.findFirstOrThrow({
        where: { userId: PLATFORM_SYSTEM_USER_ID, type: LedgerAccountType.EXTERNAL, assetId },
      });

      // What the platform owes its users, as one number — the figure custody reconciliation
      // compares against on-chain holdings (docs/06-blockchain-architecture.md §5).
      expect(external.amount.toString()).toBe('-1000');
    });

    it('rejects an unbalanced posting before it reaches the database', async () => {
      await expect(
        ledger.post({
          type: LedgerTransactionType.DEPOSIT,
          idempotencyKey: `t-${randomUUID()}`,
          legs: [
            { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '100' },
            { userId: otherUserId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-99' },
          ],
        }),
      ).rejects.toThrow(/does not balance/i);

      expect(await prisma.ledgerTransaction.count()).toBe(0);
    });

    it('rejects a single-leg posting', async () => {
      await expect(
        ledger.post({
          type: LedgerTransactionType.DEPOSIT,
          idempotencyKey: `t-${randomUUID()}`,
          legs: [{ userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '100' }],
        }),
      ).rejects.toThrow(/at least two entries/i);
    });

    it('requires each asset to balance independently, not merely in aggregate', async () => {
      // +10 of asset A against -10 of asset B nets to zero across the posting, but is not a
      // balanced transaction — it invents 10 units of A out of 10 units of B.
      await expect(
        ledger.post({
          type: LedgerTransactionType.TRADE,
          idempotencyKey: `t-${randomUUID()}`,
          legs: [
            { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '10' },
            { userId, assetId: secondAssetId, type: LedgerAccountType.AVAILABLE, amount: '-10' },
          ],
        }),
      ).rejects.toThrow(/does not balance/i);
    });

    it('accepts a genuine two-asset posting where each asset balances (a trade)', async () => {
      await credit(userId, '100');
      await credit(otherUserId, '50', LedgerAccountType.AVAILABLE, secondAssetId);

      await ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `trade-${randomUUID()}`,
        legs: [
          { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-30' },
          { userId: otherUserId, assetId, type: LedgerAccountType.AVAILABLE, amount: '30' },
          { userId: otherUserId, assetId: secondAssetId, type: LedgerAccountType.AVAILABLE, amount: '-5' },
          { userId, assetId: secondAssetId, type: LedgerAccountType.AVAILABLE, amount: '5' },
        ],
      });

      expect(await balanceOf(userId)).toBe('70');
      expect(await balanceOf(userId, LedgerAccountType.AVAILABLE, secondAssetId)).toBe('5');
      expect(await balanceOf(otherUserId)).toBe('30');
      expect(await balanceOf(otherUserId, LedgerAccountType.AVAILABLE, secondAssetId)).toBe('45');
    });

    it('is enforced by the database even when the service layer is bypassed entirely', async () => {
      // Defense in depth: writes straight to the tables, skipping every application check. The
      // deferred trigger must still refuse it — and must surface that refusal to the caller
      // rather than reporting a phantom success.
      const accountId = await createRawAccount(prisma, userId, assetId);

      await expect(
        prisma.$transaction(async (tx) => {
          const t = await tx.ledgerTransaction.create({
            data: { type: LedgerTransactionType.ADJUSTMENT, idempotencyKey: `raw-${randomUUID()}` },
          });
          await tx.ledgerEntry.create({
            data: { ledgerTransactionId: t.id, ledgerAccountId: accountId, amount: new Prisma.Decimal(500) },
          });
          await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
        }),
      ).rejects.toThrow(/[Uu]nbalanced ledger transaction/);

      expect(await prisma.ledgerEntry.count()).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('applies a repeated idempotency key exactly once', async () => {
      await credit(otherUserId, '500');
      const key = `idem-${randomUUID()}`;
      const legs = [
        { userId: otherUserId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-100' },
        { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '100' },
      ];

      const first = await ledger.post({ type: LedgerTransactionType.TRANSFER_INTERNAL, idempotencyKey: key, legs });
      const second = await ledger.post({ type: LedgerTransactionType.TRANSFER_INTERNAL, idempotencyKey: key, legs });

      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.id).toBe(first.id);
      expect(await balanceOf(userId)).toBe('100');
      expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it('applies exactly once even when the same key is posted concurrently', async () => {
      await credit(otherUserId, '500');
      const key = `idem-race-${randomUUID()}`;
      const legs = [
        { userId: otherUserId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-100' },
        { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '100' },
      ];

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          ledger.post({ type: LedgerTransactionType.TRANSFER_INTERNAL, idempotencyKey: key, legs }),
        ),
      );

      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await balanceOf(userId)).toBe('100');
    });
  });

  describe('double-spend prevention', () => {
    it('rejects a posting that would overdraw an account', async () => {
      await credit(userId, '100');

      await expect(
        ledger.post({
          type: LedgerTransactionType.WITHDRAWAL,
          idempotencyKey: `over-${randomUUID()}`,
          legs: [
            { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-101' },
            { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '101' },
          ],
        }),
      ).rejects.toThrow(/Insufficient balance/i);

      expect(await balanceOf(userId)).toBe('100');
    });

    it('lets exactly one of ten concurrent spends of the same funds succeed', async () => {
      await credit(userId, '100');

      // Without row locking, several of these would read "100 available" at the same instant
      // and all succeed — creating money from nothing. This is the single most important
      // assertion in the suite.
      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          ledger.post({
            type: LedgerTransactionType.WITHDRAWAL,
            idempotencyKey: `race-${randomUUID()}`,
            legs: [
              { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-100' },
              { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '100' },
            ],
          }),
        ),
      );

      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      expect(await balanceOf(userId)).toBe('0');
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });

    it('serializes concurrent partial spends without overdrawing', async () => {
      await credit(userId, '100');

      // Twenty concurrent attempts to spend 10 each: at most ten can succeed.
      const attempts = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          ledger.post({
            type: LedgerTransactionType.WITHDRAWAL,
            idempotencyKey: `partial-${randomUUID()}`,
            legs: [
              { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-10' },
              { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '10' },
            ],
          }),
        ),
      );

      const succeeded = attempts.filter((a) => a.status === 'fulfilled').length;
      expect(succeeded).toBe(10);
      expect(await balanceOf(userId)).toBe('0');
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });
  });

  describe('append-only history', () => {
    it('refuses to modify or delete a posted entry', async () => {
      await credit(userId, '10');
      const entry = await prisma.ledgerEntry.findFirstOrThrow();

      await expect(
        prisma.ledgerEntry.update({ where: { id: entry.id }, data: { amount: new Prisma.Decimal(999) } }),
      ).rejects.toThrow(/append-only/i);

      await expect(prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/i);
    });
  });

  describe('reconciliation', () => {
    it('reports no mismatches across a series of postings', async () => {
      await credit(otherUserId, '1000');
      for (let i = 0; i < 10; i++) {
        await ledger.post({
          type: LedgerTransactionType.TRANSFER_INTERNAL,
          idempotencyKey: `recon-${randomUUID()}`,
          legs: [
            { userId: otherUserId, assetId, type: LedgerAccountType.AVAILABLE, amount: '-10' },
            { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: '10' },
          ],
        });
      }

      expect(await balanceOf(userId)).toBe('100');
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });

    it('detects a projection that has drifted from the entries', async () => {
      await credit(userId, '50');
      const balance = await prisma.balance.findFirstOrThrow({ where: { userId } });

      // `balances` is a cache, not history, so it is writable — which is exactly why it needs
      // a reconciliation check watching it.
      await prisma.balance.update({ where: { id: balance.id }, data: { amount: new Prisma.Decimal(999) } });

      const mismatches = await ledger.verifyReconciliation();
      expect(mismatches).toHaveLength(1);
      expect(mismatches[0]).toMatchObject({ projected: '999', recomputed: '50' });
    });
  });

  describe('precision', () => {
    it('preserves 18-decimal amounts without floating-point drift', async () => {
      const wei = '0.000000000000000001';
      await credit(userId, '1');

      for (let i = 0; i < 3; i++) {
        await ledger.post({
          type: LedgerTransactionType.TRANSFER_INTERNAL,
          idempotencyKey: `wei-${randomUUID()}`,
          legs: [
            { userId, assetId, type: LedgerAccountType.AVAILABLE, amount: `-${wei}` },
            { userId, assetId, type: LedgerAccountType.TRADING, amount: wei },
          ],
        });
      }

      expect(await balanceOf(userId)).toBe('0.999999999999999997');
      expect(await balanceOf(userId, LedgerAccountType.TRADING)).toBe('0.000000000000000003');
      expect(await ledger.verifyReconciliation()).toEqual([]);
    });
  });
});

// ── helpers ──────────────────────────────────────────────────────────────

async function createUser(prisma: PrismaService) {
  return prisma.user.create({
    data: { email: `ledger-${randomUUID()}@example.com`, passwordHash: 'not-a-real-hash' },
  });
}

/** resetDatabase() truncates users, so the seeded platform identity is recreated per test. */
async function ensurePlatformUser(prisma: PrismaService) {
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
}

async function createRawAccount(prisma: PrismaService, userId: string, assetId: string): Promise<string> {
  const account = await prisma.ledgerAccount.create({
    data: {
      userId,
      assetId,
      type: LedgerAccountType.FUNDING,
      balance: { create: { userId, assetId, type: LedgerAccountType.FUNDING, amount: new Prisma.Decimal(0) } },
    },
  });
  return account.id;
}
