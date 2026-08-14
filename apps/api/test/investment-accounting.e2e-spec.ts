import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LedgerAccountType, LedgerTransactionType, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './utils/reset-database';

/**
 * The ownership boundary — MVP11's whole point (docs/12 §1.1, docs/14).
 *
 * Every test here writes **raw SQL, bypassing the service layer entirely**. That is deliberate
 * and it is the only way this suite is worth anything: the claim being tested is not "the
 * application declines to move investor money to the platform" — application code can be
 * changed by anyone who can merge a commit. The claim is "the database refuses", which keeps
 * holding when the application layer is compromised, bypassed, or simply wrong.
 *
 * If one of these tests starts failing, the correct response is never to relax the constraint.
 */
describe('Investment accounting: the ownership boundary (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let assetId: string;
  let strategyId: string;
  let investorId: string;
  let poolAccountId: string;
  let revenueAccountId: string;
  let investorAccountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const chain = await prisma.chain.upsert({
      where: { key: 'ethereum' },
      update: {},
      create: {
        key: 'ethereum',
        name: 'Ethereum (test)',
        type: 'EVM',
        nativeAssetSymbol: 'ETH',
        confirmationsRequired: 3,
        isTestnet: true,
      },
    });

    assetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'USDC' } },
        update: { isEnabled: true },
        create: {
          symbol: 'USDC',
          name: 'USD Coin',
          chainId: chain.id,
          decimals: 6,
          kind: 'TOKEN',
          contractAddress: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);

    await prisma.user.create({
      data: {
        id: PLATFORM_SYSTEM_USER_ID,
        email: PLATFORM_SYSTEM_USER_EMAIL,
        passwordHash: 'NOT_A_VALID_HASH__SYSTEM_ACCOUNT_CANNOT_LOG_IN',
        status: UserStatus.CLOSED,
      },
    });

    investorId = (
      await prisma.user.create({
        data: {
          email: `investor-${randomUUID()}@example.com`,
          passwordHash: 'x',
          status: UserStatus.ACTIVE,
        },
      })
    ).id;

    strategyId = (
      await prisma.investmentStrategy.create({
        data: {
          slug: `strat-${randomUUID()}`,
          name: 'AI Top 25',
          description: 'Test strategy',
          baseAssetId: assetId,
          minimumInvestment: '100',
        },
      })
    ).id;

    poolAccountId = await createAccount(LedgerAccountType.STRATEGY_POOL, PLATFORM_SYSTEM_USER_ID, strategyId, '1000');
    revenueAccountId = await createAccount(LedgerAccountType.PLATFORM_REVENUE, PLATFORM_SYSTEM_USER_ID, null, '0');
    investorAccountId = await createAccount(LedgerAccountType.AVAILABLE, investorId, null, '5000');
  });

  async function createAccount(
    type: LedgerAccountType,
    userId: string,
    strategy: string | null,
    amount: string,
  ): Promise<string> {
    const account = await prisma.ledgerAccount.create({
      data: { userId, assetId, type, strategyId: strategy },
    });
    await prisma.balance.create({
      data: { ledgerAccountId: account.id, userId, assetId, type, amount },
    });
    return account.id;
  }

  /**
   * Writes a two-legged transaction straight to the tables, with no service in the path.
   * `SET CONSTRAINTS ALL IMMEDIATE` forces the deferred trigger to fire here rather than at
   * Prisma's own COMMIT, where its error would be swallowed — the same trap the ledger service
   * documents and works around.
   */
  async function rawPosting(
    type: LedgerTransactionType,
    legs: Array<{ accountId: string; amount: string }>,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const txId = `tx_${randomUUID()}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO ledger_transactions (id, type, "idempotencyKey", "createdAt")
         VALUES ($1, $2::"LedgerTransactionType", $3, now())`,
        txId,
        type,
        `raw-${randomUUID()}`,
      );
      for (const leg of legs) {
        await tx.$executeRawUnsafe(
          `INSERT INTO ledger_entries (id, "ledgerTransactionId", "ledgerAccountId", amount, "createdAt")
           VALUES ($1, $2, $3, $4::numeric, now())`,
          `e_${randomUUID()}`,
          txId,
          leg.accountId,
          leg.amount,
        );
      }
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    });
  }

  describe('value cannot cross from investor-owned to platform-owned', () => {
    // Each of these is the same movement — pool money into platform revenue — wearing a
    // different transaction type. Only the named fee types get through.
    const forbidden: LedgerTransactionType[] = [
      LedgerTransactionType.ADJUSTMENT,
      LedgerTransactionType.TRANSFER_INTERNAL,
      LedgerTransactionType.TRADE,
      LedgerTransactionType.DEPOSIT,
      LedgerTransactionType.WITHDRAWAL,
      LedgerTransactionType.SUBSCRIPTION_SETTLEMENT,
      LedgerTransactionType.REDEMPTION_SETTLEMENT,
      LedgerTransactionType.P2P_RELEASE,
    ];

    it.each(forbidden)('refuses to move pool funds to the platform as %s', async (type) => {
      await expect(
        rawPosting(type, [
          { accountId: poolAccountId, amount: '-500' },
          { accountId: revenueAccountId, amount: '500' },
        ]),
      ).rejects.toThrow(/investor-owned and platform-owned/);

      // And nothing was written — the whole transaction rolled back.
      const revenue = await prisma.balance.findFirstOrThrow({ where: { ledgerAccountId: revenueAccountId } });
      expect(revenue.amount.toString()).toBe('0');
      expect(await prisma.ledgerEntry.count()).toBe(0);
    });

    it('refuses to move a user wallet balance to the platform', async () => {
      // The same protection covers self-trading users, not only pool investors.
      await expect(
        rawPosting(LedgerTransactionType.ADJUSTMENT, [
          { accountId: investorAccountId, amount: '-5000' },
          { accountId: revenueAccountId, amount: '5000' },
        ]),
      ).rejects.toThrow(/investor-owned and platform-owned/);
    });

    it('refuses even when the platform leg is disguised among several legs', async () => {
      // A posting that mostly looks like an internal pool movement, with one small leg
      // siphoning to revenue. The trigger inspects every leg of the transaction, not just two.
      const secondPool = await prisma.investmentStrategy.create({
        data: {
          slug: `strat2-${randomUUID()}`,
          name: 'Second',
          description: 'd',
          baseAssetId: assetId,
          minimumInvestment: '100',
        },
      });
      const otherPoolAccount = await createAccount(
        LedgerAccountType.STRATEGY_POOL,
        PLATFORM_SYSTEM_USER_ID,
        secondPool.id,
        '0',
      );

      await expect(
        rawPosting(LedgerTransactionType.TRANSFER_INTERNAL, [
          { accountId: poolAccountId, amount: '-500' },
          { accountId: otherPoolAccount, amount: '499' },
          { accountId: revenueAccountId, amount: '1' },
        ]),
      ).rejects.toThrow(/investor-owned and platform-owned/);
    });
  });

  describe('the permitted crossings', () => {
    it('allows FEE_CRYSTALLISATION — the fee engine settling an accrued fee', async () => {
      await rawPosting(LedgerTransactionType.FEE_CRYSTALLISATION, [
        { accountId: poolAccountId, amount: '-500' },
        { accountId: revenueAccountId, amount: '500' },
      ]);

      expect(await prisma.ledgerEntry.count()).toBe(2);
    });

    it('allows TRADING_FEE — a venue fee on a fill', async () => {
      await rawPosting(LedgerTransactionType.TRADING_FEE, [
        { accountId: poolAccountId, amount: '-2.5' },
        { accountId: revenueAccountId, amount: '2.5' },
      ]);

      expect(await prisma.ledgerEntry.count()).toBe(2);
    });

    it('allows movement between two investor-owned accounts under any type', async () => {
      // A redemption is pool → the investor's own wallet. Both sides are investor-owned, so it
      // is not a boundary crossing at all and needs no exemption.
      await rawPosting(LedgerTransactionType.REDEMPTION_SETTLEMENT, [
        { accountId: poolAccountId, amount: '-800' },
        { accountId: investorAccountId, amount: '800' },
      ]);

      expect(await prisma.ledgerEntry.count()).toBe(2);
    });
  });

  describe('pool accounts cannot be confused with personal balances', () => {
    it('rejects a STRATEGY_POOL account with no strategy', async () => {
      await expect(
        prisma.ledgerAccount.create({
          data: { userId: investorId, assetId, type: LedgerAccountType.STRATEGY_POOL },
        }),
      ).rejects.toThrow(/pool_requires_strategy/);
    });

    it('rejects a user bucket that carries a strategy', async () => {
      // Otherwise "whose money is this?" would have two contradictory answers on one row.
      await expect(
        prisma.ledgerAccount.create({
          data: { userId: investorId, assetId, type: LedgerAccountType.AVAILABLE, strategyId },
        }),
      ).rejects.toThrow(/pool_requires_strategy/);
    });

    it('rejects a second pool account for the same (strategy, asset)', async () => {
      // Two rows would let a reconciliation read one and miss the other — reporting a shortfall
      // that is not real, or missing one that is.
      await expect(
        prisma.ledgerAccount.create({
          data: {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId,
            type: LedgerAccountType.STRATEGY_POOL,
            strategyId,
          },
        }),
        // Prisma surfaces a partial unique index by its columns rather than its name.
      ).rejects.toThrow(/Unique constraint failed.*strategyId.*assetId/s);
    });
  });

  describe('economic terms cannot leave their documented bounds', () => {
    it('accepts the platform default of a 50% profit share', async () => {
      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.perfFeeBps).toBe(5000);
      expect(strategy.mgmtFeeBps).toBe(0);
    });

    it('rejects a performance fee above the 50% ceiling', async () => {
      // The ceiling is not a policy preference — it is what stops a typo turning a 50% share
      // into a 500% one.
      await expect(
        prisma.investmentStrategy.update({ where: { id: strategyId }, data: { perfFeeBps: 5001 } }),
      ).rejects.toThrow(/perf_fee_range/);
    });

    it('rejects a max drawdown above the hard 10% platform cap', async () => {
      await expect(
        prisma.investmentStrategy.update({ where: { id: strategyId }, data: { maxDrawdownBps: 1001 } }),
      ).rejects.toThrow(/max_drawdown_ceiling/);
    });

    it('allows a stricter drawdown limit', async () => {
      const updated = await prisma.investmentStrategy.update({
        where: { id: strategyId },
        data: { maxDrawdownBps: 500 },
      });
      expect(updated.maxDrawdownBps).toBe(500);
    });
  });

  describe('valuation and fee history cannot be rewritten', () => {
    async function snapshot(navPerUnit: string) {
      return prisma.navSnapshot.create({
        data: {
          strategyId,
          poolNav: '1000',
          totalUnits: '1000',
          navPerUnit,
          markSource: 'test-fixture',
        },
      });
    }

    it('refuses to edit a NAV snapshot', async () => {
      // A NAV snapshot is what an investor was shown at a moment in time. Editing it changes
      // history; a correction is a new snapshot.
      const snap = await snapshot('1.0');
      await expect(
        prisma.navSnapshot.update({ where: { id: snap.id }, data: { navPerUnit: '99' } }),
      ).rejects.toThrow(/append-only/);
    });

    it('refuses to delete a NAV snapshot', async () => {
      const snap = await snapshot('1.0');
      await expect(prisma.navSnapshot.delete({ where: { id: snap.id } })).rejects.toThrow(/append-only/);
    });

    it('freezes the arithmetic behind a fee accrual', async () => {
      const position = await prisma.investmentPosition.create({
        data: { userId: investorId, strategyId, units: '1000', hwmUnitPrice: '1.0' },
      });
      const accrual = await prisma.feeAccrual.create({
        data: {
          positionId: position.id,
          kind: 'PERFORMANCE',
          periodStart: new Date('2026-01-01'),
          periodEnd: new Date('2026-03-31'),
          rateBps: 5000,
          baseAmount: '200',
          hwmUnitPrice: '1.0',
          navPerUnit: '1.2',
          amount: '100',
        },
      });

      // The rate an investor was charged at cannot be revised after the fact.
      await expect(
        prisma.feeAccrual.update({ where: { id: accrual.id }, data: { rateBps: 2000 } }),
      ).rejects.toThrow(/frozen at accrual time/);
      await expect(
        prisma.feeAccrual.update({ where: { id: accrual.id }, data: { amount: '10' } }),
      ).rejects.toThrow(/frozen at accrual time/);

      // But settling it is allowed — once.
      await prisma.feeAccrual.update({
        where: { id: accrual.id },
        data: { crystallisedAt: new Date(), crystallisedTransactionId: 'tx_x' },
      });
      await expect(
        prisma.feeAccrual.update({ where: { id: accrual.id }, data: { crystallisedAt: new Date() } }),
      ).rejects.toThrow(/already crystallised/);
    });
  });

  describe('the high water mark ratchets', () => {
    it('rises on profit and refuses to fall', async () => {
      // Under a 50% profit share, lowering an HWM would take half of a gain the investor has
      // already paid for once.
      const position = await prisma.investmentPosition.create({
        data: { userId: investorId, strategyId, units: '1000', hwmUnitPrice: '1.0' },
      });

      const raised = await prisma.investmentPosition.update({
        where: { id: position.id },
        data: { hwmUnitPrice: '1.5' },
      });
      expect(raised.hwmUnitPrice.toString()).toBe('1.5');

      await expect(
        prisma.investmentPosition.update({ where: { id: position.id }, data: { hwmUnitPrice: '1.4999' } }),
      ).rejects.toThrow(/may not decrease/);
    });
  });

  describe('one investor, one position per strategy', () => {
    it('refuses a duplicate position', async () => {
      // Two positions would make "how many units does this investor hold?" ambiguous, and the
      // Σ units == totalUnits invariant unverifiable.
      await prisma.investmentPosition.create({ data: { userId: investorId, strategyId } });
      await expect(
        prisma.investmentPosition.create({ data: { userId: investorId, strategyId } }),
      ).rejects.toThrow();
    });
  });
});
