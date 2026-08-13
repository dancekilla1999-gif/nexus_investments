/**
 * Kept in its own file, separate from redis.module.ts: consumers that only need the DI token
 * (RedisThrottlerStorage, HealthController) must not have to pull in the module's own import
 * graph (AppConfigModule → ConfigModule.forRoot, which validates process.env eagerly at
 * import time) just to reference a symbol. This is what let redis-throttler.storage.spec.ts
 * exercise the class directly against a real Redis without booting the whole app config.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
