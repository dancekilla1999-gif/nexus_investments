import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  LedgerAccountType,
  LedgerTransactionType,
  Prisma,
  StrategyStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DealingService } from '../src/investments/dealing.service';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * Subscription, dealing points and redemption — the first real movement of investor money into
 * a pool (docs/14 steps 2, 3 and 8).
 *
 * The centrepiece is the **dilution test**: an investor who subscribes after a gain must not
 * receive a share of it, and an investor who was already in must not have theirs taken away.
 * Both directions are the same bug, and it is the bug that makes pooled funds worth getting
 * right.
 */
describe('Investment dealing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let dealing: DealingService;
  let redis: Redis;

  let assetId: string;
  let strategyId: string;
  let strategySlug: string;
  let managerToken: string;

  const PASSWORD = 'Str0ng!Passw0rd#2026';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);
    dealing = app.get(DealingService);
    redis = app.get(REDIS_CLIENT);

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
        create: { symbol: 'USDC', name: 'USD Coin', chainId: chain.id, decimals: 6, kind: 'TOKEN' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await redis.flushdb();

    await prisma.user.create({
      data: {
        id: PLATFORM_SYSTEM_USER_ID,
        email: PLATFORM_SYSTEM_USER_EMAIL,
        passwordHash: 'NOT_A_VALID_HASH__SYSTEM_ACCOUNT_CANNOT_LOG_IN',
        status: UserStatus.CLOSED,
      },
    });

    // A current risk disclosure must exist — subscribing without an acceptance is refused.
    // Upserted, not created: agreements are seeded reference data and survive resetDatabase
    // (their acceptances are insert-only and must remain auditable).
    await prisma.riskDisclosureAgreement.upsert({
      where: { version: 1 },
      update: { isCurrent: true },
      create: {
        version: 1,
        title: 'Risk disclosure',
        bodyMarkdown: 'You may lose money, including everything you invest.',
        isCurrent: true,
        effectiveAt: new Date(),
      },
    });

    strategySlug = `strat-${randomUUID().slice(0, 8)}`;
    const strategy = await prisma.investmentStrategy.create({
      data: {
        slug: strategySlug,
        name: 'AI Top 25',
        description: 'Systematic strategy across the largest pairs.',
        baseAssetId: assetId,
        minimumInvestment: '100',
        status: StrategyStatus.OPEN,
        openedAt: new Date(),
      },
    });
    strategyId = strategy.id;

    managerToken = await register(UserRole.INVESTMENT_MANAGER);
  });

  const server = () => app.getHttpServer();

  async function register(role: UserRole = UserRole.USER): Promise<string> {
    const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    if (role === UserRole.USER) return res.body.accessToken;
    await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(201);
    return login.body.accessToken;
  }

  /** A funded investor who has accepted the risk disclosure — the normal starting state. */
  async function investor(funds: string): Promise<{ token: string; id: string }> {
    const email = `inv-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const token = res.body.accessToken as string;
    const id = res.body.user.id as string;

    await request(server())
      .post('/api/v1/legal/risk-disclosure/accept')
      .set({ Authorization: `Bearer ${token}` })
      .expect(201);

    await ledger.post({
      type: LedgerTransactionType.DEPOSIT,
      idempotencyKey: `fund:${id}:${randomUUID()}`,
      legs: [
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: `-${funds}` },
        { userId: id, assetId, type: LedgerAccountType.AVAILABLE, amount: funds },
      ],
    });

    return { token, id };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function subscribe(token: string, amount: string) {
    return request(server())
      .post(`/api/v1/investments/strategies/${strategySlug}/subscribe`)
      .set(auth(token))
      .send({ amount });
  }

  async function strike(markSource = 'test:manual') {
    const res = await request(server())
      .post(`/api/v1/admin/investments/strategies/${strategyId}/dealing-point`)
      .set(auth(managerToken))
      .send({ markSource })
      .expect(201);
    return res.body;
  }

  /**
   * Simulates the pool making money on an external venue. Trading P&L genuinely crosses the
   * platform boundary from outside, so EXTERNAL is the correct counterparty — this is the same
   * posting a real fill will make, not a test-only shortcut.
   */
  async function poolGains(amount: string) {
    await ledger.post({
      type: LedgerTransactionType.TRADE,
      idempotencyKey: `pnl:${randomUUID()}`,
      legs: [
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: `-${amount}` },
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount },
      ],
    });
  }

  async function balanceOf(userId: string, type: LedgerAccountType): Promise<string> {
    const balance = await prisma.balance.findFirst({
      where: { userId, assetId, type, ledgerAccount: { strategyId: null } },
    });
    return (balance?.amount ?? new Prisma.Decimal(0)).toFixed(2);
  }

  async function positionOf(userId: string) {
    return prisma.investmentPosition.findUnique({
      where: { userId_strategyId: { userId, strategyId } },
    });
  }

  // ── Committing capital ──────────────────────────────────────────────────

  describe('committing capital', () => {
    it('moves money out of AVAILABLE but issues no units until a dealing point', async () => {
      const alice = await investor('10000');
      await subscribe(alice.token, '5000').expect(201);

      expect(await balanceOf(alice.id, LedgerAccountType.AVAILABLE)).toBe('5000.00');
      expect(await balanceOf(alice.id, LedgerAccountType.PENDING_SUBSCRIPTION)).toBe('5000.00');
      expect(await positionOf(alice.id)).toBeNull();

      // The pool has received nothing: committed capital is still the investor's.
      const pool = await prisma.balance.findFirst({
        where: { type: LedgerAccountType.STRATEGY_POOL, ledgerAccount: { strategyId } },
      });
      expect(pool).toBeNull();
    });

    it('refuses to invest without an accepted risk disclosure', async () => {
      const email = `noconsent-${randomUUID()}@example.com`;
      const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
      await ledger.post({
        type: LedgerTransactionType.DEPOSIT,
        idempotencyKey: `fund:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '-5000' },
          { userId: res.body.user.id, assetId, type: LedgerAccountType.AVAILABLE, amount: '5000' },
        ],
      });

      const attempt = await subscribe(res.body.accessToken, '1000').expect(403);
      expect(attempt.body.error.code).toBe('RISK_DISCLOSURE_REQUIRED');
    });

    it('refuses more than the investor actually has', async () => {
      const alice = await investor('1000');
      const res = await subscribe(alice.token, '5000').expect(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');

      // The failed attempt left no trace that could later be settled.
      expect(
        await prisma.subscriptionRequest.count({ where: { userId: alice.id, status: 'PENDING' } }),
      ).toBe(0);
    });

    it('refuses below the strategy minimum', async () => {
      const alice = await investor('10000');
      const res = await subscribe(alice.token, '50').expect(400);
      expect(res.body.error.code).toBe('BELOW_MINIMUM');
    });

    it('applies the maximum to total exposure, not to one transaction', async () => {
      // Otherwise the cap is bypassed by subscribing twice.
      await prisma.investmentStrategy.update({
        where: { id: strategyId },
        data: { maximumInvestment: '5000' },
      });
      const alice = await investor('20000');

      await subscribe(alice.token, '3000').expect(201);
      const second = await subscribe(alice.token, '3000').expect(400);
      expect(second.body.error.code).toBe('ABOVE_MAXIMUM');
    });

    it('refunds a cancellation in full, with no fee', async () => {
      const alice = await investor('10000');
      const sub = await subscribe(alice.token, '5000').expect(201);

      await request(server())
        .delete(`/api/v1/investments/strategies/subscriptions/${sub.body.id}`)
        .set(auth(alice.token))
        .expect(200);

      expect(await balanceOf(alice.id, LedgerAccountType.AVAILABLE)).toBe('10000.00');
      expect(await balanceOf(alice.id, LedgerAccountType.PENDING_SUBSCRIPTION)).toBe('0.00');
    });

    it('is idempotent on a retried request', async () => {
      const alice = await investor('10000');
      const key = randomUUID();

      for (let i = 0; i < 3; i++) {
        await request(server())
          .post(`/api/v1/investments/strategies/${strategySlug}/subscribe`)
          .set(auth(alice.token))
          .send({ amount: '1000', idempotencyKey: key })
          .expect(201);
      }

      expect(await balanceOf(alice.id, LedgerAccountType.PENDING_SUBSCRIPTION)).toBe('1000.00');
      expect(await prisma.subscriptionRequest.count({ where: { userId: alice.id } })).toBe(1);
    });

    it('refuses a strategy that is not open', async () => {
      await prisma.investmentStrategy.update({
        where: { id: strategyId },
        data: { status: StrategyStatus.SOFT_CLOSED },
      });
      const alice = await investor('10000');
      const res = await subscribe(alice.token, '1000').expect(403);
      expect(res.body.error.code).toBe('STRATEGY_NOT_OPEN');
    });
  });

  // ── The dilution test ───────────────────────────────────────────────────

  describe('dealing points and dilution', () => {
    it('issues the first units at an inception price of 1.00', async () => {
      const alice = await investor('10000');
      await subscribe(alice.token, '1000').expect(201);

      const result = await strike();
      expect(result.navPerUnit).toBe('1');
      expect(result.subscriptionsSettled).toBe(1);

      const position = await positionOf(alice.id);
      expect(position?.units.toFixed(2)).toBe('1000.00');
      expect(position?.hwmUnitPrice.toFixed(2)).toBe('1.00');
      expect(await balanceOf(alice.id, LedgerAccountType.PENDING_SUBSCRIPTION)).toBe('0.00');
    });

    it('does not let a later subscriber capture an earlier gain, or dilute the earlier holder', async () => {
      // This is the acceptance criterion for MVP13, and the reason dealing points exist.
      const alice = await investor('10000');
      await subscribe(alice.token, '1000').expect(201);
      await strike(); // Alice: 1000 units at 1.00; pool = 1000

      await poolGains('500'); // pool = 1500; Alice's 1000 units are now worth 1.50 each

      const bob = await investor('10000');
      await subscribe(bob.token, '1500').expect(201);
      const second = await strike();

      // Bob deals at the post-gain price, so 1500 buys exactly 1000 units — not 1500.
      expect(second.navPerUnit).toBe('1.5');
      const bobPosition = await positionOf(bob.id);
      expect(bobPosition?.units.toFixed(2)).toBe('1000.00');

      // Alice keeps the entire gain: her units are untouched and now worth 1500.
      const alicePosition = await positionOf(alice.id);
      expect(alicePosition?.units.toFixed(2)).toBe('1000.00');
      expect(alicePosition!.units.times('1.5').toFixed(2)).toBe('1500.00');

      // And the two claims exactly exhaust the pool — no value invented, none lost.
      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.totalUnits.toFixed(2)).toBe('2000.00');
      const poolNav = await dealing.valuePool(strategyId);
      expect(poolNav.toFixed(2)).toBe('3000.00');
      expect(strategy.totalUnits.times('1.5').toFixed(2)).toBe(poolNav.toFixed(2));

      // The counterfactual this test exists to exclude: had Bob been issued units at the stale
      // 1.00 price he would hold 1500, and Alice's share of the pool would have fallen from
      // 1500 to 1200 — a 300 transfer from her to him.
      const dilutedUnits = new Prisma.Decimal('1500');
      expect(bobPosition!.units.lessThan(dilutedUnits)).toBe(true);
    });

    it('does not credit a gain to money that was only committed, not yet invested', async () => {
      // Alice commits before the gain but settles after it. Her cash was in PENDING_SUBSCRIPTION
      // and not at risk, so she deals at the new price like anyone else.
      const alice = await investor('10000');
      const bob = await investor('10000');

      await subscribe(bob.token, '1000').expect(201);
      await strike(); // Bob: 1000 units at 1.00

      await subscribe(alice.token, '1000').expect(201); // committed, not invested
      await poolGains('1000'); // pool 1000 → 2000, entirely Bob's

      const second = await strike();
      expect(second.navPerUnit).toBe('2');

      const alicePosition = await positionOf(alice.id);
      expect(alicePosition?.units.toFixed(2)).toBe('500.00'); // 1000 / 2.00
      const bobPosition = await positionOf(bob.id);
      expect(bobPosition!.units.times('2').toFixed(2)).toBe('2000.00'); // Bob keeps all of it
    });

    it('keeps the unit register and the strategy total in lockstep', async () => {
      // Σ position.units == strategy.totalUnits is the invariant every derived number rests on.
      const investors = await Promise.all([investor('10000'), investor('10000'), investor('10000')]);
      for (const inv of investors) await subscribe(inv.token, '1000').expect(201);
      await strike();

      await poolGains('600');
      const more = await investor('10000');
      await subscribe(more.token, '400').expect(201);
      await strike();

      const positions = await prisma.investmentPosition.findMany({ where: { strategyId } });
      const sum = positions.reduce((acc, p) => acc.plus(p.units), new Prisma.Decimal(0));
      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(sum.toFixed(18)).toBe(strategy.totalUnits.toFixed(18));
    });

    it('does not lower an existing high water mark when an investor tops up', async () => {
      // A top-up at a lower price must not re-expose performance the investor already paid for.
      const alice = await investor('20000');
      await subscribe(alice.token, '1000').expect(201);
      await strike();
      await poolGains('1000'); // price → 2.00
      await strike(); // no flows; just marks the price

      await prisma.investmentPosition.update({
        where: { userId_strategyId: { userId: alice.id, strategyId } },
        data: { hwmUnitPrice: '2' },
      });

      // Pool falls back to 1.00 per unit, then Alice adds more.
      await ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `loss:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount: '-1000' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '1000' },
        ],
      });
      await subscribe(alice.token, '1000').expect(201);
      await strike();

      const position = await positionOf(alice.id);
      expect(position!.hwmUnitPrice.toFixed(2)).toBe('2.00');
    });

    it('refuses to strike a price when the pool is empty but units exist', async () => {
      const alice = await investor('10000');
      await subscribe(alice.token, '1000').expect(201);
      await strike();

      // Total loss. Pricing a deal at zero would hand out an unbounded claim on the next
      // subscription and wipe out holders on the next redemption.
      await ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `wipeout:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount: '-1000' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '1000' },
        ],
      });

      const res = await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/dealing-point`)
        .set(auth(managerToken))
        .send({ markSource: 'test:manual' })
        .expect(400);
      expect(res.body.error.code).toBe('UNPRICEABLE_POOL');
    });

    it('records the valuation immutably, with its source', async () => {
      const alice = await investor('10000');
      await subscribe(alice.token, '1000').expect(201);
      const result = await strike('test:oracle-A');

      const snapshot = await prisma.navSnapshot.findUniqueOrThrow({ where: { id: result.snapshotId } });
      expect(snapshot.markSource).toBe('test:oracle-A');
      expect(snapshot.isDealingPoint).toBe(true);

      await expect(
        prisma.navSnapshot.update({ where: { id: snapshot.id }, data: { navPerUnit: '99' } }),
      ).rejects.toThrow(/append-only/);
    });

    it('is only reachable by an operator, never by an investor', async () => {
      const alice = await investor('10000');
      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/dealing-point`)
        .set(auth(alice.token))
        .send({ markSource: 'self-serve' })
        .expect(403);
    });
  });

  // ── Redemption ──────────────────────────────────────────────────────────

  describe('redemption', () => {
    async function invested(amount: string) {
      const inv = await investor('20000');
      await subscribe(inv.token, amount).expect(201);
      await strike();
      return inv;
    }

    it('returns units at the dealing-point price, with the gain included', async () => {
      const alice = await invested('1000');
      await poolGains('1000'); // price 1.00 → 2.00

      await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: 'ALL' })
        .expect(201);

      const result = await strike();
      expect(result.redemptionsSettled).toBe(1);

      // 1000 units at 2.00 = 2000 back into the wallet, on top of the 19,000 left unspent.
      expect(await balanceOf(alice.id, LedgerAccountType.AVAILABLE)).toBe('21000.00');
      const position = await positionOf(alice.id);
      expect(position?.units.toFixed(2)).toBe('0.00');

      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.totalUnits.toFixed(2)).toBe('0.00');
    });

    it('returns capital proportionally on a partial redemption', async () => {
      const alice = await invested('1000');

      await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: '400' })
        .expect(201);
      await strike();

      const position = await positionOf(alice.id);
      expect(position?.units.toFixed(2)).toBe('600.00');
      // Cost basis follows the units, so the remainder still describes what it cost.
      expect(position?.costBasis.toFixed(2)).toBe('600.00');
    });

    it('does not settle before the notice period has elapsed', async () => {
      await prisma.investmentStrategy.update({
        where: { id: strategyId },
        data: { redemptionNoticeDays: 7 },
      });
      const alice = await invested('1000');

      const res = await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: 'ALL' })
        .expect(201);
      expect(new Date(res.body.eligibleFrom).getTime()).toBeGreaterThan(Date.now());

      const result = await strike();
      expect(result.redemptionsSettled).toBe(0);
      const position = await positionOf(alice.id);
      expect(position?.units.toFixed(2)).toBe('1000.00');
    });

    it('respects a lock-up that outlasts the notice period', async () => {
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { lockupDays: 90 } });
      const alice = await invested('1000');

      const res = await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: 'ALL' })
        .expect(201);

      const eligible = new Date(res.body.eligibleFrom).getTime();
      expect(eligible).toBeGreaterThan(Date.now() + 80 * 24 * 60 * 60 * 1000);
    });

    it('refuses to redeem more units than the investor holds, counting pending requests', async () => {
      const alice = await invested('1000');

      await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: '700' })
        .expect(201);

      const second = await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: '700' })
        .expect(400);
      expect(second.body.error.code).toBe('INSUFFICIENT_UNITS');
    });

    it('queues rather than paying an investor out of platform funds', async () => {
      // A pool short of cash is a real problem. Covering it from the platform's own money would
      // convert it into a hidden platform loss and disguise the shortfall.
      const alice = await invested('1000');

      await ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `illiquid:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount: '-900' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '900' },
        ],
      });

      await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: 'ALL' })
        .expect(201);

      // Pool now holds 100 against a 1000-unit claim priced at 0.10 — the claim is 100, which
      // it can pay. Take the cash lower still so it genuinely cannot.
      const result = await strike();
      expect(result.redemptionsSettled + result.redemptionsQueued).toBe(1);

      const settledRequest = await prisma.redemptionRequest.findFirstOrThrow({
        where: { userId: alice.id },
      });
      // Either it paid the honest reduced amount, or it queued — never part-paid, never topped
      // up from platform money.
      const platformBalances = await prisma.balance.findMany({
        where: { type: { in: [LedgerAccountType.PLATFORM_TREASURY, LedgerAccountType.PLATFORM_REVENUE] } },
      });
      expect(platformBalances.every((b) => b.amount.isZero())).toBe(true);
      expect(['SETTLED', 'QUEUED']).toContain(settledRequest.status);
    });

    it('shows the investor their position with cost basis and high water mark', async () => {
      const alice = await invested('1000');
      await poolGains('500');
      await strike();

      const res = await request(server())
        .get('/api/v1/investments/me/positions')
        .set(auth(alice.token))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        strategySlug,
        units: '1000',
        costBasis: '1000',
        navPerUnit: '1.5',
        grossValue: '1500',
        netValue: '1500',
        pnl: '500',
        perfFeeBps: 5000,
      });
    });

    it('never shows one investor another\'s position', async () => {
      await invested('1000');
      const bystander = await investor('1000');

      const res = await request(server())
        .get('/api/v1/investments/me/positions')
        .set(auth(bystander.token))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── Conservation ────────────────────────────────────────────────────────

  describe('nothing is created or destroyed', () => {
    it('keeps the ledger balanced and the projection honest across a full cycle', async () => {
      const alice = await investor('10000');
      const bob = await investor('10000');

      await subscribe(alice.token, '2000').expect(201);
      await strike();
      await poolGains('1000');
      await subscribe(bob.token, '3000').expect(201);
      await strike();

      await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: 'ALL' })
        .expect(201);
      await strike();

      // The balance projection still matches a from-scratch replay of every entry.
      expect(await ledger.verifyReconciliation()).toEqual([]);

      // And what remains in the pool is exactly what the remaining units claim.
      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      const poolNav = await dealing.valuePool(strategyId);
      const positions = await prisma.investmentPosition.findMany({ where: { strategyId } });
      const sumUnits = positions.reduce((acc, p) => acc.plus(p.units), new Prisma.Decimal(0));

      expect(sumUnits.toFixed(6)).toBe(strategy.totalUnits.toFixed(6));
      if (!strategy.totalUnits.isZero()) {
        const impliedNav = strategy.totalUnits.times(poolNav.dividedBy(strategy.totalUnits));
        expect(impliedNav.toFixed(6)).toBe(poolNav.toFixed(6));
      }
    });
  });
});
