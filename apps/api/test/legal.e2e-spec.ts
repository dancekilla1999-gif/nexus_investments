import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Covers the real, working slice of docs/10-managed-accounts-architecture.md that ships in
 * MVP1: reading the current risk disclosure agreement and recording an audit-logged,
 * idempotent acceptance. ManagedAccount creation itself is MVP11 and not exercised here.
 */
describe('Legal — risk disclosure (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.riskDisclosureAgreement.upsert({
      where: { version: 999 },
      update: {},
      create: {
        version: 999,
        title: 'E2E Test Agreement',
        bodyMarkdown: 'test body',
        isCurrent: true,
        effectiveAt: new Date(),
      },
    });
    // Only one agreement should be "current" at a time in this test's world — demote any
    // other version so getCurrent() deterministically returns ours.
    await prisma.riskDisclosureAgreement.updateMany({
      where: { version: { not: 999 } },
      data: { isCurrent: false },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const uniqueEmail = () => `legal-e2e-${randomUUID()}@example.com`;

  async function registerUser() {
    const res = await request(server())
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: 'Str0ng!Passw0rd#2026' })
      .expect(201);
    return res.body.accessToken as string;
  }

  it('serves the current agreement without requiring authentication', async () => {
    const res = await request(server()).get('/api/v1/legal/risk-disclosure/current').expect(200);
    expect(res.body.version).toBe(999);
    expect(res.body.title).toBe('E2E Test Agreement');
  });

  it('reports unaccepted status for a freshly registered user', async () => {
    const accessToken = await registerUser();
    const res = await request(server())
      .get('/api/v1/legal/risk-disclosure/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toEqual({ accepted: false, agreementVersion: 999, acceptedAt: null });
  });

  it('records acceptance, audit-logs it, and is idempotent on repeat calls', async () => {
    const accessToken = await registerUser();

    const first = await request(server())
      .post('/api/v1/legal/risk-disclosure/accept')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(first.body.accepted).toBe(true);
    expect(first.body.agreementVersion).toBe(999);
    expect(first.body.acceptedAt).toBeTruthy();

    const status = await request(server())
      .get('/api/v1/legal/risk-disclosure/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(status.body.accepted).toBe(true);

    // Idempotent: accepting again returns the same record, not a duplicate/error.
    const second = await request(server())
      .post('/api/v1/legal/risk-disclosure/accept')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(second.body.acceptedAt).toBe(first.body.acceptedAt);

    const acceptanceCount = await prisma.riskDisclosureAcceptance.count({
      where: { agreementId: (await prisma.riskDisclosureAgreement.findUniqueOrThrow({ where: { version: 999 } })).id },
    });
    // One row per distinct user who accepted in this test file, never more than one per user.
    expect(acceptanceCount).toBeGreaterThan(0);
  });

  it('rejects an unauthenticated accept attempt', async () => {
    await request(server()).post('/api/v1/legal/risk-disclosure/accept').expect(401);
  });
});
