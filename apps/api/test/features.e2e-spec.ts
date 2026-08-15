import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { FeatureEngineService } from '../src/features/feature-engine.service';
import { FeatureStoreService } from '../src/features/feature-store.service';
import { buildFeatureSet, featureSetVersion, requiredHistory } from '../src/features/registry';
import { CandleRepository } from '../src/marketdata/candle.repository';
import { IngestionService } from '../src/marketdata/ingestion.service';
import { TIMEFRAME_MS, Timeframe } from '../src/marketdata/ohlcv-provider.interface';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * The feature engine (docs/17 §3, roadmap MVP33).
 *
 * The milestone's acceptance criterion is one property: **recomputing a historical instant
 * offline reproduces what the live path computed at the time, bit for bit.** That is the
 * train/serve skew test, and it is the reason the engine has one implementation instead of two.
 * Most of what follows attacks it from a different angle — by moving the clock, by changing the
 * data around the instant, by asking for the vector twice.
 */
const SKIP_LIVE = process.env.SKIP_LIVE_MARKET_TESTS === '1';
const liveIt = SKIP_LIVE ? it.skip : it;

describe('Feature engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let candles: CandleRepository;
  let engine: FeatureEngineService;
  let store: FeatureStoreService;
  let ingestion: IngestionService;
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
    engine = app.get(FeatureEngineService);
    store = app.get(FeatureStoreService);
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

  /**
   * A deterministic pseudo-random walk. Seeded rather than `Math.random`, so a failure is
   * reproducible — a flaky feature test is worse than none, because it trains everyone to re-run.
   */
  function walk(count: number, seed = 42): number[] {
    let s = seed;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const out = [100_000];
    for (let i = 1; i < count; i++) {
      out.push(out[i - 1] * (1 + (rand() - 0.5) * 0.01));
    }
    return out;
  }

  /** Stores a contiguous series, each bar ingested at its own close. */
  async function seed(params: {
    count: number;
    timeframe: Timeframe;
    endOpenTime: Date;
    symbol?: string;
    closes?: number[];
  }) {
    const span = TIMEFRAME_MS[params.timeframe];
    const closes = params.closes ?? walk(params.count);

    for (let i = 0; i < params.count; i++) {
      const openTime = new Date(params.endOpenTime.getTime() - (params.count - 1 - i) * span);
      const closeTime = new Date(openTime.getTime() + span);
      const c = closes[i];
      await candles.insertMany({
        source: 'okx',
        symbol: params.symbol ?? SYMBOL,
        timeframe: params.timeframe,
        bars: [
          {
            openTime,
            closeTime,
            open: new Prisma.Decimal((c * 0.999).toFixed(8)),
            high: new Prisma.Decimal((c * 1.004).toFixed(8)),
            low: new Prisma.Decimal((c * 0.996).toFixed(8)),
            close: new Prisma.Decimal(c.toFixed(8)),
            volume: new Prisma.Decimal((100 + (i % 17) * 3).toFixed(8)),
            trades: null,
          },
        ],
        ingestTime: closeTime,
      });
    }
  }

  const TF: Timeframe = '1h';
  const NEEDED = requiredHistory(buildFeatureSet(TF));

  // ── The acceptance criterion ────────────────────────────────────────────

  describe('offline recomputation matches the live record, bit for bit', () => {
    it('reproduces a recorded vector exactly', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: end });

      const asOf = new Date('2026-06-01T12:30:00Z');
      const { vector } = await engine.compute({ symbol: SYMBOL, timeframe: TF, asOf, contextTimeframes: [] });
      expect(vector).not.toBeNull();

      const { stored } = await store.record(vector!);
      expect(stored).toBe(true);

      const record = await prisma.featureVectorRecord.findFirstOrThrow({ where: { symbol: SYMBOL } });
      const check = await store.verifyNoSkew(record.id);

      // The whole milestone, in one assertion.
      expect(check.matched).toBe(true);
      expect(check.differences).toEqual([]);
      expect(check.recomputedHash).toBe(check.recordedHash);
    });

    it('is deterministic across repeated computation of the same instant', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: end });
      const asOf = new Date('2026-06-01T12:30:00Z');

      const a = await engine.compute({ symbol: SYMBOL, timeframe: TF, asOf, contextTimeframes: [] });
      const b = await engine.compute({ symbol: SYMBOL, timeframe: TF, asOf, contextTimeframes: [] });

      // Not "close enough". IEEE-754 arithmetic is exactly reproducible for the same operations
      // in the same order, so anything but equality means the operations changed.
      expect(b.vector!.hash).toBe(a.vector!.hash);
      expect(b.vector!.values).toEqual(a.vector!.values);
    });

    it('detects skew when the recorded values are altered', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: end });
      const asOf = new Date('2026-06-01T12:30:00Z');
      const { vector } = await engine.compute({ symbol: SYMBOL, timeframe: TF, asOf, contextTimeframes: [] });
      await store.record(vector!);

      // `feature_vectors` is append-only, so the tampered row goes in as a fresh record — which
      // is the honest way to test the detector: it must catch a *different* recorded value, not
      // merely notice that somebody ran an UPDATE.
      const tampered = { ...vector!.values, rsi_14: 99.999 };
      const row = await prisma.featureVectorRecord.create({
        data: {
          symbol: SYMBOL,
          timeframe: TF,
          asOf,
          barOpenTime: vector!.barOpenTime,
          featureSetVersion: `${vector!.featureSetVersion}#tampered`,
          values: tampered as unknown as Prisma.InputJsonValue,
          missing: vector!.missing,
          hash: vector!.hash,
        },
      });

      const check = await store.verifyNoSkew(row.id);
      expect(check.matched).toBe(false);
      expect(check.differences.some((d) => d.feature === 'rsi_14')).toBe(true);
    });

    it('refuses to overwrite a recorded vector when a recomputation disagrees', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: end });
      const asOf = new Date('2026-06-01T12:30:00Z');
      const { vector } = await engine.compute({ symbol: SYMBOL, timeframe: TF, asOf, contextTimeframes: [] });
      await store.record(vector!);

      // The recorded value is the historical fact. A disagreement is a finding to surface, not a
      // number to correct.
      const divergent = { ...vector!, hash: 'f'.repeat(64) };
      await store.record(divergent);

      const rows = await prisma.featureVectorRecord.findMany({ where: { symbol: SYMBOL, asOf } });
      expect(rows).toHaveLength(1);
      expect(rows[0].hash).toBe(vector!.hash);
    });

    it('survives storage without losing a digit', async () => {
      // Prisma's Json column does not round-trip a double — writing 11.154987603973913 and
      // reading it back yields 11.15498760397391. Invisible almost anywhere else; fatal here,
      // because the skew check compares exactly and would fail on every single vector.
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: end });
      const asOf = new Date('2026-06-01T12:30:00Z');
      const { vector } = await engine.compute({ symbol: SYMBOL, timeframe: TF, asOf, contextTimeframes: [] });
      await store.record(vector!);

      const row = await prisma.featureVectorRecord.findFirstOrThrow({ where: { symbol: SYMBOL } });
      const { deserialiseValues } = await import('../src/features/feature-engine.service');
      const readBack = deserialiseValues(row.values as unknown as Record<string, string>);

      for (const [id, v] of Object.entries(vector!.values)) {
        expect(readBack[id]).toBe(v);
      }
    });

    it('round-trips through the online store identically', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: end });
      const { vector } = await engine.compute({
        symbol: SYMBOL, timeframe: TF, asOf: new Date('2026-06-01T12:30:00Z'), contextTimeframes: [],
      });
      await store.record(vector!);

      const online = await store.online(SYMBOL, TF);
      expect(online!.hash).toBe(vector!.hash);
      expect(online!.values).toEqual(vector!.values);
    });

    it('cannot have a recorded vector edited afterwards', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: end });
      const { vector } = await engine.compute({
        symbol: SYMBOL, timeframe: TF, asOf: new Date('2026-06-01T12:30:00Z'), contextTimeframes: [],
      });
      await store.record(vector!);

      await expect(
        prisma.$executeRaw`UPDATE feature_vectors SET hash = ${'a'.repeat(64)} WHERE symbol = ${SYMBOL}`,
      ).rejects.toThrow(/append-only/i);
    });
  });

  // ── Point-in-time behaviour ─────────────────────────────────────────────

  describe('point-in-time', () => {
    it('produces a different vector at an earlier instant, from less data', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 50, timeframe: TF, endOpenTime: end });

      const later = await engine.compute({
        symbol: SYMBOL, timeframe: TF, asOf: new Date('2026-06-01T12:30:00Z'), contextTimeframes: [],
      });
      const earlier = await engine.compute({
        symbol: SYMBOL, timeframe: TF, asOf: new Date('2026-06-01T02:30:00Z'), contextTimeframes: [],
      });

      expect(later.vector).not.toBeNull();
      expect(earlier.vector).not.toBeNull();
      expect(earlier.vector!.hash).not.toBe(later.vector!.hash);
      // And the earlier one is anchored to an earlier bar, not to the same one with old numbers.
      expect(earlier.vector!.barOpenTime.getTime()).toBeLessThan(later.vector!.barOpenTime.getTime());
    });

    it('is unaffected by bars that arrived after the instant it was computed for', async () => {
      const end = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: end });
      const asOf = new Date('2026-06-01T12:30:00Z');

      const before = await engine.compute({ symbol: SYMBOL, timeframe: TF, asOf, contextTimeframes: [] });

      // Ten more bars arrive. A vector for the earlier instant must not change — this is the
      // property that makes a backtest reproducible months later.
      await seed({
        count: 10,
        timeframe: TF,
        endOpenTime: new Date(end.getTime() + 10 * TIMEFRAME_MS[TF]),
      });

      const after = await engine.compute({ symbol: SYMBOL, timeframe: TF, asOf, contextTimeframes: [] });
      expect(after.vector!.hash).toBe(before.vector!.hash);
    });

    it('produces no vector at all when the gate refuses', async () => {
      await seed({ count: 30, timeframe: TF, endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const { vector, quality } = await engine.compute({
        symbol: SYMBOL, timeframe: TF, asOf: new Date('2026-06-01T12:30:00Z'),
      });

      // Not a partial vector with a quality flag. Everything downstream is entitled to assume a
      // vector it was handed came from data that passed.
      expect(vector).toBeNull();
      expect(quality!.passed).toBe(false);
    });
  });

  // ── Warmup and nulls ────────────────────────────────────────────────────

  describe('warmup and null discipline', () => {
    it('nulls a feature whose warmup the window does not satisfy', async () => {
      // Exactly enough bars for the short features, not for the 200-period ones.
      await seed({ count: 120, timeframe: TF, endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const { vector } = await engine.compute({
        symbol: SYMBOL,
        timeframe: TF,
        asOf: new Date('2026-06-01T12:30:00Z'),
        contextTimeframes: [],
        skipQualityGate: true,
      });

      expect(vector!.values['price_vs_sma_20']).not.toBeNull();
      // A 200-EMA over 120 bars is not an approximation of a 200-EMA. It is a different number.
      expect(vector!.values['price_vs_sma_200']).toBeNull();
      expect(vector!.missing).toContain('price_vs_sma_200');
    });

    it('never encodes an absent value as zero', async () => {
      await seed({ count: 120, timeframe: TF, endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const { vector } = await engine.compute({
        symbol: SYMBOL,
        timeframe: TF,
        asOf: new Date('2026-06-01T12:30:00Z'),
        contextTimeframes: [],
        skipQualityGate: true,
      });

      // Zero is a value a model learns from. Encoding "unknown" as 0.0 teaches it the indicator
      // was neutral when in fact nothing was known.
      for (const id of vector!.missing) expect(vector!.values[id]).toBeNull();
    });

    it('distinguishes a null column from an absent one in the hash', async () => {
      await seed({ count: NEEDED + 20, timeframe: TF, endOpenTime: new Date('2026-06-01T11:00:00Z') });
      const { vector } = await engine.compute({
        symbol: SYMBOL, timeframe: TF, asOf: new Date('2026-06-01T12:30:00Z'), contextTimeframes: [],
      });

      const withNull = { ...vector!.values, rsi_14: null };
      const withoutKey = { ...vector!.values };
      delete withoutKey.rsi_14;

      const { hashValues } = await import('../src/features/feature-engine.service');
      expect(hashValues(withNull)).not.toBe(hashValues(withoutKey));
    });
  });

  // ── Multi-timeframe ─────────────────────────────────────────────────────

  describe('multi-timeframe assembly', () => {
    it('folds higher timeframes in under their own prefix', async () => {
      const end1h = new Date('2026-06-01T11:00:00Z');
      await seed({ count: NEEDED + 20, timeframe: '1h', endOpenTime: end1h });
      await seed({ count: 250, timeframe: '4h', endOpenTime: new Date('2026-06-01T08:00:00Z') });

      const { vector } = await engine.compute({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2026-06-01T12:30:00Z'),
        contextTimeframes: ['4h'],
      });

      expect(vector!.values['rsi_14']).not.toBeNull();
      expect(vector!.values['4h_rsi_14']).not.toBeNull();
      // The two must be genuinely different numbers — the same value would mean the higher
      // timeframe was never actually read.
      expect(vector!.values['4h_rsi_14']).not.toBe(vector!.values['rsi_14']);
    });

    it('uses only a higher-timeframe bar that has already closed', async () => {
      await seed({ count: NEEDED + 20, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z') });
      // 4h bars up to the one opening at 08:00, which closes at 12:00.
      await seed({ count: 250, timeframe: '4h', endOpenTime: new Date('2026-06-01T08:00:00Z') });

      // At 12:30 the 12:00 4h bar is forming and does not exist in the store. The 08:00 bar is
      // the newest closed one, and it is what the vector must use.
      const { vector } = await engine.compute({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2026-06-01T12:30:00Z'),
        contextTimeframes: ['4h'],
      });

      const newest4h = await candles.latestKnowableAt({
        symbol: SYMBOL, timeframe: '4h', asOf: new Date('2026-06-01T12:30:00Z'),
      });
      expect(newest4h!.openTime.toISOString()).toBe('2026-06-01T08:00:00.000Z');
      expect(vector!.values['4h_rsi_14']).not.toBeNull();
    });

    it('records a missing higher timeframe as null columns rather than omitting it', async () => {
      await seed({ count: NEEDED + 20, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z') });
      // No 4h data at all.
      const { vector } = await engine.compute({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2026-06-01T12:30:00Z'),
        contextTimeframes: ['4h'],
      });

      // The model must be able to tell "the 4h said nothing" from "there was no 4h".
      expect(vector!.values).toHaveProperty('4h_rsi_14');
      expect(vector!.values['4h_rsi_14']).toBeNull();
      expect(vector!.missing).toContain('4h_rsi_14');
    });

    it('represents timeframe conflict rather than averaging it away', async () => {
      // 1h rising hard, 4h falling hard — the exact case the spec calls out.
      const up = Array.from({ length: NEEDED + 20 }, (_, i) => 100_000 * (1 + i * 0.001));
      const down = Array.from({ length: 250 }, (_, i) => 100_000 * (1 - i * 0.001));

      await seed({ count: up.length, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z'), closes: up });
      await seed({ count: down.length, timeframe: '4h', endOpenTime: new Date('2026-06-01T08:00:00Z'), closes: down });

      const { vector } = await engine.compute({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2026-06-01T12:30:00Z'),
        contextTimeframes: ['4h'],
      });

      expect(vector!.values['tf_votes']).toBe(2);
      // Split vote: alignment near zero and conflict at its maximum. An averaged "slightly
      // bullish" reading here would be the bug — the honest answer is "these disagree".
      expect(Math.abs(vector!.values['tf_alignment'] as number)).toBeLessThan(0.6);
      expect(vector!.values['tf_conflict']).toBe(1);
    });

    it('reports full alignment when every timeframe agrees', async () => {
      const up1h = Array.from({ length: NEEDED + 20 }, (_, i) => 100_000 * (1 + i * 0.001));
      const up4h = Array.from({ length: 250 }, (_, i) => 100_000 * (1 + i * 0.002));

      await seed({ count: up1h.length, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z'), closes: up1h });
      await seed({ count: up4h.length, timeframe: '4h', endOpenTime: new Date('2026-06-01T08:00:00Z'), closes: up4h });

      const { vector } = await engine.compute({
        symbol: SYMBOL,
        timeframe: '1h',
        asOf: new Date('2026-06-01T12:30:00Z'),
        contextTimeframes: ['4h'],
      });

      expect(vector!.values['tf_alignment']).toBe(1);
      expect(vector!.values['tf_conflict']).toBe(0);
    });
  });

  // ── The contract ────────────────────────────────────────────────────────

  describe('feature contract', () => {
    it('offers at least 100 features on the anchor timeframe alone', async () => {
      const set = buildFeatureSet(TF);
      expect(set.length).toBeGreaterThanOrEqual(100);
      // And well past that once higher-timeframe context is folded in.
      expect(engine.columnCount(TF)).toBeGreaterThan(200);
    });

    it('covers every declared category', async () => {
      const cats = new Set(buildFeatureSet(TF).map((s) => s.category));
      expect([...cats].sort()).toEqual([
        'momentum',
        'statistical',
        'structure',
        'trend',
        'volatility',
        'volume',
      ]);
    });

    it('has no duplicate ids', async () => {
      const ids = buildFeatureSet(TF).map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('produces a version that depends on content, not on ordering', async () => {
      const set = buildFeatureSet(TF);
      const shuffled = [...set].reverse();
      expect(featureSetVersion(shuffled)).toBe(featureSetVersion(set));
    });

    it('changes the version when a feature version is bumped', async () => {
      const set = buildFeatureSet(TF);
      const bumped = set.map((s, i) => (i === 0 ? { ...s, version: s.version + 1 } : s));
      expect(featureSetVersion(bumped)).not.toBe(featureSetVersion(set));
    });

    it('annualises volatility differently per timeframe, as it must', async () => {
      // The same feature id on 1h and 1d is not the same number, because bars-per-year differs.
      // A shared constant here would scale every volatility feature wrongly on all but one
      // timeframe.
      const closes = walk(300);
      await seed({ count: 300, timeframe: '1h', endOpenTime: new Date('2026-06-01T11:00:00Z'), closes });
      await seed({ count: 300, timeframe: '1d', endOpenTime: new Date('2026-06-01T00:00:00Z'), closes });

      const hourly = await engine.compute({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date('2026-06-01T12:30:00Z'),
        contextTimeframes: [], skipQualityGate: true,
      });
      const daily = await engine.compute({
        symbol: SYMBOL, timeframe: '1d', asOf: new Date('2026-06-02T00:30:00Z'),
        contextTimeframes: [], skipQualityGate: true,
      });

      const h = hourly.vector!.values['realized_vol_20'] as number;
      const d = daily.vector!.values['realized_vol_20'] as number;
      expect(h / d).toBeCloseTo(Math.sqrt(8_760 / 365), 6);
    });
  });

  // ── Live data ───────────────────────────────────────────────────────────

  describe('against real market data', () => {
    liveIt('computes a full vector from live OKX bars and verifies it recomputes', async () => {
      await ingestion.ingest(SYMBOL, '1h', 300);

      const asOf = new Date();
      const { vector, quality } = await engine.compute({
        symbol: SYMBOL, timeframe: '1h', asOf, contextTimeframes: [], skipQualityGate: true,
      });
      expect(vector).not.toBeNull();
      void quality;

      // Real data, real indicators: the great majority of columns must actually be populated.
      const populated = Object.values(vector!.values).filter((v) => v !== null).length;
      expect(populated / Object.keys(vector!.values).length).toBeGreaterThan(0.9);

      // And every populated value is finite — no NaN or Infinity reaching a model.
      for (const [id, v] of Object.entries(vector!.values)) {
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
        void id;
      }

      await store.record(vector!);
      const row = await prisma.featureVectorRecord.findFirstOrThrow({ where: { symbol: SYMBOL } });
      const check = await store.verifyNoSkew(row.id);
      expect(check.matched).toBe(true);
    }, 120_000);

    liveIt('keeps RSI and %B inside their definitional bounds on real data', async () => {
      await ingestion.ingest(SYMBOL, '1h', 300);
      const { vector } = await engine.compute({
        symbol: SYMBOL, timeframe: '1h', asOf: new Date(), contextTimeframes: [], skipQualityGate: true,
      });

      for (const id of ['rsi_7', 'rsi_14', 'rsi_21', 'rsi_30']) {
        const v = vector!.values[id];
        if (v === null) continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      for (const id of ['stoch_k_14', 'mfi_14']) {
        const v = vector!.values[id];
        if (v === null) continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      const donchian = vector!.values['donchian_pos_20'];
      if (donchian !== null) {
        expect(donchian).toBeGreaterThanOrEqual(0);
        expect(donchian).toBeLessThanOrEqual(1);
      }
    }, 120_000);
  });

  // ── Operator surface ────────────────────────────────────────────────────

  describe('operator surface', () => {
    it('publishes the catalog with versions and warmups', async () => {
      const res = await request(server())
        .get('/api/v1/admin/features/catalog')
        .query({ timeframe: '1h' })
        .set(auth(adminToken))
        .expect(200);

      expect(res.body.anchorFeatures).toBeGreaterThanOrEqual(100);
      expect(res.body.featureSetVersion).toMatch(/^\d+-[0-9a-f]{16}$/);
      expect(res.body.features[0]).toHaveProperty('warmupBars');
      expect(res.body.byCategory).toHaveProperty('momentum');
    });

    it('reports a refused gate as a refusal, not as an empty vector', async () => {
      const res = await request(server())
        .get('/api/v1/admin/features/compute')
        .query({ symbol: SYMBOL, timeframe: '1h', asOf: new Date().toISOString() })
        .set(auth(adminToken))
        .expect(200);

      expect(res.body.computed).toBe(false);
      expect(res.body.quality.passed).toBe(false);
      expect(res.body.reason).toMatch(/refused/i);
    });

    it('offers no endpoint that writes a feature value', async () => {
      // A hand-set feature is a hand-set model input, and the offline/online invariant is only
      // meaningful if every number came from the same code over the same data.
      const routes = app.getHttpAdapter().getInstance()._router?.stack ?? [];
      const paths: string[] = routes
        .filter((l: { route?: { path: string } }) => l.route)
        .map((l: { route: { path: string } }) => l.route.path);
      expect(paths.filter((p) => p.includes('features') && p.includes('set'))).toEqual([]);
    });

    it('is closed to ordinary users', async () => {
      const email = `user-${randomUUID()}@example.com`;
      const reg = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);
      await request(server())
        .get('/api/v1/admin/features/catalog')
        .set(auth(reg.body.accessToken))
        .expect(403);
    });
  });
});
