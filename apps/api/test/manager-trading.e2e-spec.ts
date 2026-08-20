import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  LedgerAccountType,
  LedgerTransactionType,
  Prisma,
  StrategyAssignmentRole,
  StrategyStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TradingService } from '../src/investments/trading.service';
import { resetDatabase } from './utils/reset-database';

/**
 * The Manager Trading Terminal (MVP18, docs/09-roadmap.md).
 *
 * Two acceptance criteria drive everything here: the terminal has no endpoint that accepts an
 * arbitrary transfer, and a trader assigned to strategy A cannot trade strategy B. Both are
 * proven against the live API and a real database, not asserted about the service in isolation.
 *
 * No ExecutionVenue exists yet (MVP22), so every fill here is a *simulated* one through
 * SANDBOX_TRADE_EXECUTION — see TradingService's own doc comment.
 */
describe('Manager Trading Terminal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let trading: TradingService;
  let redis: Redis;

  let usdcId: string;
  let wbtcId: string;
  let strategyId: string;
  let otherStrategyId: string;

  const PASSWORD = 'Str0ng!Passw0rd#2026';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);
    trading = app.get(TradingService);
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
    usdcId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'USDC' } },
        update: { isEnabled: true },
        create: { symbol: 'USDC', name: 'USD Coin', chainId: chain.id, decimals: 6, kind: 'TOKEN' },
      })
    ).id;
    wbtcId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'WBTC' } },
        update: { isEnabled: true },
        create: {
          symbol: 'WBTC',
          name: 'Wrapped Bitcoin',
          chainId: chain.id,
          decimals: 8,
          kind: 'TOKEN',
          coingeckoId: 'wrapped-bitcoin',
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

    await prisma.user.create({
      data: {
        id: PLATFORM_SYSTEM_USER_ID,
        email: PLATFORM_SYSTEM_USER_EMAIL,
        passwordHash: 'NOT_A_VALID_HASH__SYSTEM_ACCOUNT_CANNOT_LOG_IN',
        status: UserStatus.CLOSED,
      },
    });

    strategyId = (await createStrategy('strat-a')).id;
    otherStrategyId = (await createStrategy('strat-b')).id;
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createStrategy(slugPrefix: string) {
    return prisma.investmentStrategy.create({
      data: {
        slug: `${slugPrefix}-${randomUUID().slice(0, 8)}`,
        name: 'AI Top 25',
        description: 'Systematic strategy across the largest pairs.',
        baseAssetId: usdcId,
        minimumInvestment: '100',
        status: StrategyStatus.OPEN,
        openedAt: new Date(),
      },
    });
  }

  async function register(role: UserRole = UserRole.USER): Promise<{ token: string; id: string }> {
    const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const id = res.body.user.id as string;
    if (role === UserRole.USER) return { token: res.body.accessToken, id };
    await prisma.user.update({ where: { id }, data: { role } });
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(201);
    return { token: login.body.accessToken, id };
  }

  /** Gives a strategy pool some starting inventory, crossing EXTERNAL like a real trading gain would. */
  async function fundPool(strategyIdToFund: string, assetId: string, amount: string) {
    await ledger.post({
      type: LedgerTransactionType.TRADE,
      idempotencyKey: `fund:${randomUUID()}`,
      legs: [
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: `-${amount}` },
        {
          userId: PLATFORM_SYSTEM_USER_ID,
          assetId,
          type: LedgerAccountType.STRATEGY_POOL,
          strategyId: strategyIdToFund,
          amount,
        },
      ],
    });
  }

  async function poolBalance(strategyIdToRead: string, assetId: string): Promise<Prisma.Decimal> {
    const b = await prisma.balance.findFirst({
      where: { type: LedgerAccountType.STRATEGY_POOL, assetId, ledgerAccount: { strategyId: strategyIdToRead } },
    });
    return b?.amount ?? new Prisma.Decimal(0);
  }

  /** Writes the same Redis entry CoinGecko would, so a fill can be priced without the network. */
  async function seedMark(fromAssetId: string, toAssetId: string, price: string) {
    await redis.set(
      `mark:${fromAssetId}:${toAssetId}`,
      JSON.stringify({ price, source: 'coingecko', asOf: new Date().toISOString() }),
      'EX',
      300,
    );
  }

  async function assign(sid: string, userId: string, role: StrategyAssignmentRole, adminToken: string) {
    await request(server())
      .post(`/api/v1/admin/investments/strategies/${sid}/assignments`)
      .set(auth(adminToken))
      .send({ userId, role })
      .expect(201);
  }

  // ── Authorization scoping ──────────────────────────────────────────────

  describe('authorization', () => {
    it('a trader assigned to strategy A cannot see or trade strategy B', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);

      // Assigned strategy: readable.
      await request(server())
        .get(`/api/v1/manager/strategies/${strategyId}/positions`)
        .set(auth(trader.token))
        .expect(200);

      // Unassigned strategy: 403, not a leaked 404 or a silent empty view.
      const res = await request(server())
        .get(`/api/v1/manager/strategies/${otherStrategyId}/positions`)
        .set(auth(trader.token))
        .expect(403);
      expect(res.body.error?.code).toBe('NOT_ASSIGNED_TO_STRATEGY');

      await fundPool(otherStrategyId, wbtcId, '5');
      await request(server())
        .post(`/api/v1/manager/strategies/${otherStrategyId}/orders`)
        .set(auth(trader.token))
        .send({ fromAssetId: wbtcId, toAssetId: usdcId, type: 'MARKET', fromQuantity: '1' })
        .expect(403);

      // Strategy B's pool must be untouched.
      expect((await poolBalance(otherStrategyId, wbtcId)).toString()).toBe('5');
    });

    it('an unassigned TRADER cannot trade a strategy even with the right role', async () => {
      const trader = await register(UserRole.TRADER);
      await request(server())
        .get(`/api/v1/manager/strategies/${strategyId}/orders`)
        .set(auth(trader.token))
        .expect(403);
    });

    it('a plain USER cannot reach the terminal at all', async () => {
      const user = await register(UserRole.USER);
      await request(server())
        .get('/api/v1/manager/strategies')
        .set(auth(user.token))
        .expect(403);
    });

    it('ADMIN has oversight access without an explicit assignment', async () => {
      const admin = await register(UserRole.ADMIN);
      await request(server())
        .get(`/api/v1/manager/strategies/${strategyId}/positions`)
        .set(auth(admin.token))
        .expect(200);
    });
  });

  // ── No arbitrary transfer ────────────────────────────────────────────────

  describe('no arbitrary transfer', () => {
    it('the place-order DTO has no field for a destination account, and rejects one if sent', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);
      await fundPool(strategyId, wbtcId, '5');
      await seedMark(wbtcId, usdcId, '50000');

      // Extra, unknown fields (a destination user, a raw ledger account type) are rejected by
      // the global ValidationPipe's forbidNonWhitelisted, not silently dropped or honoured.
      await request(server())
        .post(`/api/v1/manager/strategies/${strategyId}/orders`)
        .set(auth(trader.token))
        .send({
          fromAssetId: wbtcId,
          toAssetId: usdcId,
          type: 'MARKET',
          fromQuantity: '1',
          toUserId: 'someone-else',
          destinationAccountType: 'AVAILABLE',
        })
        .expect(400);
    });

    it('a filled order only ever touches the two legs inside its own strategy pool', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);
      await fundPool(strategyId, wbtcId, '5');
      await seedMark(wbtcId, usdcId, '50000');

      const res = await request(server())
        .post(`/api/v1/manager/strategies/${strategyId}/orders`)
        .set(auth(trader.token))
        .send({ fromAssetId: wbtcId, toAssetId: usdcId, type: 'MARKET', fromQuantity: '1' })
        .expect(201);

      const order = await prisma.strategyOrder.findUniqueOrThrow({ where: { id: res.body.id } });
      const txn = await prisma.ledgerTransaction.findUniqueOrThrow({
        where: { id: order.ledgerTransactionId! },
        include: { entries: { include: { ledgerAccount: true } } },
      });
      for (const entry of txn.entries) {
        expect([LedgerAccountType.STRATEGY_POOL, LedgerAccountType.SANDBOX_TRADE_EXECUTION]).toContain(
          entry.ledgerAccount.type,
        );
        if (entry.ledgerAccount.type === LedgerAccountType.STRATEGY_POOL) {
          expect(entry.ledgerAccount.strategyId).toBe(strategyId);
        }
      }
    });
  });

  // ── Fill correctness ───────────────────────────────────────────────────

  describe('MARKET fills', () => {
    it('sells fromAsset for toAsset at the current mark, moving the pool by exactly the right amounts', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);
      await fundPool(strategyId, wbtcId, '5');
      await seedMark(wbtcId, usdcId, '50000');

      const res = await request(server())
        .post(`/api/v1/manager/strategies/${strategyId}/orders`)
        .set(auth(trader.token))
        .send({ fromAssetId: wbtcId, toAssetId: usdcId, type: 'MARKET', fromQuantity: '1' })
        .expect(201);

      expect(res.body.status).toBe('FILLED');
      expect(res.body.filledRate).toBe('50000');
      expect(res.body.toQuantity).toBe('50000');
      expect((await poolBalance(strategyId, wbtcId)).toString()).toBe('4');
      expect((await poolBalance(strategyId, usdcId)).toString()).toBe('50000');
    });

    it('rejects (does not silently drop) an order the pool cannot fund', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);
      await fundPool(strategyId, wbtcId, '1');
      await seedMark(wbtcId, usdcId, '50000');

      const res = await request(server())
        .post(`/api/v1/manager/strategies/${strategyId}/orders`)
        .set(auth(trader.token))
        .send({ fromAssetId: wbtcId, toAssetId: usdcId, type: 'MARKET', fromQuantity: '5' })
        .expect(201);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.rejectionReason).toMatch(/insufficient/i);
      // The attempt must not have moved anything.
      expect((await poolBalance(strategyId, wbtcId)).toString()).toBe('1');
    });

    it('ten concurrent orders against a balance that can only cover one leave the pool never negative', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);
      await fundPool(strategyId, wbtcId, '1');
      await seedMark(wbtcId, usdcId, '50000');

      const attempts = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(server())
            .post(`/api/v1/manager/strategies/${strategyId}/orders`)
            .set(auth(trader.token))
            .send({ fromAssetId: wbtcId, toAssetId: usdcId, type: 'MARKET', fromQuantity: '1' }),
        ),
      );

      const filled = attempts.filter((r) => r.body.status === 'FILLED');
      const rejected = attempts.filter((r) => r.body.status === 'REJECTED');
      expect(filled).toHaveLength(1);
      expect(rejected).toHaveLength(9);
      expect((await poolBalance(strategyId, wbtcId)).toString()).toBe('0');
      expect((await poolBalance(strategyId, usdcId)).toString()).toBe('50000');
    });
  });

  // ── LIMIT / STOP via the sweep ─────────────────────────────────────────

  describe('LIMIT and STOP orders', () => {
    it('a LIMIT order stays PENDING until the achievable rate rises to the trigger, then fills', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);
      await fundPool(strategyId, wbtcId, '1');
      await seedMark(wbtcId, usdcId, '50000');

      const placed = await request(server())
        .post(`/api/v1/manager/strategies/${strategyId}/orders`)
        .set(auth(trader.token))
        .send({ fromAssetId: wbtcId, toAssetId: usdcId, type: 'LIMIT', fromQuantity: '1', triggerPrice: '55000' })
        .expect(201);
      expect(placed.body.status).toBe('PENDING');

      await trading.sweepPendingOrders();
      expect(
        (await prisma.strategyOrder.findUniqueOrThrow({ where: { id: placed.body.id } })).status,
      ).toBe('PENDING');

      await seedMark(wbtcId, usdcId, '56000');
      await trading.sweepPendingOrders();
      const after = await prisma.strategyOrder.findUniqueOrThrow({ where: { id: placed.body.id } });
      expect(after.status).toBe('FILLED');
      expect(after.filledRate?.toString()).toBe('56000');
    });

    it('a STOP order fills once the achievable rate falls to or below the trigger', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);
      await fundPool(strategyId, wbtcId, '1');
      await seedMark(wbtcId, usdcId, '50000');

      const placed = await request(server())
        .post(`/api/v1/manager/strategies/${strategyId}/orders`)
        .set(auth(trader.token))
        .send({ fromAssetId: wbtcId, toAssetId: usdcId, type: 'STOP', fromQuantity: '1', triggerPrice: '45000' })
        .expect(201);

      await trading.sweepPendingOrders();
      expect(
        (await prisma.strategyOrder.findUniqueOrThrow({ where: { id: placed.body.id } })).status,
      ).toBe('PENDING');

      await seedMark(wbtcId, usdcId, '44000');
      await trading.sweepPendingOrders();
      const after = await prisma.strategyOrder.findUniqueOrThrow({ where: { id: placed.body.id } });
      expect(after.status).toBe('FILLED');
      expect(after.filledRate?.toString()).toBe('44000');
    });

    it('a PENDING order can be cancelled, and a cancelled order is never picked up by the sweep', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);
      await fundPool(strategyId, wbtcId, '1');
      await seedMark(wbtcId, usdcId, '50000');

      const placed = await request(server())
        .post(`/api/v1/manager/strategies/${strategyId}/orders`)
        .set(auth(trader.token))
        .send({ fromAssetId: wbtcId, toAssetId: usdcId, type: 'LIMIT', fromQuantity: '1', triggerPrice: '10' })
        .expect(201);

      await request(server())
        .post(`/api/v1/manager/strategies/${strategyId}/orders/${placed.body.id}/cancel`)
        .set(auth(trader.token))
        .expect(201);

      await trading.sweepPendingOrders();
      const after = await prisma.strategyOrder.findUniqueOrThrow({ where: { id: placed.body.id } });
      expect(after.status).toBe('CANCELLED');
      expect((await poolBalance(strategyId, wbtcId)).toString()).toBe('1');
    });
  });

  // ── Assignment management ──────────────────────────────────────────────

  describe('assignment management', () => {
    it('only ADMIN/SUPERADMIN can grant or revoke — INVESTMENT_MANAGER cannot, even though it manages the strategy elsewhere', async () => {
      const manager = await register(UserRole.INVESTMENT_MANAGER);
      const trader = await register(UserRole.TRADER);
      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/assignments`)
        .set(auth(manager.token))
        .send({ userId: trader.id, role: 'TRADER' })
        .expect(403);
    });

    it('revoking an assignment immediately blocks further trading', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assign(strategyId, trader.id, StrategyAssignmentRole.TRADER, admin.token);

      await request(server())
        .get(`/api/v1/manager/strategies/${strategyId}/positions`)
        .set(auth(trader.token))
        .expect(200);

      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/assignments/${trader.id}/revoke`)
        .set(auth(admin.token))
        .expect(201);

      await request(server())
        .get(`/api/v1/manager/strategies/${strategyId}/positions`)
        .set(auth(trader.token))
        .expect(403);
    });
  });
});
