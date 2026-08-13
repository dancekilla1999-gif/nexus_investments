import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { REDIS_CLIENT } from './redis.constants';
import { RedisThrottlerStorage } from './redis-throttler.storage';

export { REDIS_CLIENT };

/**
 * A single shared ioredis connection for the whole process — rate limiting today
 * (see redis-throttler.storage.ts), session/cache use as those land in later milestones.
 * Failing to reach Redis fails loudly (connection errors are logged, commands reject) rather
 * than silently degrading rate limiting to a per-instance fallback that would quietly break
 * the cross-instance guarantee docs/05-security-architecture.md §5 describes.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const logger = new Logger('Redis');
        const client = new Redis(config.redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
        });
        client.on('connect', () => logger.log(`Connected to Redis at ${config.redisUrl}`));
        client.on('error', (err) => logger.error(`Redis connection error: ${err.message}`));
        return client;
      },
    },
    RedisThrottlerStorage,
  ],
  exports: [REDIS_CLIENT, RedisThrottlerStorage],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown() {
    await this.client.quit().catch(() => undefined);
  }
}
