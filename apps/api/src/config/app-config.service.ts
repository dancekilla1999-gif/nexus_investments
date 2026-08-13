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
}
