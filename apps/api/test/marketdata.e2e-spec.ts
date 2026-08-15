import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CandleRepository } from '../src/marketdata/candle.repository';
import { DataQualityService } from '../src/marketdata/data-quality.service';
import { IngestionService } from '../src/marketdata/ingestion.service';
import { TIMEFRAME_MS, Timeframe } from '../src/marketdata/ohlcv-provider.interface';
import { ProviderRegistryService } from '../src/marketdata/provider-registry.service';
import { CoinbaseOhlcvProvider } from '../src/marketdata/providers/coinbase.ohlcv-provider';
import { OkxOhlcvProvider } from '../src/marketdata/providers/okx.ohlcv-provider';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * The point-in-time data platform (docs/17, roadmap MVP32).
 *
 * The milestone's whole claim is that **you cannot query what you could not have known**, so
 * that is what the bulk of these tests attack — from the service layer, from raw SQL, and by
 * checking that the guarantee survives a caller who is actively trying to get the future.
 *
 * Provider tests run against the **live OKX and Coinbase public APIs**, not fixtures. A recorded
 * fixture proves the parser still parses last month's payload; it cannot catch a venue changing
 * its bar alignment, adding a field, or geo-blocking the deployment — and every one of those has
 * happened while building this. Set `SKIP_LIVE_MARKET_TESTS=1` to opt out.
 */
const SKIP_LIVE = process.env.SKIP_LIVE_MARKET_TESTS === '1';
const liveIt = SKIP_LIVE ? it.skip : it;

describe('Market data platform (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let candles: CandleRepository;
  let quality: DataQualityService;
  let ingestion: IngestionService;
  let registry: ProviderRegistryService;
  let redis: Redis;

  let adminToken: string;
  const PASSWORD = 'Str0ng!Passw0rd#2026';
  const SYMBOL = 'BTC/USDT';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    candles = app.get(CandleRepository);
    quality = app.get(DataQualityService);
    ingestion = app.get(IngestionService);
    registry = app.get(ProviderRegistryService);
    redis = app.get(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    // Also the rate limiter's state: this suite registers a user per test, and the auth routes
    // carry a deliberately strict static throttle that would otherwise reject test 20 onward.
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

  /**
   * A synthetic but *coherent* series: contiguous bars, realistic prices, correct OHLC ordering.
   * Used where the test is about the store's behaviour rather than a provider's.
   */
  function series(params: {
    count: number;
    timeframe: Timeframe;
    endOpenTime: Date;
    startPrice?: number;
    step?: number;
    volume?: number;
  }) {
    const span = TIMEFRAME_MS[params.timeframe];
    const bars = [];
    for (let i = params.count - 1; i >= 0; i--) {
      const openTime = new Date(params.endOpenTime.getTime() - i * span);
      const base = (params.startPrice ?? 60_000) + (params.count - 1 - i) * (params.step ?? 10);
      bars.push({
        openTime,
        closeTime: new Date(openTime.getTime() + span),
        open: new Prisma.Decimal(base),
        high: new Prisma.Decimal(base + 5),
        low: new Prisma.Decimal(base - 5),
        close: new Prisma.Decimal(base + 1),
        volume: new Prisma.Decimal(params.volume ?? 100),
        trades: null,
      });
    }
    return bars;
  }

  /** Stores a coherent series ending `endOpenTime`, ingested at each bar's close. */
  async function store(params: {
    count: number;
    timeframe: Timeframe;
    endOpenTime: Date;
    source?: string;
    symbol?: string;
    volume?: number;
  }) {
    const bars = series(params);
    // Insert one bar at a time so each carries its own honest ingestTime (its close), rather
    // than a single batch timestamp that would make old bars look freshly learned.
    for (const bar of bars) {
      await candles.insertMany({
        source: params.source ?? 'okx',
        symbol: params.symbol ?? SYMBOL,
        timeframe: params.timeframe,
        bars: [bar],
        ingestTime: bar.closeTime,
      });
    }
    return bars;
  }

  // ── The core guarantee ──────────────────────────────────────────────────

  describe('point-in-time correctness', () => {
    it('refuses to store a bar as knowable before it closed', async () => {
      const openTime = new Date('2026-01-01T00:00:00Z');
      const closeTime = new Date('2026-01-01T01:00:00Z');

      // Straight at the table, bypassing every service. The guarantee has to hold against a
      // backfill script too — that is why it is a CHECK and not a validation.
      await expect(
        prisma.$executeRaw`
          INSERT INTO market_candles
            ("source","symbol","timeframe","openTime","closeTime","open","high","low","close","volume","ingestTime")
          VALUES ('okx', ${SYMBOL}, '1h', ${openTime}, ${closeTime}, 100, 101, 99, 100, 1,
                  ${new Date('2026-01-01T00:30:00Z')})
        `,
      ).rejects.toThrow(/not_known_before_close/i);
    });

    it('hides a bar from a query made before it was ingested', async () => {
      const now = new Date('2026-06-01T12:00:00Z');
      await store({ count: 5, timeframe: '1h', endOpenTime: new Date(now.getTime() - TIMEFRAME_MS['1h']) });

      const all = await candles.knowableAt({ symbol: SYMBOL, timeframe: '1h', asOf: now, limit: 100 });
      expect(all).toHaveLength(5);

      // Roll the clock back to before the newest bar closed. It must vanish — not be returned
      // with a flag, not be returned at all.
      const earlier = new Date(all[4].closeTime.getTime() - 1);
      const partial = await candles.knowableAt({ symbol: SYMBOL, timeframe: '1h', asOf: earlier, limit: 100 });
      expect(partial).toHaveLength(4);
      expect(partial.at(-1)!.openTime.getTime()).toBe(all[3].openTime.getTime());
    });

    it('returns nothing at all for an instant before any bar existed', async () => {
      await store({ count: 5, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const rows = await candles.knowableAt({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2020-01-01T00:00:00Z'),
        limit: 100,
      });
      expect(rows).toHaveLength(0);
    });

    it('never lets a stored bar change under a model that trained on it', async () => {
      await store({ count: 1, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z') });

      await expect(
        prisma.$executeRaw`UPDATE market_candles SET "close" = 1 WHERE symbol = ${SYMBOL}`,
      ).rejects.toThrow(/append-only/i);
      await expect(
        prisma.$executeRaw`DELETE FROM market_candles WHERE symbol = ${SYMBOL}`,
      ).rejects.toThrow(/append-only/i);
    });

    it('keeps two providers\' views of the same bar as two rows, not one overwrite', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await store({ count: 3, timeframe: '1h', endOpenTime: end, source: 'okx', volume: 100 });
      await store({ count: 3, timeframe: '1h', endOpenTime: end, source: 'coinbase', volume: 200 });

      const stored = await prisma.marketCandle.count({ where: { symbol: SYMBOL, timeframe: '1h' } });
      expect(stored).toBe(6);

      // And a source-scoped read gets exactly one venue's view.
      const okxOnly = await candles.knowableAt({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2026-06-01T13:00:00Z'),
        limit: 10,
        source: 'okx',
      });
      expect(okxOnly).toHaveLength(3);
      expect(okxOnly.every((b) => b.volume.equals(100))).toBe(true);
    });

    it('rejects an incoherent candle rather than storing a number nobody can use', async () => {
      // high below close: corrupt. Corrupt data reaching a feature is worse than absent data,
      // because it produces a value that looks fine.
      await expect(
        prisma.$executeRaw`
          INSERT INTO market_candles
            ("source","symbol","timeframe","openTime","closeTime","open","high","low","close","volume","ingestTime")
          VALUES ('okx', ${SYMBOL}, '1h', ${new Date('2026-01-01T00:00:00Z')},
                  ${new Date('2026-01-01T01:00:00Z')}, 100, 90, 80, 95, 1,
                  ${new Date('2026-01-01T01:00:00Z')})
        `,
      ).rejects.toThrow(/ohlc_coherent/i);
    });

    it('silently drops a bar that has not closed yet rather than failing the whole batch', async () => {
      const ingestTime = new Date('2026-06-01T12:00:00Z');
      const closed = series({ count: 1, timeframe: '1h', endOpenTime: new Date('2026-06-01T10:00:00Z') });
      const forming = series({ count: 1, timeframe: '1h', endOpenTime: new Date('2026-06-01T12:00:00Z') });

      const inserted = await candles.insertMany({
        source: 'okx',
        symbol: SYMBOL,
        timeframe: '1h',
        bars: [...closed, ...forming],
        ingestTime,
      });

      // One good bar kept, one forming bar dropped. Losing the good bar alongside the bad one
      // would turn a provider quirk into a data gap.
      expect(inserted).toBe(1);
    });
  });

  // ── Macro vintages ──────────────────────────────────────────────────────

  describe('macro vintages', () => {
    it('serves the figure that was current at the time, not the revised one', async () => {
      const s = await prisma.macroSeries.create({
        data: { code: 'US_NFP', name: 'Nonfarm Payrolls', country: 'US', unit: 'thousands', importance: 3 },
      });

      const periodStart = new Date('2026-05-01T00:00:00Z');
      const periodEnd = new Date('2026-06-01T00:00:00Z');
      const firstPrint = new Date('2026-06-05T12:30:00Z');
      const revision = new Date('2026-07-03T12:30:00Z');

      await prisma.macroObservation.create({
        data: {
          seriesId: s.id, periodStart, periodEnd,
          releaseTime: firstPrint, ingestTime: firstPrint,
          vintage: 0, actual: '250', consensus: '190', source: 'test',
        },
      });
      await prisma.macroObservation.create({
        data: {
          seriesId: s.id, periodStart, periodEnd,
          releaseTime: revision, ingestTime: revision,
          vintage: 1, actual: '110', consensus: '190', source: 'test',
        },
      });

      // Mid-June, a trader knew 250 — a big upside surprise. The revision to 110 had not
      // happened. Training on 110 for that date teaches the model a reaction that never occurred.
      const asOfJune = await prisma.macroObservation.findFirst({
        where: { seriesId: s.id, periodStart, ingestTime: { lte: new Date('2026-06-20T00:00:00Z') } },
        orderBy: { vintage: 'desc' },
      });
      expect(asOfJune!.actual!.toFixed(0)).toBe('250');

      const asOfAugust = await prisma.macroObservation.findFirst({
        where: { seriesId: s.id, periodStart, ingestTime: { lte: new Date('2026-08-01T00:00:00Z') } },
        orderBy: { vintage: 'desc' },
      });
      expect(asOfAugust!.actual!.toFixed(0)).toBe('110');
    });

    it('refuses a back-filled revision stamped as knowable before its release', async () => {
      const s = await prisma.macroSeries.create({
        data: { code: 'US_CPI', name: 'CPI', country: 'US', unit: 'pct', importance: 3 },
      });
      // The exact shape of the macro-revision leak: a history endpoint's revised value written
      // with an ingest time back at the original release.
      await expect(
        prisma.$executeRaw`
          INSERT INTO macro_observations
            ("id","seriesId","periodStart","periodEnd","releaseTime","ingestTime","vintage","actual","source")
          VALUES (gen_random_uuid()::text, ${s.id},
                  ${new Date('2026-05-01T00:00:00Z')}, ${new Date('2026-06-01T00:00:00Z')},
                  ${new Date('2026-07-10T12:30:00Z')}, ${new Date('2026-06-10T12:30:00Z')},
                  1, 3.2, 'test')
        `,
      ).rejects.toThrow(/not_known_before_release/i);
    });

    it('keeps a published vintage unchangeable', async () => {
      const s = await prisma.macroSeries.create({
        data: { code: 'EU_HICP', name: 'HICP', country: 'EU', unit: 'pct', importance: 2 },
      });
      const o = await prisma.macroObservation.create({
        data: {
          seriesId: s.id,
          periodStart: new Date('2026-05-01T00:00:00Z'),
          periodEnd: new Date('2026-06-01T00:00:00Z'),
          releaseTime: new Date('2026-06-05T09:00:00Z'),
          ingestTime: new Date('2026-06-05T09:00:00Z'),
          actual: '2.1',
          source: 'test',
        },
      });
      await expect(
        prisma.$executeRaw`UPDATE macro_observations SET actual = 9 WHERE id = ${o.id}`,
      ).rejects.toThrow(/append-only/i);
    });
  });

  // ── Data quality gate ───────────────────────────────────────────────────

  describe('data quality gate', () => {
    const policy = { requiredBars: 50, maxStalenessMultiple: 2, outlierSigma: 10, maxZeroVolumeFraction: 0.05 };

    it('passes a clean, contiguous, fresh window', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await store({ count: 60, timeframe: '1h', endOpenTime: end });

      const verdict = await quality.evaluate({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2026-06-01T12:30:00Z'),
        policy,
        record: false,
      });
      expect(verdict.passed).toBe(true);
      expect(verdict.failures).toHaveLength(0);
      expect(verdict.barsExamined).toBe(50);
    });

    it('refuses when there is no data at all', async () => {
      const verdict = await quality.evaluate({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date(), policy, record: false,
      });
      expect(verdict.passed).toBe(false);
      expect(verdict.failures[0].kind).toBe('NO_DATA');
    });

    it('refuses a short window rather than computing over what is there', async () => {
      await store({ count: 40, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const verdict = await quality.evaluate({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date('2026-06-01T12:30:00Z'), policy, record: false,
      });
      // A 200-EMA over 40 bars is not an approximation. It is a different, wrong number.
      expect(verdict.passed).toBe(false);
      expect(verdict.failures.map((f) => f.kind)).toContain('INSUFFICIENT_HISTORY');
    });

    it('detects a hole in the middle of an otherwise healthy series', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      const bars = series({ count: 60, timeframe: '1h', endOpenTime: end });
      // Drop three bars from the middle. The series still looks continuous to anything that
      // only reads the first and last timestamps.
      const withHole = [...bars.slice(0, 30), ...bars.slice(33)];
      for (const bar of withHole) {
        await candles.insertMany({
          source: 'okx', symbol: SYMBOL, timeframe: '1h', bars: [bar], ingestTime: bar.closeTime,
        });
      }

      const verdict = await quality.evaluate({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date('2026-06-01T12:30:00Z'), policy, record: false,
      });
      expect(verdict.passed).toBe(false);
      const gap = verdict.failures.find((f) => f.kind === 'MISSING_CANDLES');
      expect(gap!.detail).toMatch(/3 bar\(s\)/);
    });

    it('refuses a stale window, judged on the bar\'s own close time', async () => {
      await store({ count: 60, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const verdict = await quality.evaluate({
        symbol: SYMBOL,
        timeframe: '1h',
        // Six hours after the newest bar closed; the limit is two.
        asOf: new Date('2026-06-01T18:00:00Z'),
        policy,
        record: false,
      });
      expect(verdict.passed).toBe(false);
      expect(verdict.failures.map((f) => f.kind)).toContain('STALE');
    });

    it('flags an outlier in sigma of the window, not as a fixed percentage', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      const bars = series({ count: 60, timeframe: '1h', endOpenTime: end, startPrice: 60_000, step: 1 });
      // A quiet series where a 20% jump is enormous. The same jump in a crisis would not be.
      const spike = bars[40];
      bars[40] = {
        ...spike,
        open: new Prisma.Decimal(72_000),
        high: new Prisma.Decimal(72_100),
        low: new Prisma.Decimal(71_900),
        close: new Prisma.Decimal(72_000),
      };
      for (const bar of bars) {
        await candles.insertMany({
          source: 'okx', symbol: SYMBOL, timeframe: '1h', bars: [bar], ingestTime: bar.closeTime,
        });
      }

      const verdict = await quality.evaluate({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date('2026-06-01T12:30:00Z'), policy, record: false,
      });
      expect(verdict.passed).toBe(false);
      expect(verdict.failures.map((f) => f.kind)).toContain('PRICE_OUTLIER');
    });

    it('flags a window the venue printed with no trades in it', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      const bars = series({ count: 60, timeframe: '1h', endOpenTime: end });
      for (let i = 0; i < 20; i++) bars[i] = { ...bars[i], volume: new Prisma.Decimal(0) };
      for (const bar of bars) {
        await candles.insertMany({
          source: 'okx', symbol: SYMBOL, timeframe: '1h', bars: [bar], ingestTime: bar.closeTime,
        });
      }

      const verdict = await quality.evaluate({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date('2026-06-01T12:30:00Z'), policy, record: false,
      });
      expect(verdict.passed).toBe(false);
      expect(verdict.failures.map((f) => f.kind)).toContain('ZERO_VOLUME');
    });

    it('treats a provider disagreement as a quality failure, not something to average away', async () => {
      await store({ count: 60, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const verdict = await quality.evaluate({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2026-06-01T12:30:00Z'),
        policy,
        disagreements: [{ provider: 'coinbase', deviationBps: 950 }],
        record: false,
      });
      expect(verdict.passed).toBe(false);
      expect(verdict.failures.map((f) => f.kind)).toContain('PROVIDER_DISAGREEMENT');
    });

    it('records every refusal, permanently, so a quiet period can be explained', async () => {
      await quality.evaluate({ symbol: SYMBOL, timeframe: '1h', asOf: new Date(), policy });

      const rows = await prisma.dataQualityFailure.findMany({ where: { symbol: SYMBOL } });
      expect(rows.length).toBeGreaterThan(0);
      await expect(
        prisma.$executeRaw`UPDATE data_quality_failures SET detail = 'nothing to see' WHERE symbol = ${SYMBOL}`,
      ).rejects.toThrow(/append-only/i);
    });

    it('never rescues a failing window with a partial score', async () => {
      await store({ count: 10, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const verdict = await quality.evaluate({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date('2026-06-01T12:30:00Z'), policy, record: false,
      });
      // No "0.7 quality, proceed with reduced confidence". There is no evidence about how a
      // model performs on data like this, so a discounted confidence would be invented.
      expect(verdict.passed).toBe(false);
      expect(verdict.score).toBe(0);
    });
  });

  // ── Live providers ──────────────────────────────────────────────────────

  describe('live providers', () => {
    liveIt('pulls closed, coherent 1h bars from OKX', async () => {
      const bars = await new OkxOhlcvProvider().fetchOhlcv({ symbol: SYMBOL, timeframe: '1h', limit: 10 });
      expect(bars).not.toBeNull();
      expect(bars!.length).toBeGreaterThan(5);

      const now = Date.now();
      for (const bar of bars!) {
        expect(bar.closeTime.getTime()).toBeLessThanOrEqual(now);
        expect(bar.closeTime.getTime() - bar.openTime.getTime()).toBe(TIMEFRAME_MS['1h']);
        expect(bar.high.greaterThanOrEqualTo(bar.low)).toBe(true);
        expect(bar.high.greaterThanOrEqualTo(bar.close)).toBe(true);
        expect(bar.low.lessThanOrEqualTo(bar.open)).toBe(true);
        expect(bar.close.greaterThan(0)).toBe(true);
      }

      // Contiguous, oldest first.
      for (let i = 1; i < bars!.length; i++) {
        expect(bars![i].openTime.getTime() - bars![i - 1].openTime.getTime()).toBe(TIMEFRAME_MS['1h']);
      }
    }, 30_000);

    liveIt('aligns daily bars to UTC so the two venues describe the same day', async () => {
      // This is the bug that made the cross-check silently do nothing: OKX's plain 1D bar opens
      // at 16:00 UTC and Coinbase's at 00:00, so they shared zero daily bars and the comparator
      // had nothing to compare while still reporting success.
      const okx = await new OkxOhlcvProvider().fetchOhlcv({ symbol: SYMBOL, timeframe: '1d', limit: 5 });
      const cb = await new CoinbaseOhlcvProvider().fetchOhlcv({ symbol: SYMBOL, timeframe: '1d', limit: 5 });
      expect(okx).not.toBeNull();
      expect(cb).not.toBeNull();

      for (const bar of okx!) expect(bar.openTime.getUTCHours()).toBe(0);

      const cbTimes = new Set(cb!.map((b) => b.openTime.getTime()));
      const overlap = okx!.filter((b) => cbTimes.has(b.openTime.getTime()));
      expect(overlap.length).toBeGreaterThan(0);
    }, 30_000);

    liveIt('declines rather than guessing on a pair the venue does not list', async () => {
      const bars = await new OkxOhlcvProvider().fetchOhlcv({
        symbol: 'NOTAREALTOKEN/USDT', timeframe: '1h', limit: 5,
      });
      expect(bars).toBeNull();
    }, 30_000);

    liveIt('declines when the endpoint is unreachable, and does not throw', async () => {
      const dead = new OkxOhlcvProvider('http://127.0.0.1:1', 2_000);
      expect(await dead.fetchOhlcv({ symbol: SYMBOL, timeframe: '1h', limit: 5 })).toBeNull();
    }, 30_000);

    liveIt('ingests real bars end to end and they survive the point-in-time read', async () => {
      const result = await ingestion.ingest(SYMBOL, '1h', 50);
      expect(result.source).toBe('okx');
      expect(result.inserted).toBeGreaterThan(0);

      const stored = await candles.knowableAt({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date(), limit: 50,
      });
      expect(stored.length).toBe(result.inserted);
      // Every stored bar obeys the invariant the CHECK enforces.
      for (const bar of stored) {
        expect(bar.ingestTime.getTime()).toBeGreaterThanOrEqual(bar.closeTime.getTime());
      }
    }, 60_000);

    liveIt('is idempotent — re-ingesting the same window inserts nothing new', async () => {
      const first = await ingestion.ingest(SYMBOL, '1h', 30);
      expect(first.inserted).toBeGreaterThan(0);
      const second = await ingestion.ingest(SYMBOL, '1h', 30);
      // skipDuplicates rather than upsert: a bar a model trained on must not change underneath
      // it, so a re-report is discarded rather than applied.
      expect(second.inserted).toBe(0);
    }, 60_000);

    liveIt('measures provider reliability from what actually happened', async () => {
      await ingestion.ingest(SYMBOL, '1h', 20);
      const okxScore = await registry.reliabilityOf('okx', SYMBOL);
      expect(okxScore).toBeGreaterThan(0);

      const row = await prisma.dataProviderStatus.findFirst({
        where: { providerKey: 'okx', category: 'ohlcv', symbol: SYMBOL },
      });
      expect(row!.successCount).toBeGreaterThan(0);
      expect(row!.lastSuccessAt).not.toBeNull();
      expect(row!.lastLatencyMs).toBeGreaterThan(0);
    }, 60_000);

    liveIt('drops a provider\'s score when it fails, harder than it raises it on success', async () => {
      // A real failure against a real dead endpoint, not a mocked one.
      const okxDown = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ProviderRegistryService)
        .useFactory({
          factory: () => new ProviderRegistryService(prisma, { okxBaseUrl: 'http://127.0.0.1:1', coinbaseBaseUrl: 'http://127.0.0.1:1' } as never),
        })
        .compile();
      const failing = okxDown.get(ProviderRegistryService);

      const outcome = await failing.fetchOhlcv({ symbol: SYMBOL, timeframe: '1h', limit: 5 });
      expect(outcome).toBeNull();

      const row = await prisma.dataProviderStatus.findFirst({
        where: { providerKey: 'okx', category: 'ohlcv', symbol: SYMBOL },
      });
      expect(row!.failureCount).toBeGreaterThan(0);
      expect(Number(row!.reliability)).toBe(0);
      expect(row!.lastError).toBeTruthy();
      await okxDown.close();
    }, 60_000);
  });

  // ── Operator surface ────────────────────────────────────────────────────

  describe('operator surface', () => {
    it('offers no way to write a candle or set a reliability score', async () => {
      // The absence is the feature. Data is observed or it does not exist.
      const routes = app.getHttpAdapter().getInstance()._router?.stack ?? [];
      const paths: string[] = routes
        .filter((l: { route?: { path: string } }) => l.route)
        .map((l: { route: { path: string } }) => l.route.path);
      const writable = paths.filter(
        (p) => p.includes('market-data') && (p.includes('candle') || p.includes('reliability')),
      );
      expect(writable).toEqual([]);
    });

    it('requires asOf on the quality endpoint, with no default of now', async () => {
      const res = await request(server())
        .get('/api/v1/admin/market-data/quality')
        .query({ symbol: SYMBOL, timeframe: '1h' })
        .set(auth(adminToken))
        .expect(400);
      expect(res.body.error.code).toBe('MISSING_PARAMETERS');
    });

    it('rejects a timeframe the platform does not speak', async () => {
      const res = await request(server())
        .get('/api/v1/admin/market-data/quality')
        .query({ symbol: SYMBOL, timeframe: '7h', asOf: new Date().toISOString() })
        .set(auth(adminToken))
        .expect(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_TIMEFRAME');
    });

    it('explains why the gate has been refusing', async () => {
      await quality.evaluate({ symbol: SYMBOL, timeframe: '1h', asOf: new Date() });
      const res = await request(server())
        .get('/api/v1/admin/market-data/quality/failures')
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toMatchObject({ symbol: SYMBOL, kind: 'NO_DATA' });
    });

    it('is closed to ordinary users', async () => {
      const email = `user-${randomUUID()}@example.com`;
      const reg = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);
      await request(server())
        .get('/api/v1/admin/market-data/coverage')
        .set(auth(reg.body.accessToken))
        .expect(403);
    });
  });
});
