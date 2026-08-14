import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { PlatformModeGuard } from './config/platform-mode.guard';
import { LoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage';
import { AuditModule } from './audit/audit.module';
import { LedgerModule } from './ledger/ledger.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LegalModule } from './legal/legal.module';
import { WalletModule } from './wallet/wallet.module';
import { DepositsModule } from './deposits/deposits.module';
import { InvestmentsModule } from './investments/investments.module';
import { NavModule } from './nav/nav.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [AppConfigService, RedisThrottlerStorage],
      useFactory: (config: AppConfigService, storage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            ttl: config.throttle.ttlSeconds * 1000,
            limit: config.throttle.limitDefault,
          },
        ],
        storage,
      }),
    }),
    PrismaModule,
    AuditModule,
    LedgerModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    LegalModule,
    WalletModule,
    DepositsModule,
    NavModule,
    InvestmentsModule,
    HealthModule,
  ],
  providers: [
    PlatformModeGuard,
    // Order matters: rate limiting first, then authentication, then role authorization.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
