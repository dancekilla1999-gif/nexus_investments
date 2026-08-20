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

  // Applies to every route via the global ThrottlerGuard (app.module.ts). A handful of
  // sensitive auth routes additionally carry a stricter, static @Throttle() override in
  // auth.controller.ts — those are deliberately NOT env-configurable (see the comment there)
  // so this file doesn't advertise a config knob that nothing actually reads.
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT_DEFAULT: z.coerce.number().int().positive().default(120),

  LOG_LEVEL: z.string().default('info'),

  // ── Blockchain (MVP2 deposits) ──
  // Per-chain RPC endpoints and account-level extended PUBLIC keys, resolved by chain key
  // (see AppConfigService.chainRpcUrl / chainAccountXpub). A chain missing either is skipped
  // by the adapter registry with a loud warning rather than silently watching nothing.
  //
  // An xpub is a public key: it derives deposit addresses and can sign nothing. Signing keys
  // never appear in configuration at all — see docs/06-blockchain-architecture.md §4.
  EVM_RPC_URL_SEPOLIA: z.string().optional(),
  EVM_ACCOUNT_XPUB_SEPOLIA: z.string().optional(),

  /** How many blocks a single watcher pass may scan. Bounds RPC cost per tick. */
  DEPOSIT_SCAN_BATCH_BLOCKS: z.coerce.number().int().positive().max(2000).default(50),
  /** Watcher poll interval. */
  DEPOSIT_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  /** Set to '1' to keep the deposit watcher from starting (tests drive it manually). */
  DEPOSIT_WATCHER_DISABLED: z.string().optional(),

  /**
   * How often custody reconciliation compares the ledger's obligations against on-chain
   * holdings. Every run costs one balance read per (address × asset), so this is deliberately
   * far slower than the deposit scan: it is a safety net, not a data source.
   */
  RECONCILIATION_INTERVAL_MS: z.coerce.number().int().positive().default(900_000),
  /** Set to '1' to keep custody reconciliation from starting (tests drive it manually). */
  RECONCILIATION_DISABLED: z.string().optional(),

  // ── NAV engine (MVP15) ──
  COINGECKO_BASE_URL: z.string().default('https://api.coingecko.com/api/v3'),
  COINGECKO_API_KEY: z.string().optional(),
  /**
   * How old a mark may be before valuation refuses it. A dead feed answers instantly with
   * yesterday's price, so this is the only thing standing between a frozen oracle and a NAV
   * that looks perfectly healthy.
   */
  MARK_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(900),
  /** Short cache so several strategies revaluing together make one upstream call. */
  MARK_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  NAV_REVALUATION_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  /** Set to '1' to keep scheduled revaluation from starting (tests drive it manually). */
  NAV_REVALUATION_DISABLED: z.string().optional(),

  // ── Fee engine (MVP16/17) ──
  /**
   * How often fees are accrued. The interval deliberately does not appear in the arithmetic:
   * each position carries the end of the period it was last charged for, so running more or
   * less often than planned changes *when* a charge is computed, never how much it is.
   */
  FEE_ACCRUAL_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  /** Set to '1' to keep scheduled accrual from starting (tests drive it manually). */
  FEE_ACCRUAL_DISABLED: z.string().optional(),

  // ── Manager Trading Terminal (MVP18) ──
  /** How often PENDING LIMIT/STOP strategy orders are checked against current marks. */
  ORDER_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  /** Set to '1' to keep the scheduled sweep from starting (tests drive it manually). */
  ORDER_SWEEP_DISABLED: z.string().optional(),

  // ── Risk Engine (MVP19) ──
  /** How often every live strategy is re-checked for a drawdown breach, independent of trading. */
  RISK_DRAWDOWN_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  /** Set to '1' to keep the scheduled drawdown sweep from starting (tests drive it manually). */
  RISK_DRAWDOWN_SWEEP_DISABLED: z.string().optional(),

  // ── AI data platform (MVP32) — docs/17 ──
  /**
   * Pairs the ingestion loop pulls. Deliberately config, not a hardcoded list: the scanned
   * universe is meant to be driven by the Top Markets job, and a constant in code would be a
   * second, contradictory source of truth for what the platform watches.
   */
  MARKET_DATA_SYMBOLS: z.string().default('BTC/USDT,ETH/USDT,SOL/USDT'),
  MARKET_DATA_TIMEFRAMES: z.string().default('1m,5m,15m,1h,4h,1d'),
  MARKET_DATA_INGESTION_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  /** Set to '1' to keep scheduled ingestion from starting (tests drive it manually). */
  MARKET_DATA_INGESTION_DISABLED: z.string().optional(),
  /** Override for the OKX endpoint — used by tests that need a controlled failure. */
  OKX_BASE_URL: z.string().default('https://www.okx.com'),
  COINBASE_BASE_URL: z.string().default('https://api.exchange.coinbase.com'),

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
