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
import { AllocationService } from '../src/investments/allocation.service';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * The Allocation Engine (docs/12 §7).
 *
 * The acceptance criterion is exactness: **Σ derived exposures == pool exposure**, at scale.
 * A projection whose parts do not add up is either showing value to nobody or showing the same
 * value to two people, and because it is recomputed on every read, a discrepancy is permanent
 * rather than transient.
 */
describe('Investment allocation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let allocation: AllocationService;
  let redis: Redis;

  let baseAssetId: string;
  let btcAssetId: string;
  let strategyId: string;
  let strategySlug: string;
  let adminToken: string;

  const PASSWORD = 'Str0ng!Passw0rd#2026';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);
    allocation = app.get(AllocationService);
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
    baseAssetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'USDC' } },
        update: { isEnabled: true },
        create: { symbol: 'USDC', name: 'USD Coin', chainId: chain.id, decimals: 6, kind: 'TOKEN' },
      })
    ).id;
    btcAssetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'WBTC' } },
        update: { isEnabled: true },
        create: { symbol: 'WBTC', name: 'Wrapped BTC', chainId: chain.id, decimals: 8, kind: 'TOKEN' },
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

    strategySlug = `alloc-${randomUUID().slice(0, 8)}`;
    strategyId = (
      await prisma.investmentStrategy.create({
        data: {
          slug: strategySlug,
          name: 'AI Top 25',
          description: 'Systematic strategy.',
          baseAssetId,
          minimumInvestment: '1',
          status: StrategyStatus.OPEN,
        },
      })
    ).id;

    adminToken = await register(UserRole.ADMIN);
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(role: UserRole = UserRole.USER): Promise<string> {
    const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    if (role === UserRole.USER) return res.body.accessToken;
    await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(201);
    return login.body.accessToken;
  }

  /** Creates a holder directly — this suite tests apportionment, not the subscription flow. */
  async function holder(units: string, costBasis = units): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, passwordHash: 'x', status: UserStatus.ACTIVE },
    });
    await prisma.investmentPosition.create({
      data: { userId: user.id, strategyId, units, costBasis, hwmUnitPrice: '1' },
    });
    await prisma.investmentStrategy.update({
      where: { id: strategyId },
      data: { totalUnits: { increment: new Prisma.Decimal(units) } },
    });
    return user.id;
  }

  /** Puts an asset into the pool the way a trade or a settlement would. */
  async function fundPool(assetId: string, amount: string) {
    await ledger.post({
      type: LedgerTransactionType.TRADE,
      idempotencyKey: `poolfund:${randomUUID()}`,
      legs: [
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: `-${amount}` },
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount },
      ],
    });
  }

  async function poolBalance(assetId: string): Promise<Prisma.Decimal> {
    const balance = await prisma.balance.findFirst({
      where: { type: LedgerAccountType.STRATEGY_POOL, assetId, ledgerAccount: { strategyId } },
    });
    return balance?.amount ?? new Prisma.Decimal(0);
  }

  function sumLines(all: Map<string, Array<{ assetId: string; amount: string }>>, assetId: string) {
    let total = new Prisma.Decimal(0);
    for (const lines of all.values()) {
      for (const line of lines) {
        if (line.assetId === assetId) total = total.plus(line.amount);
      }
    }
    return total;
  }

  // ── Exactness ───────────────────────────────────────────────────────────

  describe('derived exposure sums exactly to the pool', () => {
    it('splits a pool that divides evenly', async () => {
      const a = await holder('100');
      const b = await holder('100');
      await fundPool(baseAssetId, '1000');

      const all = await allocation.exposureForAll(strategyId);
      expect(all.get(a)![0].amount).toBe('500');
      expect(all.get(b)![0].amount).toBe('500');
      expect(sumLines(all, baseAssetId).equals(new Prisma.Decimal('1000'))).toBe(true);
    });

    it('splits a pool that does not divide evenly, losing nothing', async () => {
      // Three equal holders of 1000 is the simplest case naive division gets wrong.
      await holder('1');
      await holder('1');
      await holder('1');
      await fundPool(baseAssetId, '1000');

      const all = await allocation.exposureForAll(strategyId);
      expect(sumLines(all, baseAssetId).equals(new Prisma.Decimal('1000'))).toBe(true);
    });

    it('splits every asset the pool holds, each exactly', async () => {
      await holder('7');
      await holder('11');
      await holder('13');
      await fundPool(baseAssetId, '10000.123456');
      await fundPool(btcAssetId, '3.14159265');

      const all = await allocation.exposureForAll(strategyId);

      expect(sumLines(all, baseAssetId).toFixed(6)).toBe('10000.123456');
      expect(sumLines(all, btcAssetId).toFixed(8)).toBe('3.14159265');
    });

    it('sums exactly across 10,000 investors — the MVP14 acceptance criterion', async () => {
      // Bulk-inserted rather than created through the API: this measures apportionment at
      // scale, and 10,000 registrations would measure the auth endpoint instead.
      const users = Array.from({ length: 10_000 }, (_, i) => ({
        id: `alloc-user-${i}`,
        email: `alloc-${i}-${randomUUID()}@example.com`,
        passwordHash: 'x',
        status: UserStatus.ACTIVE,
        referralCode: `ref-${i}-${randomUUID()}`,
      }));
      await prisma.user.createMany({ data: users });

      // Deliberately uneven weights, so almost every share is a repeating decimal.
      const positions = users.map((u, i) => ({
        userId: u.id,
        strategyId,
        units: new Prisma.Decimal(i + 1),
        costBasis: new Prisma.Decimal(i + 1),
        hwmUnitPrice: new Prisma.Decimal(1),
      }));
      await prisma.investmentPosition.createMany({ data: positions });

      const totalUnits = positions.reduce((acc, p) => acc.plus(p.units), new Prisma.Decimal(0));
      await prisma.investmentStrategy.update({
        where: { id: strategyId },
        data: { totalUnits },
      });

      await fundPool(baseAssetId, '7777777.777777');

      const started = Date.now();
      const all = await allocation.exposureForAll(strategyId);
      const elapsed = Date.now() - started;

      expect(all.size).toBe(10_000);
      expect(sumLines(all, baseAssetId).toFixed(6)).toBe('7777777.777777');
      // Not a benchmark, a guard: an allocation that takes minutes cannot be computed on read,
      // and the design depends on it being derived rather than stored.
      expect(elapsed).toBeLessThan(20_000);
    }, 120_000);

    it('gives a redeemed holder nothing rather than a rounding crumb', async () => {
      const active = await holder('100');
      const exited = await holder('0', '0');
      await fundPool(baseAssetId, '1000');

      const all = await allocation.exposureForAll(strategyId);
      expect(all.get(exited)).toBeUndefined();
      expect(all.get(active)![0].amount).toBe('1000');
    });

    it('reports nothing for an empty pool rather than zeros', async () => {
      await holder('100');
      const all = await allocation.exposureForAll(strategyId);
      expect(all.size).toBe(0);
    });
  });

  describe('the investor-facing view', () => {
    it('shows an investor only their own share, with weights', async () => {
      const user = await prisma.user.create({
        data: { email: `me-${randomUUID()}@example.com`, passwordHash: 'x', status: UserStatus.ACTIVE },
      });
      const login = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: `tok-${randomUUID()}@example.com`, password: PASSWORD })
        .expect(201);

      // Give the token's user a position, and someone else a larger one.
      await prisma.investmentPosition.create({
        data: { userId: login.body.user.id, strategyId, units: '25', costBasis: '25', hwmUnitPrice: '1' },
      });
      await prisma.investmentPosition.create({
        data: { userId: user.id, strategyId, units: '75', costBasis: '75', hwmUnitPrice: '1' },
      });
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { totalUnits: '100' } });
      await fundPool(baseAssetId, '4000');

      const res = await request(server())
        .get(`/api/v1/investments/me/positions/${strategySlug}/exposure`)
        .set(auth(login.body.accessToken))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ assetSymbol: 'USDC', amount: '1000', weightBps: 2500 });
    });

    it('returns nothing for a strategy the investor does not hold', async () => {
      const outsider = await register();
      await holder('100');
      await fundPool(baseAssetId, '1000');

      const res = await request(server())
        .get(`/api/v1/investments/me/positions/${strategySlug}/exposure`)
        .set(auth(outsider))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── Flow netting ────────────────────────────────────────────────────────

  describe('flow netting', () => {
    it('reports subscriptions in, redemptions out and the net', async () => {
      const investorId = await holder('1000');
      await fundPool(baseAssetId, '1000');

      await prisma.subscriptionRequest.create({
        data: {
          userId: investorId,
          strategyId,
          amount: '500',
          acceptanceId: 'test-acceptance',
          idempotencyKey: randomUUID(),
        },
      });
      await prisma.redemptionRequest.create({
        data: {
          userId: investorId,
          strategyId,
          units: '200',
          eligibleFrom: new Date(Date.now() - 1000),
          idempotencyKey: randomUUID(),
        },
      });

      const flows = await allocation.netFlows(strategyId);
      expect(flows.subscriptionsIn).toBe('500');
      expect(flows.redemptionsOut).toBe('200'); // 200 units at the implied 1.00
      expect(flows.net).toBe('300');
      expect(flows.cashShortfall).toBe('0');
    });

    it('warns the manager of a shortfall before settlement, not during it', async () => {
      // Discovering this at settlement means queueing a redemption the investor was told to
      // expect. The manager needs to know while there is still time to raise cash.
      const investorId = await holder('1000');
      await fundPool(baseAssetId, '1000');

      // The pool trades most of its cash into an unmarkable position.
      await ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `illiquid:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId: baseAssetId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount: '-900' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId: baseAssetId, type: LedgerAccountType.EXTERNAL, amount: '900' },
        ],
      });

      await prisma.redemptionRequest.create({
        data: {
          userId: investorId,
          strategyId,
          units: '1000',
          eligibleFrom: new Date(Date.now() - 1000),
          idempotencyKey: randomUUID(),
        },
      });

      const flows = await allocation.netFlows(strategyId);
      expect(Number(flows.poolCashAvailable)).toBe(100);
      expect(flows.dueRedemptions).toBe(1);
    });

    it('is visible to the manager and refused to an investor', async () => {
      await holder('100');
      await fundPool(baseAssetId, '1000');
      const investor = await register();

      await request(server())
        .get(`/api/v1/admin/investments/strategies/${strategyId}/flows`)
        .set(auth(adminToken))
        .expect(200);

      await request(server())
        .get(`/api/v1/admin/investments/strategies/${strategyId}/flows`)
        .set(auth(investor))
        .expect(403);
    });
  });

  // ── Wind-down ───────────────────────────────────────────────────────────

  describe('wind-down', () => {
    async function windingDown() {
      await prisma.investmentStrategy.update({
        where: { id: strategyId },
        data: { status: StrategyStatus.WINDING_DOWN },
      });
    }

    it('distributes pro rata, exactly, and closes the strategy', async () => {
      const a = await holder('1');
      const b = await holder('1');
      const c = await holder('1');
      await fundPool(baseAssetId, '1000');
      await windingDown();

      const res = await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/wind-down`)
        .set(auth(adminToken))
        .expect(201);

      expect(res.body.investorsPaid).toBe(3);
      expect(res.body.distributed).toBe('1000');

      // Nothing left behind and nothing conjured: the pool is empty and the three wallets hold
      // exactly what was in it.
      expect((await poolBalance(baseAssetId)).isZero()).toBe(true);

      let returned = new Prisma.Decimal(0);
      for (const userId of [a, b, c]) {
        const wallet = await prisma.balance.findFirstOrThrow({
          where: { userId, assetId: baseAssetId, type: LedgerAccountType.AVAILABLE },
        });
        returned = returned.plus(wallet.amount);
      }
      expect(returned.equals(new Prisma.Decimal('1000'))).toBe(true);

      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.status).toBe(StrategyStatus.CLOSED);
      expect(strategy.totalUnits.isZero()).toBe(true);
    });

    it('refuses while the strategy is still open', async () => {
      await holder('100');
      await fundPool(baseAssetId, '1000');

      const res = await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/wind-down`)
        .set(auth(adminToken))
        .expect(400);
      expect(res.body.error.code).toBe('NOT_WINDING_DOWN');
    });

    it('refuses while the pool still holds an unliquidated position', async () => {
      // Distributing cash while holding WBTC would hand investors part of what they own and
      // quietly keep the rest.
      await holder('100');
      await fundPool(baseAssetId, '1000');
      await fundPool(btcAssetId, '0.5');
      await windingDown();

      const res = await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/wind-down`)
        .set(auth(adminToken))
        .expect(400);
      expect(res.body.error.code).toBe('POSITIONS_NOT_LIQUIDATED');
      expect(res.body.error.message).toContain('WBTC');
    });

    it('takes no amount and no recipient from the operator', async () => {
      // The endpoint's shape is the control: there is nothing to tamper with in the request.
      const a = await holder('1');
      await holder('3');
      await fundPool(baseAssetId, '400');
      await windingDown();

      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/wind-down`)
        .set(auth(adminToken))
        .send({ amount: '999999', recipient: a })
        .expect(201);

      const wallet = await prisma.balance.findFirstOrThrow({
        where: { userId: a, assetId: baseAssetId, type: LedgerAccountType.AVAILABLE },
      });
      // The 1-unit holder of 4 total gets 100, not the 999999 the body asked for.
      expect(wallet.amount.equals(new Prisma.Decimal('100'))).toBe(true);
    });

    it('is refused to an investment manager — only an admin may close a fund', async () => {
      const manager = await register(UserRole.INVESTMENT_MANAGER);
      await holder('1');
      await fundPool(baseAssetId, '100');
      await windingDown();

      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/wind-down`)
        .set(auth(manager))
        .expect(403);
    });

    it('is idempotent — a repeated call cannot pay twice', async () => {
      const a = await holder('1');
      await fundPool(baseAssetId, '100');
      await windingDown();

      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/wind-down`)
        .set(auth(adminToken))
        .expect(201);

      // The strategy is CLOSED now, so the second call is refused by state — and even if it
      // were not, the ledger key would make the payment a no-op.
      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/wind-down`)
        .set(auth(adminToken))
        .expect(400);

      const wallet = await prisma.balance.findFirstOrThrow({
        where: { userId: a, assetId: baseAssetId, type: LedgerAccountType.AVAILABLE },
      });
      expect(wallet.amount.equals(new Prisma.Decimal('100'))).toBe(true);
    });
  });
});
