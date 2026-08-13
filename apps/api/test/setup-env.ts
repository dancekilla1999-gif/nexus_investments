/**
 * Loaded by Jest's `setupFiles` before any test file (or the application code it imports) is
 * evaluated — required because `AppConfigModule` validates `process.env` eagerly at import
 * time (see docs/03's note on `ConfigModule.forRoot`'s eager evaluation), so these must exist
 * before that import chain runs at all, not just before the first `describe` block executes.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PLATFORM_MODE = process.env.PLATFORM_MODE ?? 'sandbox';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://nexus:nexus_dev_password@localhost:5432/nexus_investments_test?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'e2e-test-secret-0123456789abcdef';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY ?? 'e2e-test-encryption-key';
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '30d';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.NOTIFICATIONS_EMAIL_PROVIDER = process.env.NOTIFICATIONS_EMAIL_PROVIDER ?? 'console';
process.env.THROTTLE_LIMIT_DEFAULT = process.env.THROTTLE_LIMIT_DEFAULT ?? '1000';
