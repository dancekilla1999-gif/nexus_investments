import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { buildFeatureSet, requiredHistory } from '../src/features/registry';
import { CandleRepository } from '../src/marketdata/candle.repository';
import { IngestionService } from '../src/marketdata/ingestion.service';
import { TIMEFRAME_MS, Timeframe } from '../src/marketdata/ohlcv-provider.interface';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { ResearchService } from '../src/research/research.service';
import { resetDatabase } from './utils/reset-database';

/**
 * The research harness end to end (docs/18 §3, roadmap MVP34).
 *
 * The unit tests prove each piece behaves; these prove the pieces compose over the real
 * point-in-time store, and that the trial counter cannot be escaped. The counter is the part
 * most worth testing at this level, because its whole value comes from being owned by the system
 * rather than by whoever is running the search.
 */
const SKIP_LIVE = process.env.SKIP_LIVE_MARKET_TESTS === '1';
const liveIt = SKIP_LIVE ? it.skip : it;

describe('Research harness (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let candles: CandleRepository;
  let research: ResearchService;
  let ingestion: IngestionService;
  let redis: Redis;

  let adminToken: string;
  const PASSWORD = 'Str0ng!Passw0rd#2026';
  const SYMBOL = 'BTC/USDT';
  const TF: Timeframe = '1h';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    candles = app.get(CandleRepository);
    research = app.get(ResearchService);
    ingestion = app.get(IngestionService);
    redis = app.get(REDIS_CLIENT);
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
    adminToken = await register(UserRole.ADMIN);
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(role: UserRole): Promise<string> {
    const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(201);
    return login.body.accessToken;
  }

  function walk(count: number, seed = 42, vol = 0.02): number[] {
    let s = seed;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const out = [50_000];
    for (let i = 1; i < count; i++) out.push(out[i - 1] * (1 + (rand() - 0.5) * vol));
    return out;
  }

  /** Seeds a contiguous series with each bar ingested at its own close. */
  async function seed(count: number, endOpenTime: Date, closes?: number[]) {
    const span = TIMEFRAME_MS[TF];
    const series = closes ?? walk(count);
    const rows: Array<Parameters<CandleRepository['insertMany']>[0]> = [];

    for (let i = 0; i < count; i++) {
      const openTime = new Date(endOpenTime.getTime() - (count - 1 - i) * span);
      const closeTime = new Date(openTime.getTime() + span);
      const c = series[i];
      rows.push({
        source: 'okx',
        symbol: SYMBOL,
        timeframe: TF,
        ingestTime: closeTime,
        bars: [
          {
            openTime,
            closeTime,
            open: new Prisma.Decimal((c * 0.999).toFixed(8)),
            high: new Prisma.Decimal((c * 1.006).toFixed(8)),
            low: new Prisma.Decimal((c * 0.994).toFixed(8)),
            close: new Prisma.Decimal(c.toFixed(8)),
            volume: new Prisma.Decimal((100 + (i % 13) * 5).toFixed(8)),
            trades: null,
          },
        ],
      });
    }
    for (const r of rows) await candles.insertMany(r);
  }

  const WARMUP = requiredHistory(buildFeatureSet(TF));
  const END = new Date('2026-06-01T11:00:00Z');

  // ── Dataset construction ────────────────────────────────────────────────

  describe('dataset construction', () => {
    it('builds features as of each bar, through the point-in-time store', async () => {
      await seed(WARMUP + 400, END);
      const { dataset, balance, labelDefinition } = await research.buildDataset({
        symbol: SYMBOL, timeframe: TF, bars: 300,
      });

      expect(dataset.X.length).toBeGreaterThan(50);
      expect(dataset.featureNames.length).toBeGreaterThanOrEqual(100);
      expect(dataset.X[0].length).toBe(dataset.featureNames.length);
      expect(labelDefinition).toMatch(/^tb:tp=/);
      expect(balance.up + balance.down).toBe(balance.total);
    }, 300_000);

    it('drops timeouts rather than folding them into one side', async () => {
      await seed(WARMUP + 400, END);
      const { dataset, balance } = await research.buildDataset({
        symbol: SYMBOL, timeframe: TF, bars: 300,
      });

      // Calling a timeout "not up" would teach the model that a flat market is a short — a
      // different and wrong claim.
      expect(balance.timeout).toBe(0);
      expect(new Set(dataset.y)).toEqual(new Set([0, 1]));
    }, 300_000);

    it('gives every sample a resolution time later than its entry', async () => {
      await seed(WARMUP + 300, END);
      const { dataset } = await research.buildDataset({ symbol: SYMBOL, timeframe: TF, bars: 200 });
      for (const s of dataset.samples) expect(s.resolvedAt).toBeGreaterThan(s.time);
    }, 300_000);

    it('weights samples by uniqueness, averaging to one', async () => {
      await seed(WARMUP + 300, END);
      const { dataset } = await research.buildDataset({ symbol: SYMBOL, timeframe: TF, bars: 200 });
      const mean = dataset.weights.reduce((a, b) => a + b, 0) / dataset.weights.length;
      expect(mean).toBeCloseTo(1, 8);
    }, 300_000);

    it('refuses rather than building a dataset from too little history', async () => {
      await seed(50, END);
      await expect(
        research.buildDataset({ symbol: SYMBOL, timeframe: TF, bars: 500 }),
      ).rejects.toThrow(/Not enough history/i);
    }, 120_000);
  });

  // ── Purging over real labels ────────────────────────────────────────────

  describe('purged cross-validation over real labels', () => {
    it('actually purges, and reports how much', async () => {
      await seed(WARMUP + 500, END);
      const result = await research.crossValidate({ symbol: SYMBOL, timeframe: TF, bars: 400 }, 5);

      // A split that purges nothing is a split that is not purging. With a 24-bar horizon every
      // fold boundary has overlap to remove.
      expect(result.purgedTotal).toBeGreaterThan(0);
      expect(result.folds).toBe(5);
      expect(result.samples).toBeGreaterThan(50);
    }, 300_000);

    it('scores near chance on a random walk, which is the honest answer', async () => {
      await seed(WARMUP + 600, END);
      const result = await research.crossValidate({ symbol: SYMBOL, timeframe: TF, bars: 500 }, 5);

      // There is no edge in a driftless synthetic walk. A harness that reports one here is
      // leaking, and this assertion is the cheapest place to notice.
      expect(result.auc).not.toBeNull();
      expect(Math.abs((result.auc as number) - 0.5)).toBeLessThan(0.18);
    }, 300_000);
  });

  // ── The trial counter ───────────────────────────────────────────────────

  describe('the trial counter', () => {
    it('counts a run whether or not the researcher liked the answer', async () => {
      await seed(WARMUP + 500, END);
      const spec = { symbol: SYMBOL, timeframe: TF, bars: 400 };

      const first = await research.walkForwardEvaluate({ spec });
      expect(first.trials).toBe(1);

      const second = await research.walkForwardEvaluate({ spec });
      expect(second.trials).toBe(2);

      const third = await research.walkForwardEvaluate({ spec });
      expect(third.trials).toBe(3);
    }, 600_000);

    it('deflates the Sharpe harder as the trial count rises', async () => {
      await seed(WARMUP + 500, END);
      const spec = { symbol: SYMBOL, timeframe: TF, bars: 400 };

      const first = await research.walkForwardEvaluate({ spec });
      for (let i = 0; i < 4; i++) await research.walkForwardEvaluate({ spec });
      const later = await research.walkForwardEvaluate({ spec });

      expect(later.trials).toBeGreaterThan(first.trials);
      // The same result, having looked six times, has to clear a higher bar than having looked
      // once. That is the entire point of the correction.
      expect(later.expectedMaxSharpe).toBeGreaterThan(first.expectedMaxSharpe);
    }, 900_000);

    it('scopes the count, because looking at BTC 1h says nothing about ETH 4h', async () => {
      await seed(WARMUP + 500, END);
      await research.walkForwardEvaluate({ spec: { symbol: SYMBOL, timeframe: TF, bars: 400 } });

      const otherScope = await research.trialCount('ETH/USDT|4h|tb:tp=2,sl=2,hold=24,vol=50');
      expect(otherScope).toBe(0);
    }, 300_000);

    it('cannot be decremented, edited, or reset', async () => {
      await seed(WARMUP + 500, END);
      await research.walkForwardEvaluate({ spec: { symbol: SYMBOL, timeframe: TF, bars: 400 } });

      // A trial counter that can be lowered is not a trial counter, and deleting a disappointing
      // run is exactly the behaviour the deflated Sharpe exists to price in.
      await expect(
        prisma.$executeRaw`DELETE FROM research_experiments`,
      ).rejects.toThrow(/append-only/i);
      await expect(
        prisma.$executeRaw`UPDATE research_experiments SET auc = 0.99`,
      ).rejects.toThrow(/append-only/i);
    }, 300_000);

    it('records the configuration, so a run can be reproduced', async () => {
      await seed(WARMUP + 500, END);
      await research.walkForwardEvaluate({
        spec: { symbol: SYMBOL, timeframe: TF, bars: 400 },
        notes: 'baseline sweep',
      });

      const [row] = await research.experiments();
      expect(row.symbol).toBe(SYMBOL);
      expect(row.timeframe).toBe(TF);
      expect(row.labelDefinition).toMatch(/tb:tp=2/);
      expect(row.notes).toBe('baseline sweep');
      expect(row.config).toBeTruthy();
    }, 300_000);
  });

  // ── The verdict ─────────────────────────────────────────────────────────

  describe('the verdict', () => {
    it('calls a random walk what it is, rather than finding an edge in it', async () => {
      await seed(WARMUP + 600, END);
      const report = await research.walkForwardEvaluate({
        spec: { symbol: SYMBOL, timeframe: TF, bars: 500 },
      });

      // The single most valuable thing this harness can do is decline to be impressed.
      expect(report.verdict).toMatch(/chance|Inconclusive|below the 0\.95 bar/i);
      expect(report.verdict).not.toMatch(/Clears the statistical bar/);
    }, 600_000);

    it('reports every metric together, never a win rate alone', async () => {
      await seed(WARMUP + 500, END);
      const report = await research.walkForwardEvaluate({
        spec: { symbol: SYMBOL, timeframe: TF, bars: 400 },
      });

      const m = report.oosMetrics;
      expect(m).toHaveProperty('winRate');
      expect(m).toHaveProperty('profitFactor');
      expect(m).toHaveProperty('payoffRatio');
      expect(m).toHaveProperty('maxDrawdownR');
      expect(m).toHaveProperty('meanRExcludingBest5');
      expect(m).toHaveProperty('meanRCi95');
    }, 300_000);
  });

  // ── Negative controls over real data ────────────────────────────────────

  describe('negative controls over a real dataset', () => {
    it('destroys performance when the labels are permuted', async () => {
      await seed(WARMUP + 600, END);
      const result = await research.runControls({ symbol: SYMBOL, timeframe: TF, bars: 500 });

      const shuffled = result.controls.find((c) => c.name === 'shuffled-labels')!;
      expect(shuffled.passed).toBe(true);
    }, 600_000);

    it('passes the noise and constant controls on real features', async () => {
      await seed(WARMUP + 600, END);
      const result = await research.runControls({ symbol: SYMBOL, timeframe: TF, bars: 500 });

      expect(result.controls.find((c) => c.name === 'random-features')!.passed).toBe(true);
      expect(result.controls.find((c) => c.name === 'constant-features')!.passed).toBe(true);
    }, 600_000);
  });

  // ── Live data ───────────────────────────────────────────────────────────

  describe('against real market data', () => {
    liveIt('builds a dataset from live OKX bars and evaluates it', async () => {
      // 1200 bars, which needs the provider to paginate: OKX caps a single page at 300, and a
      // harness that can only ever see two weeks of hourly data cannot label, split and walk
      // forward over anything.
      // `backfill: true` stamps each bar as knowable at its own close. Without it the whole
      // backfill is stamped "now", every historical query correctly returns nothing, and the
      // dataset comes back empty — which is the point-in-time guarantee working, not failing.
      await ingestion.ingest(SYMBOL, TF, 1200, { backfill: true });
      const stored = await candles.knowableAt({ symbol: SYMBOL, timeframe: TF, asOf: new Date(), limit: 2000 });
      expect(stored.length).toBeGreaterThan(1000);

      // Contiguous: pagination must not leave a hole at a page boundary.
      for (let i = 1; i < stored.length; i++) {
        expect(stored[i].openTime.getTime() - stored[i - 1].openTime.getTime()).toBe(TIMEFRAME_MS[TF]);
      }

      const { dataset, balance } = await research.buildDataset({
        symbol: SYMBOL, timeframe: TF, bars: 600,
      });
      expect(dataset.X.length).toBeGreaterThan(0);
      expect(balance.total).toBe(dataset.X.length);

      // Real market data, so a large share of columns must be populated.
      const populated = dataset.X[dataset.X.length - 1].filter((v) => v !== null).length;
      expect(populated / dataset.featureNames.length).toBeGreaterThan(0.8);
    }, 600_000);
  });

  // ── Operator surface ────────────────────────────────────────────────────

  describe('operator surface', () => {
    it('offers no endpoint that promotes a model or touches capital', async () => {
      // The lab produces evidence. It cannot act on it.
      const routes = app.getHttpAdapter().getInstance()._router?.stack ?? [];
      const paths: string[] = routes
        .filter((l: { route?: { path: string } }) => l.route)
        .map((l: { route: { path: string } }) => l.route.path);
      const research_ = paths.filter((p) => p.includes('admin/research'));
      expect(research_.length).toBeGreaterThan(0);
      expect(research_.filter((p) => /promote|approve|deploy|order|trade/.test(p))).toEqual([]);
    });

    it('rejects a timeframe the platform does not speak', async () => {
      const res = await request(server())
        .post('/api/v1/admin/research/dataset')
        .set(auth(adminToken))
        .send({ symbol: SYMBOL, timeframe: '3h', bars: 500 })
        .expect(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_TIMEFRAME');
    });

    it('bounds the dataset size a caller may request', async () => {
      const res = await request(server())
        .post('/api/v1/admin/research/dataset')
        .set(auth(adminToken))
        .send({ symbol: SYMBOL, timeframe: TF, bars: 500_000 })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_BARS');
    });

    it('is closed to ordinary users', async () => {
      const email = `user-${randomUUID()}@example.com`;
      const reg = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);
      await request(server())
        .get('/api/v1/admin/research/experiments')
        .set(auth(reg.body.accessToken))
        .expect(403);
    });
  });
});
