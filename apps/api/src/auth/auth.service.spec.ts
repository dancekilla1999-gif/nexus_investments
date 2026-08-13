import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { EnvelopeEncryptionService } from '../common/crypto/envelope-encryption.service';
import { AppConfigService } from '../config/app-config.service';
import { hashPassword } from './password.util';
import { generateTotpSecret } from './totp.util';
import { authenticator } from 'otplib';

function buildPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    referral: { create: jest.fn() },
    device: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'device_1' }),
      update: jest.fn(),
    },
    refreshSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    backupCode: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function buildAuthService(prisma: ReturnType<typeof buildPrismaMock>) {
  const jwt = new JwtService({ secret: 'test-secret-for-unit-tests' });
  const config = {
    jwtAccessTtl: '15m',
    jwtRefreshTtl: '30d',
    totpIssuer: 'Nexus Investments',
    appEncryptionKey: 'unit-test-encryption-key',
  } as unknown as AppConfigService;
  const encryption = new EnvelopeEncryptionService(config);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };

  const service = new AuthService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    jwt,
    config,
    encryption,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audit as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notifications as any,
  );

  return { service, jwt, encryption, audit, notifications };
}

const baseUser = {
  id: 'user_1',
  email: 'trader@example.com',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  totpEnabled: false,
  totpSecretEnc: null,
  emailVerifiedAt: null,
  createdAt: new Date(),
  referralCode: 'ref_1',
};

describe('AuthService', () => {
  describe('register', () => {
    it('rejects registration with an email already in use', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const { service } = buildAuthService(prisma);

      await expect(
        service.register(
          { email: 'trader@example.com', password: 'Str0ng!Passw0rd#2026' },
          {},
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a new user and returns an issued session on success', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      const passwordHash = await hashPassword('Str0ng!Passw0rd#2026');
      prisma.user.create.mockResolvedValue({ ...baseUser, passwordHash });
      prisma.refreshSession.create.mockResolvedValue({ id: 'session_1' });

      const { service } = buildAuthService(prisma);
      const result = await service.register(
        { email: 'trader@example.com', password: 'Str0ng!Passw0rd#2026' },
        { ip: '127.0.0.1', userAgent: 'jest' },
      );

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('trader@example.com');
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('rejects an unknown email with a generic error (no user enumeration)', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      const { service } = buildAuthService(prisma);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever12' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a valid email with the wrong password', async () => {
      const prisma = buildPrismaMock();
      const passwordHash = await hashPassword('CorrectHorseBattery1');
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      const { service } = buildAuthService(prisma);

      await expect(
        service.login({ email: baseUser.email, password: 'WrongPassword1' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues tokens directly when 2FA is not enabled', async () => {
      const prisma = buildPrismaMock();
      const passwordHash = await hashPassword('CorrectHorseBattery1');
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      prisma.user.update.mockResolvedValue(undefined);
      prisma.refreshSession.create.mockResolvedValue({ id: 'session_1' });

      const { service } = buildAuthService(prisma);
      const result = await service.login({ email: baseUser.email, password: 'CorrectHorseBattery1' }, {});

      expect('accessToken' in result).toBe(true);
      if ('accessToken' in result) {
        expect(result.accessToken).toBeTruthy();
      }
    });

    it('returns a login ticket instead of tokens when 2FA is enabled', async () => {
      const prisma = buildPrismaMock();
      const passwordHash = await hashPassword('CorrectHorseBattery1');
      const secret = generateTotpSecret();
      const { encryption } = buildAuthService(prisma); // reuse a throwaway instance for encrypt
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash,
        totpEnabled: true,
        totpSecretEnc: encryption.encrypt(secret),
      });

      const { service } = buildAuthService(prisma);
      const result = await service.login({ email: baseUser.email, password: 'CorrectHorseBattery1' }, {});

      expect(result).toHaveProperty('twoFactorRequired', true);
      expect(prisma.refreshSession.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyLoginTwoFactor', () => {
    it('accepts a valid TOTP code and issues a session', async () => {
      const prisma = buildPrismaMock();
      const { service, jwt, encryption } = buildAuthService(prisma);
      const secret = generateTotpSecret();

      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        totpEnabled: true,
        totpSecretEnc: encryption.encrypt(secret),
      });
      prisma.refreshSession.create.mockResolvedValue({ id: 'session_2' });

      const loginTicket = jwt.sign({ sub: baseUser.id, purpose: 'login_2fa' }, { expiresIn: '5m' });
      const code = authenticator.generate(secret);

      const result = await service.verifyLoginTwoFactor({ loginTicket, code }, {});
      expect(result.accessToken).toBeTruthy();
    });

    it('rejects an invalid TOTP code', async () => {
      const prisma = buildPrismaMock();
      const { service, jwt, encryption } = buildAuthService(prisma);
      const secret = generateTotpSecret();

      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        totpEnabled: true,
        totpSecretEnc: encryption.encrypt(secret),
      });

      const loginTicket = jwt.sign({ sub: baseUser.id, purpose: 'login_2fa' }, { expiresIn: '5m' });

      await expect(service.verifyLoginTwoFactor({ loginTicket, code: '000000' }, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('detects replay of an already-revoked refresh token and revokes all sessions', async () => {
      const prisma = buildPrismaMock();
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 'session_old',
        userId: baseUser.id,
        revokedAt: new Date(), // already revoked → this presentation is a replay
        expiresAt: new Date(Date.now() + 1000 * 1000),
        deviceId: 'device_1',
      });

      const { service } = buildAuthService(prisma);

      await expect(service.refresh('some-refresh-token', {})).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects an expired refresh token', async () => {
      const prisma = buildPrismaMock();
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 'session_old',
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        deviceId: 'device_1',
      });

      const { service } = buildAuthService(prisma);
      await expect(service.refresh('expired-token', {})).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates a valid refresh token into a new session and revokes the old one', async () => {
      const prisma = buildPrismaMock();
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 'session_old',
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 1000),
        deviceId: 'device_1',
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);
      prisma.refreshSession.create.mockResolvedValue({ id: 'session_new' });

      const { service } = buildAuthService(prisma);
      const result = await service.refresh('valid-refresh-token', {});

      expect(result.accessToken).toBeTruthy();
      expect(prisma.refreshSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session_old' } }),
      );
    });
  });
});
