import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authenticator } from 'otplib';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Exercises the full MVP1 auth flow through the real HTTP pipeline (guards, pipes, filters,
 * interceptors — everything configure-app.ts wires up) against a live PostgreSQL and Redis,
 * not mocks. See docs/09-roadmap.md's testing note and CHANGELOG.md for how this complements
 * the unit suite: unit tests prove each piece's logic in isolation; this proves the pieces are
 * wired together correctly end to end.
 *
 * Prerequisites: DATABASE_URL/REDIS_URL reachable (see test/setup-env.ts for defaults) and the
 * schema migrated: `npm run prisma:deploy -w apps/api` against the test database.
 */
describe('Auth + Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);

    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // A few auth routes carry a strict, static per-route rate limit (auth.controller.ts) —
    // flushing between tests means one test's calls never spuriously rate-limit the next.
    await redis.flushdb();
  });

  const server = () => app.getHttpServer();
  const uniqueEmail = () => `e2e-${randomUUID()}@example.com`;
  const STRONG_PASSWORD = 'Str0ng!Passw0rd#2026';

  describe('registration & profile', () => {
    it('registers a new user, returns a usable session, and never leaks secret fields', async () => {
      const email = uniqueEmail();
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: STRONG_PASSWORD, firstName: 'E2E', lastName: 'Test' })
        .expect(201);

      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.totpSecretEnc).toBeUndefined();

      const me = await request(server())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      expect(me.body.email).toBe(email);
      expect(me.body.profile.firstName).toBe('E2E');
      expect(me.body.passwordHash).toBeUndefined();
    });

    it('rejects a duplicate email with a 409 Conflict', async () => {
      const email = uniqueEmail();
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);

      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.requestId).toBeTruthy();
    });

    it('rejects a weak password with a field-level validation error', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail(), password: 'short' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
    });

    it('rejects an unauthenticated request to a protected route', async () => {
      await request(server()).get('/api/v1/users/me').expect(401);
    });
  });

  describe('login, refresh rotation, and replay detection', () => {
    it('logs in, rotates the refresh token, and rejects replay of the old one', async () => {
      const email = uniqueEmail();
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);

      const login = await request(server())
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);
      const firstRefreshToken = login.body.refreshToken;

      const refreshed = await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(201);
      expect(refreshed.body.refreshToken).not.toBe(firstRefreshToken);

      // Replaying the now-rotated token is rejected...
      const replay = await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(401);
      expect(replay.body.error.code).toBe('UNAUTHORIZED');

      // ...and the replay correctly revoked the *new* session too (blast-radius containment,
      // not just rejection of the specific reused token).
      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshed.body.refreshToken })
        .expect(401);
    });

    it('rejects the wrong password without revealing whether the email exists', async () => {
      const email = uniqueEmail();
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);

      const wrongPassword = await request(server())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword1' })
        .expect(401);
      const unknownEmail = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail(), password: 'WrongPassword1' })
        .expect(401);

      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    });
  });

  describe('2FA enrollment and gated login', () => {
    it('enrolls 2FA, then requires it on the next login', async () => {
      const email = uniqueEmail();
      const reg = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);
      const accessToken = reg.body.accessToken;

      const enroll = await request(server())
        .post('/api/v1/auth/2fa/enroll')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
      const secret = enroll.body.secret;
      expect(enroll.body.otpauthUrl).toContain('otpauth://totp/');

      const confirm = await request(server())
        .post('/api/v1/auth/2fa/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: authenticator.generate(secret) })
        .expect(201);
      expect(confirm.body.backupCodes).toHaveLength(10);

      const login = await request(server())
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(201);
      expect(login.body.twoFactorRequired).toBe(true);
      expect(login.body.accessToken).toBeUndefined();

      await request(server())
        .post('/api/v1/auth/login/2fa')
        .send({ loginTicket: login.body.loginTicket, code: '000000' })
        .expect(401);

      const verified = await request(server())
        .post('/api/v1/auth/login/2fa')
        .send({ loginTicket: login.body.loginTicket, code: authenticator.generate(secret) })
        .expect(201);
      expect(verified.body.accessToken).toBeTruthy();
    });
  });

  describe('rate limiting', () => {
    it('blocks further login attempts once the per-route limit is exceeded', async () => {
      const email = uniqueEmail();
      for (let i = 0; i < 10; i++) {
        await request(server()).post('/api/v1/auth/login').send({ email, password: 'WrongPassword1' });
      }
      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword1' })
        .expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('health', () => {
    it('reports database and Redis as reachable', async () => {
      const res = await request(server()).get('/api/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.dependencies.database.ok).toBe(true);
      expect(res.body.dependencies.redis.ok).toBe(true);
    });
  });
});

async function resetDatabase(prisma: PrismaService) {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.backupCode.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.device.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.referral.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.profile.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
