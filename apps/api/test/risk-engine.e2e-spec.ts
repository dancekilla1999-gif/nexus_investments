import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  LedgerAccountType,
  LedgerTransactionType,
  Prisma,
  RiskEventType,
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
import { RiskEngineService } from '../src/risk/risk-engine.service';
import { resetDatabase } from './utils/reset-database';

/**
 * The Risk Engine (MVP19, docs/09-roadmap.md, docs/12 §9). Acceptance: every check blocks an
 * order that violates it, proven per check; the 10% circuit breaker fires under a simulated
 * drawdown — both against the live API and a real database.
 */
describe('Risk Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let redis: Redis;
  let riskEngine: RiskEngineService;

  let usdcId: string;
  let wbtcId: string;
  let ethId: string;
  let strategyId: string;

  const PASSWORD = 'Str0ng!Passw0rd#2026';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);
    redis = app.get(REDIS_CLIENT);
    riskEngine = app.get(RiskEngineService);

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
        create: { symbol: 'WBTC', name: 'Wrapped Bitcoin', chainId: chain.id, decimals: 8, kind: 'TOKEN' },
      })
    ).id;
    ethId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'ETH2' } },
        update: { isEnabled: true },
        create: { symbol: 'ETH2', name: 'Test ETH', chainId: chain.id, decimals: 18, kind: 'TOKEN' },
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

    const strategy = await prisma.investmentStrategy.create({
      data: {
        slug: `strat-${randomUUID().slice(0, 8)}`,
        name: 'AI Top 25',
        description: 'Systematic strategy across the largest pairs.',
        baseAssetId: usdcId,
        minimumInvestment: '100',
        status: StrategyStatus.OPEN,
        openedAt: new Date(),
      },
    });
    strategyId = strategy.id;
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(role: UserRole = UserRole.USER): Promise<{ token: string; id: string }> {
    const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const id = res.body.user.id as string;
    if (role === UserRole.USER) return { token: res.body.accessToken, id };
    await prisma.user.update({ where: { id }, data: { role } });
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(201);
    return { token: login.body.accessToken, id };
  }

  async function assignTrader(userId: string, adminToken: string) {
    await request(server())
      .post(`/api/v1/admin/investments/strategies/${strategyId}/assignments`)
      .set(auth(adminToken))
      .send({ userId, role: StrategyAssignmentRole.TRADER })
      .expect(201);
  }

  async function fundPool(assetId: string, amount: string) {
    await ledger.post({
      type: LedgerTransactionType.TRADE,
      idempotencyKey: `fund:${randomUUID()}`,
      legs: [
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: `-${amount}` },
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount },
      ],
    });
  }

  async function poolBalance(assetId: string): Promise<Prisma.Decimal> {
    const b = await prisma.balance.findFirst({
      where: { type: LedgerAccountType.STRATEGY_POOL, assetId, ledgerAccount: { strategyId } },
    });
    return b?.amount ?? new Prisma.Decimal(0);
  }

  async function seedMark(fromAssetId: string, toAssetId: string, price: string) {
    await redis.set(
      `mark:${fromAssetId}:${toAssetId}`,
      JSON.stringify({ price, source: 'coingecko', asOf: new Date().toISOString() }),
      'EX',
      300,
    );
  }

  function placeOrder(token: string, body: Record<string, unknown>) {
    return request(server())
      .post(`/api/v1/manager/strategies/${strategyId}/orders`)
      .set(auth(token))
      .send(body);
  }

  // ── Mandate check ────────────────────────────────────────────────────

  describe('mandate check', () => {
    it('blocks an order into an asset not on the strategy\'s allow-list', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await prisma.strategyAllowedAsset.create({ data: { strategyId, assetId: wbtcId } });
      await fundPool(ethId, '5');
      await seedMark(ethId, usdcId, '3000');

      const res = await placeOrder(trader.token, {
        fromAssetId: ethId,
        toAssetId: usdcId,
        type: 'MARKET',
        fromQuantity: '1',
      }).expect(201);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.rejectionReason).toMatch(/ASSET_NOT_MANDATED/);
      expect((await poolBalance(ethId)).toString()).toBe('5');
    });

    it('an empty allow-list permits any enabled asset (unchanged MVP18 behaviour)', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await fundPool(wbtcId, '1');
      await seedMark(wbtcId, usdcId, '50000');

      const res = await placeOrder(trader.token, {
        fromAssetId: wbtcId,
        toAssetId: usdcId,
        type: 'MARKET',
        fromQuantity: '1',
      }).expect(201);

      expect(res.body.status).toBe('FILLED');
    });

    it('the strategy\'s own base asset is always implicitly allowed', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await prisma.strategyAllowedAsset.create({ data: { strategyId, assetId: wbtcId } });
      await fundPool(wbtcId, '1');
      await seedMark(wbtcId, usdcId, '50000');

      // usdcId (baseAsset) is not explicitly in the allow-list, only wbtcId is — must still work.
      const res = await placeOrder(trader.token, {
        fromAssetId: wbtcId,
        toAssetId: usdcId,
        type: 'MARKET',
        fromQuantity: '1',
      }).expect(201);

      expect(res.body.status).toBe('FILLED');
    });
  });

  // ── Exposure check ───────────────────────────────────────────────────

  describe('exposure check', () => {
    it('blocks an order that would push one asset above maxAssetExposureBps', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { maxAssetExposureBps: 2000 } });
      await fundPool(usdcId, '10000');
      await seedMark(usdcId, wbtcId, '0.00002'); // 1 USDC = 0.00002 WBTC (i.e. 1 WBTC = 50000 USDC)

      // Buying 3000 USDC worth of WBTC would be 30% of the 10000 USDC pool — above the 20% cap.
      const res = await placeOrder(trader.token, {
        fromAssetId: usdcId,
        toAssetId: wbtcId,
        type: 'MARKET',
        fromQuantity: '3000',
      }).expect(201);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.rejectionReason).toMatch(/EXPOSURE_LIMIT/);
    });

    it('allows an order that stays within the exposure cap', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { maxAssetExposureBps: 2000 } });
      await fundPool(usdcId, '10000');
      await seedMark(usdcId, wbtcId, '0.00002');

      const res = await placeOrder(trader.token, {
        fromAssetId: usdcId,
        toAssetId: wbtcId,
        type: 'MARKET',
        fromQuantity: '1000',
      }).expect(201);

      expect(res.body.status).toBe('FILLED');
    });
  });

  // ── Drawdown / circuit breaker ───────────────────────────────────────

  describe('drawdown circuit breaker', () => {
    async function primeDrawdown(peakNavPerUnit: string, currentPoolUsdc: string) {
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { totalUnits: '100' } });
      await prisma.navSnapshot.create({
        data: {
          strategyId,
          poolNav: (Number(peakNavPerUnit) * 100).toString(),
          totalUnits: '100',
          navPerUnit: peakNavPerUnit,
          markSource: 'test-fixture',
          struckAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      await fundPool(usdcId, currentPoolUsdc);
    }

    it('a 10% drawdown trips the breaker, blocks a risk-increasing order, and files a high-severity RiskEvent', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      // Peak navPerUnit = 10 (1000 poolNav / 100 units). Current pool = 850 USDC / 100 units =
      // 8.5 navPerUnit — an ~15% drop, past the default 10% (1000bps) ceiling.
      await primeDrawdown('10', '850');
      await seedMark(usdcId, wbtcId, '0.00002');

      const res = await placeOrder(trader.token, {
        fromAssetId: usdcId,
        toAssetId: wbtcId,
        type: 'MARKET',
        fromQuantity: '100',
      }).expect(201);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.rejectionReason).toMatch(/CIRCUIT_BROKEN/);

      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.status).toBe(StrategyStatus.CIRCUIT_BROKEN);

      const events = await prisma.riskEvent.findMany({ where: { type: RiskEventType.STRATEGY_CIRCUIT_BREAKER } });
      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe(5);
    });

    it('still allows a de-risking order (selling back to the base asset) once circuit-broken', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await primeDrawdown('10', '850');
      await fundPool(wbtcId, '1'); // something to sell back to base
      await seedMark(usdcId, wbtcId, '0.00002');
      await seedMark(wbtcId, usdcId, '50000');

      // Trip it first with an unrelated risk-increasing attempt.
      await placeOrder(trader.token, { fromAssetId: usdcId, toAssetId: wbtcId, type: 'MARKET', fromQuantity: '10' });

      const deRisk = await placeOrder(trader.token, {
        fromAssetId: wbtcId,
        toAssetId: usdcId, // strategy's own base asset
        type: 'MARKET',
        fromQuantity: '1',
      }).expect(201);

      expect(deRisk.body.status).toBe('FILLED');
    });

    it('the scheduled sweep trips the breaker on its own, with no order ever placed', async () => {
      await primeDrawdown('10', '850');

      await riskEngine.sweepDrawdownChecks();

      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.status).toBe(StrategyStatus.CIRCUIT_BROKEN);
      const events = await prisma.riskEvent.findMany({ where: { type: RiskEventType.STRATEGY_CIRCUIT_BREAKER } });
      expect(events).toHaveLength(1);
    });

    it('does not file a second RiskEvent for an already-tripped breaker', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await primeDrawdown('10', '850');
      await seedMark(usdcId, wbtcId, '0.00002');

      await placeOrder(trader.token, { fromAssetId: usdcId, toAssetId: wbtcId, type: 'MARKET', fromQuantity: '10' });
      await placeOrder(trader.token, { fromAssetId: usdcId, toAssetId: wbtcId, type: 'MARKET', fromQuantity: '20' });

      const events = await prisma.riskEvent.findMany({ where: { type: RiskEventType.STRATEGY_CIRCUIT_BREAKER } });
      expect(events).toHaveLength(1);
    });

  });

  // ── Daily loss limit ─────────────────────────────────────────────────

  describe('daily loss limit', () => {
    it('blocks an order once the pool has lost more than dailyLossLimitBps in ~24h', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { dailyLossLimitBps: 500 } }); // 5%
      await prisma.navSnapshot.create({
        data: {
          strategyId,
          poolNav: '10000',
          totalUnits: '1',
          navPerUnit: '10000',
          markSource: 'test-fixture',
          struckAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        },
      });
      await fundPool(usdcId, '9000'); // a 10% drop from the 24h-old 10000 baseline
      await seedMark(usdcId, wbtcId, '0.00002');

      const res = await placeOrder(trader.token, {
        fromAssetId: usdcId,
        toAssetId: wbtcId,
        type: 'MARKET',
        fromQuantity: '100',
      }).expect(201);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.rejectionReason).toMatch(/DAILY_LOSS_LIMIT/);

      const events = await prisma.riskEvent.findMany({ where: { type: RiskEventType.STRATEGY_RISK_LIMIT_BREACH } });
      expect(events).toHaveLength(1);
    });

    it('unconfigured dailyLossLimitBps (null) means no check', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await prisma.navSnapshot.create({
        data: {
          strategyId,
          poolNav: '10000',
          totalUnits: '1',
          navPerUnit: '10000',
          markSource: 'test-fixture',
          struckAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        },
      });
      await fundPool(usdcId, '5000'); // a 50% drop, but no limit is configured
      await seedMark(usdcId, wbtcId, '0.00002');

      const res = await placeOrder(trader.token, {
        fromAssetId: usdcId,
        toAssetId: wbtcId,
        type: 'MARKET',
        fromQuantity: '100',
      }).expect(201);

      expect(res.body.status).toBe('FILLED');
    });
  });

  // ── Global emergency pause ───────────────────────────────────────────

  describe('global emergency pause', () => {
    it('blocks every order platform-wide while active, and resumes once cleared', async () => {
      const admin = await register(UserRole.ADMIN);
      const trader = await register(UserRole.TRADER);
      await assignTrader(trader.id, admin.token);
      await fundPool(wbtcId, '1');
      await seedMark(wbtcId, usdcId, '50000');

      await request(server())
        .post('/api/v1/risk/emergency-controls/GLOBAL_TRADING_PAUSE')
        .set(auth(admin.token))
        .send({ isActive: true, reason: 'Testing the kill switch.' })
        .expect(201);

      const blocked = await placeOrder(trader.token, {
        fromAssetId: wbtcId,
        toAssetId: usdcId,
        type: 'MARKET',
        fromQuantity: '1',
      }).expect(201);
      expect(blocked.body.status).toBe('REJECTED');
      expect(blocked.body.rejectionReason).toMatch(/GLOBAL_TRADING_PAUSE/);

      await request(server())
        .post('/api/v1/risk/emergency-controls/GLOBAL_TRADING_PAUSE')
        .set(auth(admin.token))
        .send({ isActive: false, reason: 'Investigation complete.' })
        .expect(201);

      const resumed = await placeOrder(trader.token, {
        fromAssetId: wbtcId,
        toAssetId: usdcId,
        type: 'MARKET',
        fromQuantity: '1',
      }).expect(201);
      expect(resumed.body.status).toBe('FILLED');
    });

    it('rejects an unrecognised control key rather than silently creating it', async () => {
      const admin = await register(UserRole.ADMIN);
      await request(server())
        .post('/api/v1/risk/emergency-controls/NOT_A_REAL_SWITCH')
        .set(auth(admin.token))
        .send({ isActive: true, reason: 'typo test' })
        .expect(400);
    });

    it('a TRADER cannot flip the kill switch', async () => {
      const trader = await register(UserRole.TRADER);
      await request(server())
        .post('/api/v1/risk/emergency-controls/GLOBAL_TRADING_PAUSE')
        .set(auth(trader.token))
        .send({ isActive: true, reason: 'should not work' })
        .expect(403);
    });
  });

  // ── Dual control on risk-limit changes ───────────────────────────────

  describe('dual control on risk-limit changes', () => {
    it('a proposal does not take effect until a different RISK_OPS user approves it', async () => {
      const riskOpsA = await register(UserRole.RISK_OPS);
      const riskOpsB = await register(UserRole.RISK_OPS);

      const proposed = await request(server())
        .post(`/api/v1/risk/strategies/${strategyId}/limit-changes`)
        .set(auth(riskOpsA.token))
        .send({ field: 'MAX_DRAWDOWN_BPS', newValue: 500 })
        .expect(201);
      expect(proposed.body.status).toBe('PENDING');

      let strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.maxDrawdownBps).toBe(1000); // unchanged while pending

      await request(server())
        .post(`/api/v1/risk/limit-changes/${proposed.body.id}/approve`)
        .set(auth(riskOpsA.token))
        .expect(403);

      await request(server())
        .post(`/api/v1/risk/limit-changes/${proposed.body.id}/approve`)
        .set(auth(riskOpsB.token))
        .expect(201);

      strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.maxDrawdownBps).toBe(500);
    });

    it('cannot propose maxDrawdownBps above the 1000 (10%) platform ceiling', async () => {
      const riskOps = await register(UserRole.RISK_OPS);
      await request(server())
        .post(`/api/v1/risk/strategies/${strategyId}/limit-changes`)
        .set(auth(riskOps.token))
        .send({ field: 'MAX_DRAWDOWN_BPS', newValue: 1500 })
        .expect(400);
    });

    it('a different RISK_OPS user can formally reject a proposal, leaving the limit unchanged', async () => {
      const riskOpsA = await register(UserRole.RISK_OPS);
      const riskOpsB = await register(UserRole.RISK_OPS);
      const proposed = await request(server())
        .post(`/api/v1/risk/strategies/${strategyId}/limit-changes`)
        .set(auth(riskOpsA.token))
        .send({ field: 'MAX_DRAWDOWN_BPS', newValue: 500 })
        .expect(201);

      await request(server())
        .post(`/api/v1/risk/limit-changes/${proposed.body.id}/reject`)
        .set(auth(riskOpsB.token))
        .send({ reason: 'Not justified yet.' })
        .expect(201);

      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.maxDrawdownBps).toBe(1000);
    });

    it('the proposer can cancel their own pending proposal', async () => {
      const riskOps = await register(UserRole.RISK_OPS);
      const proposed = await request(server())
        .post(`/api/v1/risk/strategies/${strategyId}/limit-changes`)
        .set(auth(riskOps.token))
        .send({ field: 'MAX_DRAWDOWN_BPS', newValue: 500 })
        .expect(201);

      await request(server())
        .post(`/api/v1/risk/limit-changes/${proposed.body.id}/cancel`)
        .set(auth(riskOps.token))
        .expect(201);

      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      expect(strategy.maxDrawdownBps).toBe(1000);
    });

    it('the plain strategy-update endpoint can no longer change maxDrawdownBps at all', async () => {
      const manager = await register(UserRole.INVESTMENT_MANAGER);
      const res = await request(server())
        .patch(`/api/v1/admin/investments/strategies/${strategyId}`)
        .set(auth(manager.token))
        .send({ maxDrawdownBps: 200 })
        .expect(400); // forbidNonWhitelisted: the field no longer exists on UpdateStrategyDto

      expect(JSON.stringify(res.body)).toMatch(/maxDrawdownBps/);
    });

    it('the database itself refuses a self-approved change even bypassing the service', async () => {
      const riskOps = await register(UserRole.RISK_OPS);
      const request_ = await prisma.riskLimitChangeRequest.create({
        data: {
          strategyId,
          field: 'MAX_DRAWDOWN_BPS',
          oldValue: 1000,
          newValue: 500,
          proposedByUserId: riskOps.id,
        },
      });

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE risk_limit_change_requests SET "approvedByUserId" = $1, status = 'APPROVED' WHERE id = $2`,
          riskOps.id,
          request_.id,
        ),
      ).rejects.toThrow();
    });
  });
});
