import { z } from 'zod';

/**
 * Every environment variable the API reads is declared here and validated at boot.
 * The process refuses to start with a missing/malformed required value — we do not want a
 * misconfigured JWT secret or database URL to fail silently at request time in production.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PLATFORM_MODE: z.enum(['sandbox', 'live']).default('sandbox'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be a long random value — see .env.example')
    .default('dev-only-insecure-secret-change-me-0123456789'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  TOTP_ISSUER: z.string().default('Nexus Investments'),

  // Wraps secrets-at-rest (TOTP secrets) with envelope encryption — see
  // docs/05-security-architecture.md §4. In production this key is itself sourced from a KMS,
  // never a static env var; the dev default below is intentionally insecure and rejected in
  // production the same way JWT_ACCESS_SECRET's default is.
  APP_ENCRYPTION_KEY: z
    .string()
    .default('dev-only-insecure-encryption-key-32b!!'),

  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT_DEFAULT: z.coerce.number().int().positive().default(120),
  THROTTLE_LIMIT_AUTH: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.string().default('info'),

  NOTIFICATIONS_EMAIL_PROVIDER: z.enum(['console', 'resend', 'ses']).default('console'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration — see errors above and .env.example');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_ACCESS_SECRET.startsWith('dev-only')) {
    throw new Error('Refusing to start in production with the default JWT_ACCESS_SECRET.');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.APP_ENCRYPTION_KEY.startsWith('dev-only')) {
    throw new Error('Refusing to start in production with the default APP_ENCRYPTION_KEY.');
  }
  return parsed.data;
}
