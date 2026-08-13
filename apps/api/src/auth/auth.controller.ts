import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { AuthService, RequestMeta } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyLoginTwoFactorDto } from './dto/verify-login-2fa.dto';

function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    deviceId: req.headers['x-device-id'] as string | undefined,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // register/login/2fa-verify get a stricter per-route override of the 'default' throttler
  // bucket (10 req/min vs. the app-wide THROTTLE_LIMIT_DEFAULT) — these are credential-guessing
  // surfaces, so they stay static and reviewed-in-code rather than env-configurable, unlike
  // the app-wide default (docs/05-security-architecture.md §1, §5).
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, requestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, requestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login/2fa')
  verifyLoginTwoFactor(@Body() dto: VerifyLoginTwoFactorDto, @Req() req: Request) {
    return this.authService.verifyLoginTwoFactor(dto, requestMeta(req));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, requestMeta(req));
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
  }

  @Post('2fa/enroll')
  enrollTwoFactor(@CurrentUser() user: JwtPayload) {
    return this.authService.enrollTwoFactor(user.sub);
  }

  @Post('2fa/confirm')
  confirmTwoFactor(@CurrentUser() user: JwtPayload, @Body() dto: Verify2faDto) {
    return this.authService.confirmTwoFactorEnrollment(user.sub, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('2fa/disable')
  async disableTwoFactor(@CurrentUser() user: JwtPayload, @Body() dto: Verify2faDto) {
    await this.authService.disableTwoFactor(user.sub, dto);
  }
}
