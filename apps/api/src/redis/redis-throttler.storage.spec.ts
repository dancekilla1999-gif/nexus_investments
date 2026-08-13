import Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Exercises the actual Lua script against a real Redis instance — the atomicity guarantee
 * this class exists for is exactly the kind of thing a mock would rubber-stamp incorrectly.
 * Skipped automatically if no local Redis is reachable (see docs/09-roadmap.md — CI wiring).
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('RedisThrottlerStorage', () => {
  let redis: Redis;
  let storage: RedisThrottlerStorage;
  let redisAvailable = true;

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, { lazyConnect: true, retryStrategy: () => null });
    try {
      await redis.connect();
    } catch {
      redisAvailable = false;
    }
    storage = new RedisThrottlerStorage(redis);
  });

  afterAll(async () => {
    if (redisAvailable) await redis.quit();
  });

  beforeEach(async () => {
    if (redisAvailable) await redis.flushdb();
  });

  const maybeIt = () => (redisAvailable ? it : it.skip);

  maybeIt()('allows requests under the limit and reports remaining correctly', async () => {
    const key = 'user-1';
    const r1 = await storage.increment(key, 60_000, 3, 60_000, 'default');
    expect(r1).toEqual({ totalHits: 1, timeToExpire: expect.any(Number), isBlocked: false, timeToBlockExpire: 0 });

    const r2 = await storage.increment(key, 60_000, 3, 60_000, 'default');
    expect(r2.totalHits).toBe(2);
    expect(r2.isBlocked).toBe(false);
  });

  maybeIt()('blocks once the limit is exceeded and stays blocked for blockDuration', async () => {
    const key = 'user-2';
    for (let i = 0; i < 3; i++) {
      await storage.increment(key, 60_000, 3, 5_000, 'default');
    }
    // 4th hit exceeds limit=3
    const over = await storage.increment(key, 60_000, 3, 5_000, 'default');
    expect(over.isBlocked).toBe(true);
    expect(over.timeToBlockExpire).toBeGreaterThan(0);

    // Still blocked on the very next call, without re-incrementing past the block.
    const stillBlocked = await storage.increment(key, 60_000, 3, 5_000, 'default');
    expect(stillBlocked.isBlocked).toBe(true);
  });

  maybeIt()('tracks separate throttler names independently for the same key', async () => {
    const key = 'user-3';
    await storage.increment(key, 60_000, 1, 60_000, 'auth');
    const other = await storage.increment(key, 60_000, 5, 60_000, 'default');
    expect(other.totalHits).toBe(1);
    expect(other.isBlocked).toBe(false);
  });

  maybeIt()('is safe under concurrent increments (no lost updates)', async () => {
    const key = 'user-concurrent';
    const results = await Promise.all(
      Array.from({ length: 20 }, () => storage.increment(key, 60_000, 100, 60_000, 'default')),
    );
    const totals = results.map((r) => r.totalHits).sort((a, b) => a - b);
    expect(totals).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
