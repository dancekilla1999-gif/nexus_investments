import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LedgerAccountType, UserStatus } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * The wallet through its real HTTP surface — guards, validation pipe, error filter and all.
 * Complements ledger.e2e-spec.ts: that proves the accounting is correct, this proves the API
 * on top of it exposes exactly that correctness and nothing more.
 */
describe('Wallet (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let redis: Redis;
  let assetId: string;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);
    redis = app.get(REDIS_CLIENT);

    const chain = await prisma.chain.upsert({
      where: { key: 'wallet-test-chain' },
      update: {},
      create: {
        key: 'wallet-test-chain',
        name: 'Wallet Test Chain',
        type: 'EVM',
        nativeAssetSymbol: 'WTT',
        isTestnet: true,
      },
    });
    assetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'WTT' } },
        update: {},
        create: { symbol: 'WTT', name: 'Wallet Test Token', chainId: chain.id, decimals: 18, kind: 'NATIVE' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    // Each test registers a fresh user, and /auth/register carries a strict static rate limit.
    // Clearing the limiter's Redis state keeps one test's registrations from throttling the next.
    await redis.flushdb();
    await prisma.user.upsert({
      where: { id: PLATFORM_SYSTEM_USER_ID },
      update: {},
      create: {
        id: PLATFORM_SYSTEM_USER_ID,
        email: PLATFORM_SYSTEM_USER_EMAIL,
        passwordHash: 'NOT_A_VALID_HASH__SYSTEM_ACCOUNT_CANNOT_LOG_IN',
        status: UserStatus.CLOSED,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `wallet-${randomUUID()}@example.com`, password: 'Str0ng!Passw0rd#2026' })
      .expect(201);
    accessToken = res.body.accessToken;
    userId = res.body.user.id;
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const server = () => app.getHttpServer();

  async function fund(amount: string) {
    await request(server()).post('/api/v1/wallet/sandbox/faucet').set(auth()).send({ assetId, amount }).expect(201);
  }

  function bucket(body: Array<{ assetId: string; type: string; amount: string }>, type: LedgerAccountType) {
    return body.find((b) => b.assetId === assetId && b.type === type)?.amount ?? '0';
  }

  it('requires authentication for every wallet route', async () => {
    await request(server()).get('/api/v1/wallet/balances').expect(401);
    await request(server()).post('/api/v1/wallet/transfers').send({}).expect(401);
    await request(server()).post('/api/v1/wallet/sandbox/faucet').send({}).expect(401);
  });

  it('starts a new account with no balances at all', async () => {
    const res = await request(server()).get('/api/v1/wallet/balances').set(auth()).expect(200);
    expect(res.body).toEqual([]);
  });

  it('credits the sandbox faucet through the real deposit accounting path', async () => {
    await fund('250');

    const res = await request(server()).get('/api/v1/wallet/balances').set(auth()).expect(200);
    expect(bucket(res.body, LedgerAccountType.AVAILABLE)).toBe('250');

    // The credit came from the platform boundary, not from nowhere.
    const external = await prisma.balance.findFirstOrThrow({
      where: { userId: PLATFORM_SYSTEM_USER_ID, type: LedgerAccountType.EXTERNAL, assetId },
    });
    expect(external.amount.toString()).toBe('-250');
    expect(await ledger.verifyReconciliation()).toEqual([]);
  });

  it('moves funds between the user\'s own buckets', async () => {
    await fund('100');

    const res = await request(server())
      .post('/api/v1/wallet/transfers')
      .set(auth())
      .send({ from: 'AVAILABLE', to: 'TRADING', assetId, amount: '40' })
      .expect(201);

    expect(bucket(res.body.balances, LedgerAccountType.AVAILABLE)).toBe('60');
    expect(bucket(res.body.balances, LedgerAccountType.TRADING)).toBe('40');
    expect(await ledger.verifyReconciliation()).toEqual([]);
  });

  it('refuses a transfer larger than the source bucket holds', async () => {
    await fund('10');

    const res = await request(server())
      .post('/api/v1/wallet/transfers')
      .set(auth())
      .send({ from: 'AVAILABLE', to: 'TRADING', assetId, amount: '10.000000000000000001' })
      .expect(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');

    const after = await request(server()).get('/api/v1/wallet/balances').set(auth()).expect(200);
    expect(bucket(after.body, LedgerAccountType.AVAILABLE)).toBe('10');
  });

  it('refuses to move funds out of platform-managed buckets', async () => {
    await fund('100');
    // LOCKED holds funds reserved against an open order or withdrawal. If a user could move
    // them back to AVAILABLE at will, locking would be decorative.
    const res = await request(server())
      .post('/api/v1/wallet/transfers')
      .set(auth())
      .send({ from: 'LOCKED', to: 'AVAILABLE', assetId, amount: '1' })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_TRANSFER');
  });

  it('rejects same-bucket, non-positive, and malformed amounts', async () => {
    await fund('100');

    const same = await request(server())
      .post('/api/v1/wallet/transfers')
      .set(auth())
      .send({ from: 'AVAILABLE', to: 'AVAILABLE', assetId, amount: '1' })
      .expect(400);
    expect(same.body.error.code).toBe('INVALID_TRANSFER');

    for (const amount of ['0', '-5', 'abc', '1.0000000000000000001', '']) {
      await request(server())
        .post('/api/v1/wallet/transfers')
        .set(auth())
        .send({ from: 'AVAILABLE', to: 'TRADING', assetId, amount })
        .expect(400);
    }

    const after = await request(server()).get('/api/v1/wallet/balances').set(auth()).expect(200);
    expect(bucket(after.body, LedgerAccountType.AVAILABLE)).toBe('100');
  });

  it('rejects an unknown asset', async () => {
    const res = await request(server())
      .post('/api/v1/wallet/transfers')
      .set(auth())
      .send({ from: 'AVAILABLE', to: 'TRADING', assetId: 'no-such-asset', amount: '1' })
      .expect(404);
    expect(res.body.error.code).toBe('ASSET_NOT_FOUND');
  });

  it('never lets one user see or spend another user\'s balance', async () => {
    await fund('100');

    const other = await request(server())
      .post('/api/v1/auth/register')
      .send({ email: `other-${randomUUID()}@example.com`, password: 'Str0ng!Passw0rd#2026' })
      .expect(201);

    const otherBalances = await request(server())
      .get('/api/v1/wallet/balances')
      .set({ Authorization: `Bearer ${other.body.accessToken}` })
      .expect(200);
    expect(otherBalances.body).toEqual([]);

    // The second user cannot spend the first user's funds: the transfer is scoped to the
    // authenticated identity, so this debits an empty account rather than someone else's.
    const res = await request(server())
      .post('/api/v1/wallet/transfers')
      .set({ Authorization: `Bearer ${other.body.accessToken}` })
      .send({ from: 'AVAILABLE', to: 'TRADING', assetId, amount: '50' })
      .expect(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');

    const mine = await request(server()).get('/api/v1/wallet/balances').set(auth()).expect(200);
    expect(bucket(mine.body, LedgerAccountType.AVAILABLE)).toBe('100');
  });

  it('stays consistent under concurrent transfers of the same funds', async () => {
    await fund('100');

    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(server())
          .post('/api/v1/wallet/transfers')
          .set(auth())
          .send({ from: 'AVAILABLE', to: 'TRADING', assetId, amount: '100' }),
      ),
    );

    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    const after = await request(server()).get('/api/v1/wallet/balances').set(auth()).expect(200);
    expect(bucket(after.body, LedgerAccountType.AVAILABLE)).toBe('0');
    expect(bucket(after.body, LedgerAccountType.TRADING)).toBe('100');
    expect(await ledger.verifyReconciliation()).toEqual([]);
  });

  it('caps the sandbox faucet and rejects nonsense amounts', async () => {
    const tooBig = await request(server())
      .post('/api/v1/wallet/sandbox/faucet')
      .set(auth())
      .send({ assetId, amount: '100001' })
      .expect(400);
    expect(tooBig.body.error.code).toBe('INVALID_AMOUNT');

    await request(server())
      .post('/api/v1/wallet/sandbox/faucet')
      .set(auth())
      .send({ assetId, amount: '-1' })
      .expect(400);
  });

  it('audit-logs every balance-affecting action', async () => {
    await fund('10');
    await request(server())
      .post('/api/v1/wallet/transfers')
      .set(auth())
      .send({ from: 'AVAILABLE', to: 'TRADING', assetId, amount: '5' })
      .expect(201);

    const actions = (
      await prisma.auditLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: 'asc' } })
    ).map((a) => a.action);

    expect(actions).toEqual(expect.arrayContaining(['wallet.sandbox_faucet', 'wallet.transfer_internal']));
  });
});
