import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  LedgerAccountType,
  LedgerTransactionType,
  Prisma,
  StrategyStatus,
  UserStatus,
} from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { LedgerService } from '../src/ledger/ledger.service';
import { MarkRegistry, NoMarkError, StaleMarkError } from '../src/nav/mark.registry';
import { NavService } from '../src/nav/nav.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * The NAV engine (docs/12 §5).
 *
 * Two properties are the whole milestone, and both are about who may influence the number:
 * `navPerUnit` is written by this engine and by nothing else, and prices are **sourced**, never
 * supplied. The tests that matter here are the refusals — an engine that always produces a
 * number is an engine that will produce a wrong one.
 */
describe('NAV engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let nav: NavService;
  let marks: MarkRegistry;
  let redis: Redis;

  let usdcId: string;
  let wbtcId: string;
  let unlistedId: string;
  let strategyId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);
    nav = app.get(NavService);
    marks = app.get(MarkRegistry);
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
        update: { coingeckoId: 'usd-coin', isEnabled: true },
        create: {
          symbol: 'USDC', name: 'USD Coin', chainId: chain.id, decimals: 6,
          kind: 'TOKEN', coingeckoId: 'usd-coin',
        },
      })
    ).id;

    wbtcId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'WBTC' } },
        update: { coingeckoId: 'wrapped-bitcoin', isEnabled: true },
        create: {
          symbol: 'WBTC', name: 'Wrapped BTC', chainId: chain.id, decimals: 8,
          kind: 'TOKEN', coingeckoId: 'wrapped-bitcoin',
        },
      })
    ).id;

    // Deliberately has no feed identifier — the "we cannot price this" case.
    unlistedId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'NOFEED' } },
        update: { coingeckoId: null, isEnabled: true },
        create: {
          symbol: 'NOFEED', name: 'Unlisted Token', chainId: chain.id, decimals: 18,
          kind: 'TOKEN', coingeckoId: null,
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

    strategyId = (
      await prisma.investmentStrategy.create({
        data: {
          slug: `nav-${randomUUID().slice(0, 8)}`,
          name: 'Valuation test',
          description: 'A strategy for exercising the NAV engine.',
          baseAssetId: usdcId,
          minimumInvestment: '1',
          status: StrategyStatus.OPEN,
        },
      })
    ).id;
  });

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

  /** Puts a mark straight into the cache so a test can dictate a price without a live feed. */
  async function seedMark(assetId: string, price: string, ageSeconds = 0) {
    await redis.set(
      `mark:${assetId}:${usdcId}`,
      JSON.stringify({
        price,
        source: 'test-fixture',
        asOf: new Date(Date.now() - ageSeconds * 1000).toISOString(),
      }),
      'EX',
      300,
    );
  }

  async function setUnits(units: string) {
    await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { totalUnits: units } });
  }

  // ── Valuation ───────────────────────────────────────────────────────────

  describe('valuing a pool', () => {
    it('values the base asset at par without asking any feed', async () => {
      // A USDC pool valuing its USDC needs no price. Requiring one would invent a failure mode
      // where there is no uncertainty.
      await fundPool(usdcId, '1000');

      const valuation = await nav.valuePool(strategyId);
      expect(valuation.poolNav.toFixed(2)).toBe('1000.00');
      expect(valuation.cashComponent.toFixed(2)).toBe('1000.00');
      expect(valuation.positionComponent.toFixed(2)).toBe('0.00');
      expect(valuation.marks[0].source).toBe('identity');
    });

    it('values a position at a sourced price and separates it from cash', async () => {
      await fundPool(usdcId, '1000');
      await fundPool(wbtcId, '0.5');
      await seedMark(wbtcId, '60000');

      const valuation = await nav.valuePool(strategyId);
      expect(valuation.cashComponent.toFixed(2)).toBe('1000.00');
      expect(valuation.positionComponent.toFixed(2)).toBe('30000.00');
      expect(valuation.poolNav.toFixed(2)).toBe('31000.00');
    });

    it('records provenance for every mark it used', async () => {
      // A historical NAV without provenance is an assertion nobody can check — and a
      // performance fee computed from it is indefensible.
      await fundPool(usdcId, '1000');
      await fundPool(wbtcId, '0.25');
      await seedMark(wbtcId, '40000');

      const valuation = await nav.valuePool(strategyId);
      const wbtcMark = valuation.marks.find((m) => m.assetSymbol === 'WBTC')!;

      expect(wbtcMark).toMatchObject({
        quantity: '0.25',
        price: '40000',
        value: '10000',
        source: 'test-fixture',
      });
      expect(new Date(wbtcMark.asOf).getTime()).toBeGreaterThan(0);
    });

    it('ignores a zero balance rather than demanding a price for it', async () => {
      // Otherwise an unrelated dead feed would block a valuation that does not depend on it.
      await fundPool(usdcId, '1000');
      await fundPool(unlistedId, '5');
      await ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `unwind:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId: unlistedId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount: '-5' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId: unlistedId, type: LedgerAccountType.EXTERNAL, amount: '5' },
        ],
      });

      const valuation = await nav.valuePool(strategyId);
      expect(valuation.poolNav.toFixed(2)).toBe('1000.00');
    });
  });

  // ── Refusals: the part that matters ─────────────────────────────────────

  describe('refusing to produce a number it cannot justify', () => {
    it('fails rather than valuing an unpriceable holding at zero', async () => {
      // Zero-valuing understates NAV, which understates every investor's stake and shrinks the
      // performance-fee base — wrong in a direction someone benefits from.
      await fundPool(usdcId, '1000');
      await fundPool(unlistedId, '5');

      await expect(nav.valuePool(strategyId)).rejects.toThrow(NoMarkError);
      await expect(nav.valuePool(strategyId)).rejects.toThrow(/NOFEED/);
    });

    it('fails rather than valuing on a stale price', async () => {
      // A dead feed answers instantly with yesterday's number. Age is judged on the provider's
      // own observation time, not on when we called it.
      await fundPool(usdcId, '1000');
      await fundPool(wbtcId, '1');
      await seedMark(wbtcId, '60000', 60 * 60 * 24);

      await expect(nav.valuePool(strategyId)).rejects.toThrow(StaleMarkError);
    });

    it('accepts a price inside the freshness window', async () => {
      // No cash leg at all — the pool holds only the position.
      await fundPool(wbtcId, '1');
      await seedMark(wbtcId, '60000', 60);

      const valuation = await nav.valuePool(strategyId);
      expect(valuation.poolNav.toFixed(2)).toBe('60000.00');
    });

    it('does not let the cache launder a stale price into a fresh one', async () => {
      // The cache stores the provider's `asOf`, so a hit is re-checked for age. Resetting the
      // timestamp on write would make any cached price permanently "fresh".
      await fundPool(wbtcId, '1');
      await seedMark(wbtcId, '60000', 30);

      // First read succeeds and re-caches.
      await nav.valuePool(strategyId);

      // Age the cached entry past the limit without touching the feed.
      await seedMark(wbtcId, '60000', 60 * 60 * 24);
      await expect(nav.valuePool(strategyId)).rejects.toThrow(StaleMarkError);
    });

    it('rejects a non-positive price outright', async () => {
      await fundPool(wbtcId, '1');
      await seedMark(wbtcId, '0');

      await expect(nav.valuePool(strategyId)).rejects.toThrow(NoMarkError);
    });
  });

  // ── Snapshots ───────────────────────────────────────────────────────────

  describe('snapshots', () => {
    it('computes navPerUnit from the pool and the unit register', async () => {
      await fundPool(usdcId, '3000');
      await setUnits('1500');

      const snapshot = await nav.strikeSnapshot(strategyId, false);
      expect(snapshot.navPerUnit.toFixed(2)).toBe('2.00');
      expect(snapshot.isDealingPoint).toBe(false);
    });

    it('prices a strategy with no units yet at inception, not at infinity', async () => {
      // An empty pool: nothing has been subscribed yet.
      const snapshot = await nav.strikeSnapshot(strategyId, false);
      expect(snapshot.navPerUnit.toFixed(2)).toBe('1.00');
    });

    it('stores the marks it used, immutably', async () => {
      await fundPool(usdcId, '100');
      await fundPool(wbtcId, '0.01');
      await seedMark(wbtcId, '50000');
      await setUnits('600');

      const snapshot = await nav.strikeSnapshot(strategyId, false);
      expect(snapshot.marks).toEqual(
        expect.arrayContaining([expect.objectContaining({ assetSymbol: 'WBTC', price: '50000' })]),
      );

      await expect(
        prisma.navSnapshot.update({ where: { id: snapshot.id }, data: { navPerUnit: '999' } }),
      ).rejects.toThrow(/append-only/);
    });

    it('has no code path that accepts a price — the MVP15 acceptance criterion', async () => {
      // Structural, not behavioural: `strikeSnapshot` takes a strategy and a boolean. There is
      // no parameter, DTO field or admin route anywhere through which an operator can pass a
      // valuation. This asserts the shape so a future refactor cannot quietly add one.
      expect(nav.strikeSnapshot.length).toBe(2);
      expect(marks.requireMark.length).toBe(2);

      const registryMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(marks));
      expect(registryMethods.filter((m) => /^set|^put|^override/.test(m))).toEqual([]);
    });
  });

  // ── Scheduled revaluation ───────────────────────────────────────────────

  describe('scheduled revaluation', () => {
    it('marks live strategies to market and reports failures rather than hiding them', async () => {
      await fundPool(usdcId, '500');
      await setUnits('500');

      // A second strategy the engine cannot price.
      const broken = await prisma.investmentStrategy.create({
        data: {
          slug: `broken-${randomUUID().slice(0, 8)}`,
          name: 'Unpriceable',
          description: 'Holds an asset with no feed.',
          baseAssetId: usdcId,
          minimumInvestment: '1',
          status: StrategyStatus.OPEN,
        },
      });
      await ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `broken:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId: unlistedId, type: LedgerAccountType.EXTERNAL, amount: '-1' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId: unlistedId, type: LedgerAccountType.STRATEGY_POOL, strategyId: broken.id, amount: '1' },
        ],
      });

      const result = await nav.revalueAll();

      // One valued, one failed — and the healthy one is not blocked by the broken one.
      expect(result.valued).toBe(1);
      expect(result.failed).toBe(1);
      expect(await nav.latestSnapshot(strategyId)).not.toBeNull();
      expect(await nav.latestSnapshot(broken.id)).toBeNull();
    });

    it('does not revalue a closed strategy', async () => {
      await fundPool(usdcId, '500');
      await prisma.investmentStrategy.update({
        where: { id: strategyId },
        data: { status: StrategyStatus.CLOSED },
      });

      const result = await nav.revalueAll();
      expect(result.valued).toBe(0);
    });
  });

  // ── Live feed ───────────────────────────────────────────────────────────

  /**
   * Against the real CoinGecko API. Opt out with SKIP_LIVE_MARK_TESTS=1 — explicitly, never by
   * silently degrading: a price test that passes because it quietly stopped calling the price
   * source is worse than no test.
   */
  const liveIt = process.env.SKIP_LIVE_MARK_TESTS === '1' ? it.skip : it;

  describe('live CoinGecko feed', () => {
    liveIt(
      'returns a plausible, freshly-timestamped BTC price in USDC',
      async () => {
        await redis.flushdb();
        const mark = await marks.requireMark(wbtcId, usdcId);

        // A wide band on purpose: this asserts the plumbing works and the number is sane, not
        // what Bitcoin is worth today. A tight band would be a test that fails on market moves.
        expect(mark.price.greaterThan(new Prisma.Decimal(1000))).toBe(true);
        expect(mark.price.lessThan(new Prisma.Decimal(10_000_000))).toBe(true);
        expect(mark.source).toBe('coingecko');

        const ageSeconds = (Date.now() - mark.asOf.getTime()) / 1000;
        expect(ageSeconds).toBeLessThan(60 * 60 * 6);
      },
      30_000,
    );

    liveIt(
      'serves the second read from cache without a second upstream call',
      async () => {
        await redis.flushdb();
        await marks.requireMark(wbtcId, usdcId);

        const started = Date.now();
        const cached = await marks.requireMark(wbtcId, usdcId);
        expect(Date.now() - started).toBeLessThan(200);
        expect(cached.source).toBe('coingecko');
      },
      30_000,
    );
  });
});
