import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from '../config/app-config.service';
import { AppConfigModule } from '../config/app-config.module';
import { EnvelopeEncryptionService } from '../common/crypto/envelope-encryption.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    ConfigModule,
    AppConfigModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtAccessSecret,
        // Per-call expiresIn is set explicitly at every sign() call site (access tokens,
        // email-verify tokens, login-2fa tickets each have their own TTL) — no global default.
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EnvelopeEncryptionService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
