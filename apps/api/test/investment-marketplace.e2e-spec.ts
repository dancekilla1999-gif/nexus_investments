import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StrategyStatus, UserRole, UserStatus } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * The marketplace and the two gates that decide whether a product may take money (docs/12 §3):
 * a passing backtest, and a max drawdown within the platform's hard 10% ceiling. Plus the
 * forbidden-claims gate, which is the difference between a marketing page and a mis-selling
 * case.
 *
 * Every gate is tested by trying to get past it through the API, not by asserting the service
 * has a check in it.
 */
describe('Investment marketplace (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;

  let assetId: string;
  let managerToken: string;
  let investorToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
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
    managerToken = await registerAs(UserRole.INVESTMENT_MANAGER);
    investorToken = await registerAs(UserRole.USER);
  });

  const server = () => app.getHttpServer();
  const PASSWORD = 'Str0ng!Passw0rd#2026';

  async function registerAs(role: UserRole): Promise<string> {
    const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    if (role === UserRole.USER) return res.body.accessToken;

    // The role is baked into the JWT at issue time, so re-authenticate after promoting.
    await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(201);
    return login.body.accessToken;
  }

  const asManager = () => ({ Authorization: `Bearer ${managerToken}` });
  const asInvestor = () => ({ Authorization: `Bearer ${investorToken}` });

  function validStrategy(overrides: Record<string, unknown> = {}) {
    return {
      slug: `strat-${randomUUID().slice(0, 8)}`,
      name: 'AI Top 25',
      description: 'A systematic strategy across the 25 largest pairs by market capitalisation.',
      thesis: 'Momentum persists over weekly horizons in liquid crypto majors.',
      baseAssetId: assetId,
      minimumInvestment: '1000',
      lockupDays: 30,
      redemptionNoticeDays: 7,
      ...overrides,
    };
  }

  async function createStrategy(overrides: Record<string, unknown> = {}) {
    const res = await request(server())
      .post('/api/v1/admin/investments/strategies')
      .set(asManager())
      .send(validStrategy(overrides))
      .expect(201);
    return res.body;
  }

  /** Gives a strategy a validated trading strategy with a backtest at the given drawdown. */
  async function attachBacktest(strategyId: string, maxDrawdownBps: number) {
    const trading = await prisma.tradingStrategy.create({
      data: { name: `ts-${randomUUID().slice(0, 8)}`, version: 1, kind: 'RULE_BASED', configJson: {} },
    });
    const run = await prisma.backtestRun.create({
      data: {
        strategyId: trading.id,
        dateRangeStart: new Date('2024-01-01'),
        dateRangeEnd: new Date('2025-01-01'),
        status: 'COMPLETED',
        // The universe is snapshotted at run time so a later top-25 reshuffle cannot rewrite
        // what was tested — survivorship-bias control from docs/11.
        pairUniverseSnapshotJson: { pairs: ['BTCUSDT', 'ETHUSDT'], capturedAt: '2024-01-01' },
      },
    });
    await prisma.backtestResult.create({
      data: { backtestRunId: run.id, totalTrades: 420, winRate: 0.58, avgR: 0.31, maxDrawdownBps },
    });
    await prisma.investmentStrategy.update({
      where: { id: strategyId },
      data: { tradingStrategyId: trading.id },
    });
    return trading.id;
  }

  describe('creation and configuration', () => {
    it('creates a strategy in DRAFT with the platform 50/50 profit share as the default', async () => {
      const created = await createStrategy();

      expect(created.status).toBe(StrategyStatus.DRAFT);
      expect(created.perfFeeBps).toBe(5000);
      expect(created.mgmtFeeBps).toBe(0);
      expect(created.maxDrawdownBps).toBe(1000);
      expect(created.canOpen).toBe(false);
      expect(created.blockingReason).toMatch(/backtest/i);
    });

    it('refuses a drawdown limit looser than the 10% platform ceiling', async () => {
      const res = await request(server())
        .post('/api/v1/admin/investments/strategies')
        .set(asManager())
        .send(validStrategy({ maxDrawdownBps: 1500 }))
        .expect(400);

      expect(JSON.stringify(res.body)).toMatch(/maxDrawdownBps|between 1 and 1000/i);
    });

    it('accepts a stricter drawdown limit', async () => {
      const created = await createStrategy({ maxDrawdownBps: 400 });
      expect(created.maxDrawdownBps).toBe(400);
    });

    it('refuses a performance fee above 50%', async () => {
      await request(server())
        .post('/api/v1/admin/investments/strategies')
        .set(asManager())
        .send(validStrategy({ perfFeeBps: 6000 }))
        .expect(400);
    });

    it('refuses the unimplemented segregated custody model rather than pretending it works', async () => {
      const res = await request(server())
        .post('/api/v1/admin/investments/strategies')
        .set(asManager())
        .send(validStrategy({ custodyModel: 'SEGREGATED_COPY' }))
        .expect(400);

      expect(res.body.error.code).toBe('CUSTODY_MODEL_NOT_IMPLEMENTED');
    });

    it('freezes economic terms once an investor holds the strategy', async () => {
      // The terms are what the investor subscribed to. Changing them silently underneath is a
      // different act from configuring a draft and needs its own consented flow.
      const created = await createStrategy();
      const investor = await prisma.user.create({
        data: { email: `inv-${randomUUID()}@example.com`, passwordHash: 'x', status: UserStatus.ACTIVE },
      });
      await prisma.investmentPosition.create({
        data: { userId: investor.id, strategyId: created.id, units: '100' },
      });

      const res = await request(server())
        .patch(`/api/v1/admin/investments/strategies/${created.id}`)
        .set(asManager())
        .send({ perfFeeBps: 1000 })
        .expect(403);
      expect(res.body.error.code).toBe('TERMS_LOCKED');

      // Descriptive copy is still editable — that is not an economic term.
      await request(server())
        .patch(`/api/v1/admin/investments/strategies/${created.id}`)
        .set(asManager())
        .send({ description: 'An updated but equally honest description of the approach.' })
        .expect(200);
    });
  });

  describe('the forbidden-claims gate', () => {
    it.each([
      ['description', 'This strategy offers guaranteed profit every single month.'],
      ['description', 'Гарантированная прибыль каждый месяц, без риска.'],
      ['thesis', 'A completely risk-free approach to crypto exposure.'],
      ['name', '100% accurate signals'],
    ])('refuses to create a strategy whose %s promises an outcome', async (field, text) => {
      const res = await request(server())
        .post('/api/v1/admin/investments/strategies')
        .set(asManager())
        .send(validStrategy({ [field]: text }))
        .expect(400);

      expect(res.body.error.code).toBe('FORBIDDEN_CLAIM');
      expect(res.body.error.details.some((d: { field: string }) => d.field === field)).toBe(true);
    });

    it('allows the required disclaimer, which is the negated form of the same words', async () => {
      const created = await createStrategy({
        description:
          'A systematic momentum strategy. Past results do not guarantee future returns, and you may lose your entire investment.',
      });
      expect(created.status).toBe(StrategyStatus.DRAFT);
    });

    it('re-checks copy at publication, not only at creation', async () => {
      // Copy can be edited after creation; the last point before real money is exposed to it
      // is the moment of opening.
      const created = await createStrategy();
      await attachBacktest(created.id, 600);
      await prisma.investmentStrategy.update({
        where: { id: created.id },
        data: { description: 'Risk-free returns, guaranteed profit.' },
      });

      const res = await request(server())
        .post(`/api/v1/admin/investments/strategies/${created.id}/open`)
        .set(asManager())
        .expect(400);
      expect(res.body.error.code).toBe('FORBIDDEN_CLAIM');
    });
  });

  describe('the backtest gate', () => {
    it('refuses to open a strategy with no backtest at all', async () => {
      const created = await createStrategy();

      const res = await request(server())
        .post(`/api/v1/admin/investments/strategies/${created.id}/open`)
        .set(asManager())
        .expect(403);

      expect(res.body.error.code).toBe('BACKTEST_REQUIRED');
      const after = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.status).toBe(StrategyStatus.DRAFT);
    });

    it('refuses a backtest that drew down further than the strategy advertises', async () => {
      // A strategy cannot advertise a 10% limit on the strength of a backtest that lost 30%.
      const created = await createStrategy({ maxDrawdownBps: 1000 });
      await attachBacktest(created.id, 3000);

      const res = await request(server())
        .post(`/api/v1/admin/investments/strategies/${created.id}/open`)
        .set(asManager())
        .expect(403);
      expect(res.body.error.code).toBe('BACKTEST_REQUIRED');
    });

    it('opens once a passing backtest exists, and records why in the audit log', async () => {
      const created = await createStrategy({ maxDrawdownBps: 1000 });
      await attachBacktest(created.id, 620);

      const opened = await request(server())
        .post(`/api/v1/admin/investments/strategies/${created.id}/open`)
        .set(asManager())
        .expect(201);

      expect(opened.body.status).toBe(StrategyStatus.OPEN);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'investment.strategy_opened', entityId: created.id },
      });
      expect(audit).not.toBeNull();
      expect(audit?.metadata).toMatchObject({
        measuredMaxDrawdownBps: 620,
        configuredMaxDrawdownBps: 1000,
      });
    });

    it('does not let the generic status setter bypass the backtest gate', async () => {
      // Two doors to the same room; both have to be locked.
      const created = await createStrategy();

      const res = await request(server())
        .patch(`/api/v1/admin/investments/strategies/${created.id}/status`)
        .set(asManager())
        .send({ status: StrategyStatus.OPEN })
        .expect(403);
      expect(res.body.error.code).toBe('BACKTEST_REQUIRED');
    });

    it('refuses to reopen a wound-down strategy', async () => {
      const created = await createStrategy();
      await attachBacktest(created.id, 500);
      await prisma.investmentStrategy.update({
        where: { id: created.id },
        data: { status: StrategyStatus.WINDING_DOWN },
      });

      const res = await request(server())
        .post(`/api/v1/admin/investments/strategies/${created.id}/open`)
        .set(asManager())
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('the investor-facing marketplace', () => {
    async function openStrategy(overrides: Record<string, unknown> = {}) {
      const created = await createStrategy(overrides);
      await attachBacktest(created.id, 500);
      await request(server())
        .post(`/api/v1/admin/investments/strategies/${created.id}/open`)
        .set(asManager())
        .expect(201);
      return created;
    }

    it('is readable without an account, like the risk disclosure', async () => {
      const created = await openStrategy();

      const list = await request(server()).get('/api/v1/investments/strategies').expect(200);
      expect(list.body.map((s: { slug: string }) => s.slug)).toContain(created.slug);
    });

    it('never lists a DRAFT — an unbuyable product must not be advertised', async () => {
      const draft = await createStrategy();

      const list = await request(server()).get('/api/v1/investments/strategies').expect(200);
      expect(list.body.map((s: { slug: string }) => s.slug)).not.toContain(draft.slug);

      await request(server()).get(`/api/v1/investments/strategies/${draft.slug}`).expect(404);
    });

    it('discloses every term an investor needs before an amount field exists', async () => {
      const created = await openStrategy({ lockupDays: 90, redemptionNoticeDays: 14, minimumInvestment: '2500' });

      const res = await request(server()).get(`/api/v1/investments/strategies/${created.slug}`).expect(200);

      expect(res.body).toMatchObject({
        minimumInvestment: '2500',
        lockupDays: 90,
        redemptionNoticeDays: 14,
        perfFeeBps: 5000,
        mgmtFeeBps: 0,
        maxDrawdownBps: 1000,
      });
    });

    it('reports no track record rather than a zero one', async () => {
      // A chart of zeros is a fabricated track record. Until the NAV engine strikes a snapshot
      // there is nothing to show, and the API says so.
      const created = await openStrategy();

      const res = await request(server()).get(`/api/v1/investments/strategies/${created.slug}`).expect(200);
      expect(res.body.aum).toBeNull();
      expect(res.body.navPerUnit).toBeNull();
      expect(res.body.performance).toBeNull();
      expect(res.body.investorCount).toBe(0);
    });

    it('does not expose internal fields to investors', async () => {
      const created = await openStrategy();
      const res = await request(server()).get(`/api/v1/investments/strategies/${created.slug}`).expect(200);

      expect(res.body.id).toBeUndefined();
      expect(res.body.tradingStrategyId).toBeUndefined();
      expect(res.body.canOpen).toBeUndefined();
    });
  });

  describe('authorization', () => {
    it('refuses strategy administration to an ordinary investor', async () => {
      await request(server())
        .post('/api/v1/admin/investments/strategies')
        .set(asInvestor())
        .send(validStrategy())
        .expect(403);

      await request(server()).get('/api/v1/admin/investments/strategies').set(asInvestor()).expect(403);
    });

    it('refuses strategy administration to an unauthenticated caller', async () => {
      await request(server()).get('/api/v1/admin/investments/strategies').expect(401);
    });

    it('allows an investment manager but grants no path to move value', async () => {
      // The manager can configure products. There is deliberately no endpoint in this
      // namespace that moves value, and the ledger boundary would refuse one anyway.
      await request(server()).get('/api/v1/admin/investments/strategies').set(asManager()).expect(200);
    });
  });
});
