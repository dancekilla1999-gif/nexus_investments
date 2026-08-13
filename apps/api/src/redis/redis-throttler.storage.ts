import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Real Redis-backed rate limiting, correct under concurrent requests across multiple API
 * instances — the in-memory storage `@nestjs/throttler` ships by default only rate-limits
 * within a single process, which silently breaks the guarantee the moment the API scales
 * horizontally. See docs/05-security-architecture.md §5.
 *
 * The hit-counter increment, TTL, and block-flag are all applied by a single Lua script so a
 * request can never observe a half-applied state under concurrency (no separate
 * GET-then-SET race).
 */
const INCREMENT_SCRIPT = `
local hitKey = KEYS[1]
local blockKey = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDurationMs = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl and blockTtl > 0 then
  local hits = tonumber(redis.call('GET', hitKey) or '0')
  local hitTtl = redis.call('PTTL', hitKey)
  return { hits, hitTtl > 0 and hitTtl or 0, 1, blockTtl }
end

local hits = redis.call('INCR', hitKey)
if hits == 1 then
  redis.call('PEXPIRE', hitKey, ttlMs)
end
local timeToExpire = redis.call('PTTL', hitKey)

local isBlocked = 0
local timeToBlockExpire = 0
if hits > limit then
  isBlocked = 1
  if blockDurationMs > 0 then
    redis.call('SET', blockKey, '1', 'PX', blockDurationMs)
    timeToBlockExpire = blockDurationMs
  end
end

return { hits, timeToExpire > 0 and timeToExpire or 0, isBlocked, timeToBlockExpire }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttle:{${throttlerName}}:${key}`;
    const blockKey = `${hitKey}:blocked`;

    const [totalHits, timeToExpire, isBlockedRaw, timeToBlockExpire] = (await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      hitKey,
      blockKey,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpire / 1000),
      isBlocked: isBlockedRaw === 1,
      timeToBlockExpire: Math.ceil(timeToBlockExpire / 1000),
    };
  }
}
