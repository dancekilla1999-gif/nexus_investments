import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditActorType, NotificationType, User, UserRole, UserStatus } from '@prisma/client';
import * as crypto from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import { EnvelopeEncryptionService } from '../common/crypto/envelope-encryption.service';
import { parseDurationToMs } from '../common/utils/duration.util';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyLoginTwoFactorDto } from './dto/verify-login-2fa.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { hashPassword, verifyPassword } from './password.util';
import {
  generateBackupCodes,
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
} from './totp.util';
import * as argon2 from 'argon2';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}

export interface TokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
}

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  totpEnabled: boolean;
  emailVerified: boolean;
  createdAt: Date;
}

export type LoginResult = { twoFactorRequired: true; loginTicket: string } | (TokensResponse & { user: PublicUser });

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    totpEnabled: user.totpEnabled,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly encryption: EnvelopeEncryptionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Registration ──────────────────────────────────────────────────────

  async register(dto: RegisterDto, meta: RequestMeta): Promise<TokensResponse & { user: PublicUser }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    let referredById: string | undefined;
    if (dto.referralCode) {
      const referrer = await this.prisma.user.findUnique({ where: { referralCode: dto.referralCode } });
      if (!referrer) {
        throw new BadRequestException('Referral code not recognized.');
      }
      referredById = referrer.id;
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        referredById,
        // MVP1 note: status starts PENDING_VERIFICATION and a verification email is "sent"
        // (console adapter — see docs/09-roadmap.md). We do not gate MVP1 functionality on
        // verification yet since there is no real financial action to protect until MVP2+;
        // KYC/withdrawal gating in MVP3 is what actually enforces this status.
        status: UserStatus.PENDING_VERIFICATION,
        profile: {
          create: {
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        },
      },
    });

    if (referredById) {
      await this.prisma.referral.create({
        data: { referrerId: referredById, refereeId: user.id },
      });
    }

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: user.id,
      action: 'auth.register',
      entityType: 'User',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await this.sendEmailVerification(user);

    const tokens = await this.issueSession(user, meta);
    return { ...tokens, user: toPublicUser(user) };
  }

  private async sendEmailVerification(user: User): Promise<void> {
    const token = this.jwt.sign(
      { sub: user.id, purpose: 'email_verify' },
      { expiresIn: '24h' },
    );
    await this.notifications.notify({
      userId: user.id,
      type: NotificationType.SECURITY_ALERT,
      title: 'Verify your email',
      body: `Verification token (dev console adapter — see docs/09-roadmap.md for a real ` +
        `email provider): ${token}`,
    });
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwt.verify(dto.token);
    } catch {
      throw new BadRequestException('Invalid or expired verification token.');
    }
    if (payload.purpose !== 'email_verify') {
      throw new BadRequestException('Invalid token purpose.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new BadRequestException('User not found.');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        status: user.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : user.status,
      },
    });

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: user.id,
      action: 'auth.email_verified',
      entityType: 'User',
      entityId: user.id,
    });
  }

  // ── Login ──────────────────────────────────────────────────────────────

  async login(dto: LoginDto, meta: RequestMeta): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Constant-shaped response whether the email exists or not — do not leak which.
    const passwordOk = user ? await verifyPassword(user.passwordHash, dto.password) : false;
    if (!user || !passwordOk) {
      await this.audit.record({
        actorType: AuditActorType.USER,
        actorId: user?.id,
        action: 'auth.login.failed',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.BANNED) {
      throw new ForbiddenException('This account cannot sign in. Contact support.');
    }

    if (user.totpEnabled) {
      const loginTicket = this.jwt.sign({ sub: user.id, purpose: 'login_2fa' }, { expiresIn: '5m' });
      await this.audit.record({
        actorType: AuditActorType.USER,
        actorId: user.id,
        action: 'auth.login.2fa_required',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { twoFactorRequired: true, loginTicket };
    }

    const tokens = await this.issueSession(user, meta);
    await this.completeLogin(user, meta, 'password');
    return { ...tokens, user: toPublicUser(user) };
  }

  async verifyLoginTwoFactor(dto: VerifyLoginTwoFactorDto, meta: RequestMeta): Promise<TokensResponse & { user: PublicUser }> {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwt.verify(dto.loginTicket);
    } catch {
      throw new UnauthorizedException('Login ticket is invalid or expired — please sign in again.');
    }
    if (payload.purpose !== 'login_2fa') {
      throw new UnauthorizedException('Invalid ticket purpose.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.totpEnabled || !user.totpSecretEnc) {
      throw new UnauthorizedException('Two-factor authentication is not set up for this account.');
    }

    const validCode = verifyTotpCode(this.encryption.decrypt(user.totpSecretEnc), dto.code);
    const validBackup = validCode ? false : await this.consumeBackupCodeIfValid(user.id, dto.code);

    if (!validCode && !validBackup) {
      await this.audit.record({
        actorType: AuditActorType.USER,
        actorId: user.id,
        action: 'auth.login.2fa_failed',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Invalid two-factor code.');
    }

    const tokens = await this.issueSession(user, meta);
    await this.completeLogin(user, meta, validBackup ? '2fa_backup_code' : '2fa_totp');
    return { ...tokens, user: toPublicUser(user) };
  }

  private async completeLogin(user: User, meta: RequestMeta, method: string): Promise<void> {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: user.id,
      action: 'auth.login',
      metadata: { method },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.notifications.notify({
      userId: user.id,
      type: NotificationType.LOGIN,
      title: 'New sign-in to your account',
      body: `A sign-in occurred${meta.ip ? ` from ${meta.ip}` : ''}. If this wasn't you, secure your account immediately.`,
    });
  }

  // ── Sessions (access/refresh tokens) ─────────────────────────────────────

  private async issueSession(user: User, meta: RequestMeta): Promise<TokensResponse> {
    const device = await this.resolveDevice(user.id, meta);

    const refreshTokenPlain = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = hashToken(refreshTokenPlain);
    const refreshTtlMs = parseDurationToMs(this.config.jwtRefreshTtl);

    const session = await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        deviceId: device?.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + refreshTtlMs),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, roles: [user.role], sessionId: session.id },
      { expiresIn: this.config.jwtAccessTtl },
    );

    return {
      accessToken,
      refreshToken: refreshTokenPlain,
      tokenType: 'Bearer',
      expiresInSeconds: Math.floor(parseDurationToMs(this.config.jwtAccessTtl) / 1000),
    };
  }

  async refresh(refreshTokenPlain: string, meta: RequestMeta): Promise<TokensResponse> {
    const tokenHash = hashToken(refreshTokenPlain);
    const session = await this.prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!session) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (session.revokedAt) {
      // A previously-rotated (or logged-out) refresh token was reused — treat as a possible
      // theft and revoke every session for this user (docs/05-security-architecture.md §1).
      await this.prisma.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        actorType: AuditActorType.SYSTEM,
        actorId: session.userId,
        action: 'auth.session.replay_detected',
        entityType: 'RefreshSession',
        entityId: session.id,
      });
      throw new UnauthorizedException('This session has been revoked. Please sign in again.');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired. Please sign in again.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

    const refreshTokenNew = crypto.randomBytes(48).toString('hex');
    const refreshTtlMs = parseDurationToMs(this.config.jwtRefreshTtl);

    const [newSession] = await this.prisma.$transaction([
      this.prisma.refreshSession.create({
        data: {
          userId: user.id,
          deviceId: session.deviceId,
          tokenHash: hashToken(refreshTokenNew),
          expiresAt: new Date(Date.now() + refreshTtlMs),
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      }),
      this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { replacedBySessionId: newSession.id },
    });

    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, roles: [user.role], sessionId: newSession.id },
      { expiresIn: this.config.jwtAccessTtl },
    );

    return {
      accessToken,
      refreshToken: refreshTokenNew,
      tokenType: 'Bearer',
      expiresInSeconds: Math.floor(parseDurationToMs(this.config.jwtAccessTtl) / 1000),
    };
  }

  async logout(refreshTokenPlain: string): Promise<void> {
    const tokenHash = hashToken(refreshTokenPlain);
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async resolveDevice(userId: string, meta: RequestMeta) {
    // Prefers a client-generated device ID; falls back to a coarse UA+IP fingerprint when the
    // client doesn't supply one (acceptable for MVP1 — device management hardens in MVP3).
    const fingerprint = meta.deviceId ?? hashToken(`${meta.userAgent ?? ''}:${meta.ip ?? ''}`);

    const existing = await this.prisma.device.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
    });

    if (existing) {
      return this.prisma.device.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
    }

    const created = await this.prisma.device.create({
      data: { userId, fingerprint, userAgent: meta.userAgent, ip: meta.ip },
    });

    await this.audit.record({
      actorType: AuditActorType.SYSTEM,
      actorId: userId,
      action: 'security.new_device',
      entityType: 'Device',
      entityId: created.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.notifications.notify({
      userId,
      type: NotificationType.SECURITY_ALERT,
      title: 'New device signed in',
      body: 'A new device was used to access your account. Review it in Security Center if this was not you.',
    });

    return created;
  }

  // ── 2FA (TOTP) ─────────────────────────────────────────────────────────

  async enrollTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled.');
    }

    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: this.encryption.encrypt(secret) },
    });

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'auth.2fa.enroll_started',
    });

    return { secret, otpauthUrl: totpKeyUri(user.email, this.config.totpIssuer, secret) };
  }

  async confirmTwoFactorEnrollment(userId: string, dto: Verify2faDto): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecretEnc) {
      throw new BadRequestException('No pending two-factor enrollment. Call /auth/2fa/enroll first.');
    }
    const secret = this.encryption.decrypt(user.totpSecretEnc);
    if (!verifyTotpCode(secret, dto.code)) {
      throw new UnauthorizedException('Invalid code.');
    }

    const plaintextCodes = generateBackupCodes();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } }),
      this.prisma.backupCode.deleteMany({ where: { userId } }),
      this.prisma.backupCode.createMany({
        data: await Promise.all(
          plaintextCodes.map(async (code) => ({ userId, codeHash: await argon2.hash(code) })),
        ),
      }),
    ]);

    await this.audit.record({ actorType: AuditActorType.USER, actorId: userId, action: 'auth.2fa.enabled' });
    await this.notifications.notify({
      userId,
      type: NotificationType.SECURITY_ALERT,
      title: 'Two-factor authentication enabled',
      body: 'Two-factor authentication was just enabled on your account.',
    });

    return { backupCodes: plaintextCodes };
  }

  async disableTwoFactor(userId: string, dto: Verify2faDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabled || !user.totpSecretEnc) {
      throw new BadRequestException('Two-factor authentication is not enabled.');
    }
    if (!verifyTotpCode(this.encryption.decrypt(user.totpSecretEnc), dto.code)) {
      throw new UnauthorizedException('Invalid code.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { totpEnabled: false, totpSecretEnc: null },
      }),
      this.prisma.backupCode.deleteMany({ where: { userId } }),
    ]);

    await this.audit.record({ actorType: AuditActorType.USER, actorId: userId, action: 'auth.2fa.disabled' });
    await this.notifications.notify({
      userId,
      type: NotificationType.SECURITY_ALERT,
      title: 'Two-factor authentication disabled',
      body: 'Two-factor authentication was just disabled on your account. If this was not you, secure your account immediately.',
    });
  }

  private async consumeBackupCodeIfValid(userId: string, code: string): Promise<boolean> {
    const unused = await this.prisma.backupCode.findMany({ where: { userId, usedAt: null } });
    for (const candidate of unused) {
      if (await argon2.verify(candidate.codeHash, code)) {
        await this.prisma.backupCode.update({ where: { id: candidate.id }, data: { usedAt: new Date() } });
        return true;
      }
    }
    return false;
  }
}

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
