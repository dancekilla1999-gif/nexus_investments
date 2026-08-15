import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.validation';

/**
 * Typed facade over @nestjs/config's ConfigService so the rest of the app never touches raw
 * process.env or string keys directly.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv() {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get platformMode() {
    return this.config.get('PLATFORM_MODE', { infer: true });
  }

  get isLive() {
    return this.platformMode === 'live';
  }

  get port() {
    return this.config.get('API_PORT', { infer: true });
  }

  get corsAllowedOrigins() {
    return this.config
      .get('CORS_ALLOWED_ORIGINS', { infer: true })
      .split(',')
      .map((o) => o.trim());
  }

  get databaseUrl() {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl() {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get jwtAccessSecret() {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtAccessTtl() {
    return this.config.get('JWT_ACCESS_TTL', { infer: true });
  }

  get jwtRefreshTtl() {
    return this.config.get('JWT_REFRESH_TTL', { infer: true });
  }

  get totpIssuer() {
    return this.config.get('TOTP_ISSUER', { infer: true });
  }

  get appEncryptionKey() {
    return this.config.get('APP_ENCRYPTION_KEY', { infer: true });
  }

  get throttle() {
    return {
      ttlSeconds: this.config.get('THROTTLE_TTL_SECONDS', { infer: true }),
      limitDefault: this.config.get('THROTTLE_LIMIT_DEFAULT', { infer: true }),
    };
  }

  get notificationsEmailProvider() {
    return this.config.get('NOTIFICATIONS_EMAIL_PROVIDER', { infer: true });
  }

  get logLevel() {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  // ── Blockchain ──────────────────────────────────────────────────────────

  /**
   * Chain-key-indexed lookup so adding a chain is a config + seed change, not a code change
   * (docs/06-blockchain-architecture.md §1). Sepolia is the Ethereum testnet this deployment
   * points at while PLATFORM_MODE=sandbox.
   */
  chainRpcUrl(chainKey: string): string | undefined {
    const byChain: Record<string, string | undefined> = {
      ethereum: this.config.get('EVM_RPC_URL_SEPOLIA', { infer: true }),
    };
    return byChain[chainKey];
  }

  chainAccountXpub(chainKey: string): string | undefined {
    const byChain: Record<string, string | undefined> = {
      ethereum: this.config.get('EVM_ACCOUNT_XPUB_SEPOLIA', { infer: true }),
    };
    return byChain[chainKey];
  }

  get depositScanBatchBlocks() {
    return this.config.get('DEPOSIT_SCAN_BATCH_BLOCKS', { infer: true });
  }

  get depositScanIntervalMs() {
    return this.config.get('DEPOSIT_SCAN_INTERVAL_MS', { infer: true });
  }

  get depositWatcherEnabled() {
    return this.config.get('DEPOSIT_WATCHER_DISABLED', { infer: true }) !== '1';
  }

  get reconciliationIntervalMs() {
    return this.config.get('RECONCILIATION_INTERVAL_MS', { infer: true });
  }

  get reconciliationEnabled() {
    return this.config.get('RECONCILIATION_DISABLED', { infer: true }) !== '1';
  }

  // ── NAV engine ──────────────────────────────────────────────────────────

  get coingeckoBaseUrl() {
    return this.config.get('COINGECKO_BASE_URL', { infer: true });
  }

  get coingeckoApiKey() {
    return this.config.get('COINGECKO_API_KEY', { infer: true });
  }

  get markMaxAgeSeconds() {
    return this.config.get('MARK_MAX_AGE_SECONDS', { infer: true });
  }

  get markCacheTtlSeconds() {
    return this.config.get('MARK_CACHE_TTL_SECONDS', { infer: true });
  }

  get navRevaluationIntervalMs() {
    return this.config.get('NAV_REVALUATION_INTERVAL_MS', { infer: true });
  }

  get navRevaluationEnabled() {
    return this.config.get('NAV_REVALUATION_DISABLED', { infer: true }) !== '1';
  }

  // ── Fee engine ──────────────────────────────────────────────────────────

  get feeAccrualIntervalMs() {
    return this.config.get('FEE_ACCRUAL_INTERVAL_MS', { infer: true });
  }

  get feeAccrualEnabled() {
    return this.config.get('FEE_ACCRUAL_DISABLED', { infer: true }) !== '1';
  }
}
