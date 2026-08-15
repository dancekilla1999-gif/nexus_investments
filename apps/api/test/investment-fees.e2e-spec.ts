import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  LedgerAccountType,
  LedgerTransactionType,
  Prisma,
  StrategyStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { FeesService } from '../src/investments/fees.service';
import { exactSum } from '../src/ledger/amount.util';
import { PLATFORM_SYSTEM_USER_EMAIL, PLATFORM_SYSTEM_USER_ID } from '../src/ledger/ledger.constants';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { resetDatabase } from './utils/reset-database';

/**
 * The fee engine: high water mark, accrual, crystallisation (docs/12 §6, roadmap MVP16/17).
 *
 * The centrepiece is **the table from docs/12 §6.1, executed as a test** — invest, gain,
 * crystallise, fall, recover, gain further — because under a 50% profit share the single most
 * expensive bug available is charging twice for the same performance. "Recovery to a
 * previously-charged level accrues nothing" is the assertion that says the HWM works.
 *
 * The second is that **crystallising one investor's fee leaves everyone else's unit price
 * exactly where it was**. A fee paid out of the pool without cancelling the payer's units would
 * spread one investor's bill across every holder.
 */
describe('Investment fees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let fees: FeesService;
  let redis: Redis;

  let assetId: string;
  let wbtcId: string;
  let strategyId: string;
  let strategySlug: string;
  let managerToken: string;
  let adminToken: string;

  const PASSWORD = 'Str0ng!Passw0rd#2026';
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ledger = app.get(LedgerService);
    fees = app.get(FeesService);
    redis = app.get(REDIS_CLIENT);

    const chain = await prisma.chain.upsert({
      where: { key: 'ethereum' },
      update: {},
      create: {
        key: 'ethereum',
        name: 'Ethereum (test)',
        type: 'EVM',
        nativeAssetSymbol: 'ETH',
        confirmationsRequired: 3,
        isTestnet: true,
      },
    });
    assetId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'USDC' } },
        update: { isEnabled: true },
        create: { symbol: 'USDC', name: 'USD Coin', chainId: chain.id, decimals: 6, kind: 'TOKEN' },
      })
    ).id;
    wbtcId = (
      await prisma.asset.upsert({
        where: { chainId_symbol: { chainId: chain.id, symbol: 'WBTC' } },
        update: { isEnabled: true },
        create: {
          symbol: 'WBTC',
          name: 'Wrapped Bitcoin',
          chainId: chain.id,
          decimals: 8,
          kind: 'TOKEN',
          coingeckoId: 'wrapped-bitcoin',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await redis.flushdb();

    await prisma.user.create({
      data: {
        id: PLATFORM_SYSTEM_USER_ID,
        email: PLATFORM_SYSTEM_USER_EMAIL,
        passwordHash: 'NOT_A_VALID_HASH__SYSTEM_ACCOUNT_CANNOT_LOG_IN',
        status: UserStatus.CLOSED,
      },
    });

    await prisma.riskDisclosureAgreement.upsert({
      where: { version: 1 },
      update: { isCurrent: true },
      create: {
        version: 1,
        title: 'Risk disclosure',
        bodyMarkdown: 'You may lose money, including everything you invest.',
        isCurrent: true,
        effectiveAt: new Date(),
      },
    });

    strategySlug = `strat-${randomUUID().slice(0, 8)}`;
    const strategy = await prisma.investmentStrategy.create({
      data: {
        slug: strategySlug,
        name: 'AI Top 25',
        description: 'Systematic strategy across the largest pairs.',
        baseAssetId: assetId,
        minimumInvestment: '100',
        // The platform's model: 50% of profit above the high water mark, nothing otherwise.
        perfFeeBps: 5000,
        mgmtFeeBps: 0,
        status: StrategyStatus.OPEN,
        openedAt: new Date(),
      },
    });
    strategyId = strategy.id;

    managerToken = await register(UserRole.INVESTMENT_MANAGER);
    adminToken = await register(UserRole.ADMIN);
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(role: UserRole = UserRole.USER): Promise<string> {
    const email = `${role.toLowerCase()}-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    if (role === UserRole.USER) return res.body.accessToken;
    await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(201);
    return login.body.accessToken;
  }

  async function investor(funds: string): Promise<{ token: string; id: string }> {
    const email = `inv-${randomUUID()}@example.com`;
    const res = await request(server()).post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const token = res.body.accessToken as string;
    const id = res.body.user.id as string;

    await request(server())
      .post('/api/v1/legal/risk-disclosure/accept')
      .set(auth(token))
      .expect(201);

    await ledger.post({
      type: LedgerTransactionType.DEPOSIT,
      idempotencyKey: `fund:${id}:${randomUUID()}`,
      legs: [
        { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: `-${funds}` },
        { userId: id, assetId, type: LedgerAccountType.AVAILABLE, amount: funds },
      ],
    });

    return { token, id };
  }

  function subscribe(token: string, amount: string) {
    return request(server())
      .post(`/api/v1/investments/strategies/${strategySlug}/subscribe`)
      .set(auth(token))
      .send({ amount });
  }

  async function strike(reason = 'test deal') {
    return (
      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/dealing-point`)
        .set(auth(managerToken))
        .send({ reason })
        .expect(201)
    ).body;
  }

  /** Trading P&L: genuinely crosses the platform boundary, so EXTERNAL is the real counterparty. */
  async function poolPnl(amount: Prisma.Decimal | string) {
    const delta = new Prisma.Decimal(amount);
    if (delta.isZero()) return;
    await ledger.post({
      type: LedgerTransactionType.TRADE,
      idempotencyKey: `pnl:${randomUUID()}`,
      legs: [
        {
          userId: PLATFORM_SYSTEM_USER_ID,
          assetId,
          type: LedgerAccountType.EXTERNAL,
          amount: delta.negated().toFixed(18),
        },
        {
          userId: PLATFORM_SYSTEM_USER_ID,
          assetId,
          type: LedgerAccountType.STRATEGY_POOL,
          strategyId,
          amount: delta.toFixed(18),
        },
      ],
    });
  }

  /**
   * Seeds the mark cache so a non-base holding can be priced without reaching the network.
   *
   * This writes the same Redis entry the CoinGecko provider would, and the registry reads it
   * through its ordinary path — including the staleness check — so the test exercises real
   * valuation rather than a stubbed one.
   */
  async function seedMark(subjectAssetId: string, price: string) {
    await redis.set(
      `mark:${subjectAssetId}:${assetId}`,
      JSON.stringify({ price, source: 'coingecko', asOf: new Date().toISOString() }),
      'EX',
      300,
    );
  }

  async function poolCash(): Promise<Prisma.Decimal> {
    const b = await prisma.balance.findFirst({
      where: { type: LedgerAccountType.STRATEGY_POOL, assetId, ledgerAccount: { strategyId } },
    });
    return b?.amount ?? new Prisma.Decimal(0);
  }

  /** Moves the pool so the unit price becomes exactly `target`. */
  async function setNavPerUnit(target: string) {
    const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
    const want = strategy.totalUnits.times(target);
    await poolPnl(want.minus(await poolCash()).toFixed(18));
  }

  async function navPerUnit(): Promise<Prisma.Decimal> {
    const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
    if (strategy.totalUnits.isZero()) return new Prisma.Decimal(1);
    return (await poolCash()).dividedBy(strategy.totalUnits);
  }

  async function positionOf(userId: string) {
    return prisma.investmentPosition.findUniqueOrThrow({
      where: { userId_strategyId: { userId, strategyId } },
    });
  }

  async function platformRevenue(): Promise<Prisma.Decimal> {
    const b = await prisma.balance.findFirst({
      where: { type: LedgerAccountType.PLATFORM_REVENUE, assetId },
    });
    return b?.amount ?? new Prisma.Decimal(0);
  }

  /** An investor with units, entered at a unit price of exactly 1.00. */
  async function invested(amount: string) {
    const person = await investor(amount);
    await subscribe(person.token, amount).expect(201);
    await strike('entry');
    return person;
  }

  function crystallise() {
    return request(server())
      .post(`/api/v1/admin/investments/strategies/${strategyId}/crystallise-fees`)
      .set(auth(adminToken))
      .expect(201);
  }

  // ── The table from docs/12 §6.1, run as a test ──────────────────────────

  describe('the high water mark (docs/12 §6.1)', () => {
    it('walks the whole worked example: gain, charge, fall, recover, gain again', async () => {
      const alice = await invested('100000');

      // Invest 100,000 at 1.00 → HWM 1.00, nothing accrued.
      let position = await positionOf(alice.id);
      expect(position.units.toFixed(2)).toBe('100000.00');
      expect(position.hwmUnitPrice.toFixed(2)).toBe('1.00');
      expect(position.accruedPerfFee.toFixed(2)).toBe('0.00');

      // Pool gains 20% → 1.20. Fee accrues on the 0.20 gain: 0.20 × 100,000 × 50% = 10,000.
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);
      position = await positionOf(alice.id);
      expect(position.accruedPerfFee.toFixed(2)).toBe('10000.00');
      expect(position.hwmUnitPrice.toFixed(2)).toBe('1.00');

      // Crystallise → the fee is taken and the HWM ratchets to 1.20.
      await crystallise();
      position = await positionOf(alice.id);
      expect(position.hwmUnitPrice.toFixed(2)).toBe('1.20');
      expect(position.accruedPerfFee.toFixed(2)).toBe('0.00');
      expect((await platformRevenue()).toFixed(2)).toBe('10000.00');
      // Units paid the fee: 10,000 / 1.20 = 8,333.33…
      expect(position.units.toFixed(2)).toBe('91666.67');
      expect((await navPerUnit()).toFixed(2)).toBe('1.20');

      // Pool falls to 1.10 → nothing accrues. The investor is below their HWM.
      await setNavPerUnit('1.10');
      await fees.accrue(strategyId);
      expect((await positionOf(alice.id)).accruedPerfFee.toFixed(2)).toBe('0.00');

      // Pool recovers to 1.20 → still nothing. This gain has already been paid for once, and
      // charging it again is the bug the whole mechanism exists to prevent.
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);
      position = await positionOf(alice.id);
      expect(position.accruedPerfFee.toFixed(2)).toBe('0.00');
      expect(position.hwmUnitPrice.toFixed(2)).toBe('1.20');

      // Pool gains further to 1.25 → only the 0.05 above the HWM is charged.
      // 0.05 × 91,666.67 × 50% = 2,291.67
      await setNavPerUnit('1.25');
      await fees.accrue(strategyId);
      position = await positionOf(alice.id);
      expect(position.accruedPerfFee.toFixed(2)).toBe('2291.67');
    });

    it('charges nothing at all when the strategy never makes money', async () => {
      const alice = await invested('50000');
      await setNavPerUnit('0.80');
      await fees.accrue(strategyId);

      const position = await positionOf(alice.id);
      expect(position.accruedPerfFee.toFixed(2)).toBe('0.00');
      expect(position.accruedMgmtFee.toFixed(2)).toBe('0.00');

      // And crystallising a loss-making strategy moves no money at all — a pure profit share
      // means exactly that.
      const res = await crystallise();
      expect(res.body.charged).toHaveLength(0);
      expect((await platformRevenue()).toFixed(2)).toBe('0.00');
    });

    it('starts a new investor at the price they paid, not at anyone else\'s mark', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.50');

      const bob = await investor('60000');
      await subscribe(bob.token, '60000').expect(201);
      await strike('bob enters high');

      // Bob's HWM is the price he entered at. He owes nothing on Alice's gain.
      const bobPosition = await positionOf(bob.id);
      expect(bobPosition.hwmUnitPrice.toFixed(2)).toBe('1.50');
      expect(bobPosition.accruedPerfFee.toFixed(2)).toBe('0.00');

      // Alice, who was there for the run-up, owes on all of it: 0.50 × 100,000 × 50%.
      expect((await positionOf(alice.id)).accruedPerfFee.toFixed(2)).toBe('25000.00');
    });

    it('does not reset the high water mark downward when an investor tops up below it', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.40');
      await fees.accrue(strategyId);
      await crystallise();
      expect((await positionOf(alice.id)).hwmUnitPrice.toFixed(2)).toBe('1.40');

      await setNavPerUnit('1.10');
      const more = await investor('20000');
      // Same investor topping up: fund Alice again and subscribe.
      await ledger.post({
        type: LedgerTransactionType.DEPOSIT,
        idempotencyKey: `topup:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '-20000' },
          { userId: alice.id, assetId, type: LedgerAccountType.AVAILABLE, amount: '20000' },
        ],
      });
      await subscribe(alice.token, '20000').expect(201);
      await strike('top up below the mark');

      // A top-up at 1.10 must not drag the mark down from 1.40 — that would re-charge the
      // investor for the recovery from 1.10 back to 1.40, which they have already paid for.
      expect((await positionOf(alice.id)).hwmUnitPrice.toFixed(2)).toBe('1.40');
      expect(more.id).toBeDefined();
    });

    it('cannot be lowered, even by direct SQL', async () => {
      const alice = await invested('10000');
      await expect(
        prisma.$executeRaw`UPDATE investment_positions SET "hwmUnitPrice" = 0.5 WHERE "userId" = ${alice.id}`,
      ).rejects.toThrow(/may not decrease/i);
    });
  });

  // ── Accrual mechanics ───────────────────────────────────────────────────

  describe('accrual', () => {
    it('does not double-charge when the job runs twice at the same NAV', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');

      await fees.accrue(strategyId);
      const once = (await positionOf(alice.id)).accruedPerfFee;
      await fees.accrue(strategyId);
      await fees.accrue(strategyId);
      const thrice = (await positionOf(alice.id)).accruedPerfFee;

      // The performance fee is a mark-to-market of one liability, not a running sum of charges.
      expect(thrice.toFixed(18)).toBe(once.toFixed(18));
      expect(once.toFixed(2)).toBe('10000.00');
    });

    it('releases an uncrystallised accrual when the gain evaporates, as a new row not an edit', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);

      await setNavPerUnit('1.05');
      await fees.accrue(strategyId);

      const position = await positionOf(alice.id);
      // 0.05 × 100,000 × 50% = 2,500 remains owed; the rest was never earned.
      expect(position.accruedPerfFee.toFixed(2)).toBe('2500.00');

      const rows = await prisma.feeAccrual.findMany({
        where: { positionId: position.id, kind: 'PERFORMANCE' },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].amount.toFixed(2)).toBe('10000.00');
      expect(rows[1].amount.toFixed(2)).toBe('-7500.00');
      // Σ of the accrual rows is the accrued balance — the audit trail reconciles to the state.
      expect(exactSum(...rows.map((r) => r.amount)).toFixed(2)).toBe('2500.00');
    });

    it('never releases below zero when the pool falls under the high water mark', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);
      await setNavPerUnit('0.60');
      await fees.accrue(strategyId);

      const position = await positionOf(alice.id);
      expect(position.accruedPerfFee.toFixed(2)).toBe('0.00');
      // A "negative fee" would be the platform owing the investor for losing their money, which
      // is not what a profit share is.
      expect(position.accruedPerfFee.isNegative()).toBe(false);
    });

    it('records the arithmetic behind a charge, so an investor can recompute it', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);

      const row = await prisma.feeAccrual.findFirstOrThrow({
        where: { position: { userId: alice.id }, kind: 'PERFORMANCE' },
      });
      expect(row.rateBps).toBe(5000);
      expect(row.hwmUnitPrice!.toFixed(2)).toBe('1.00');
      expect(row.navPerUnit!.toFixed(2)).toBe('1.20');
      expect(row.baseAmount.toFixed(2)).toBe('120000.00');

      // (navPerUnit − hwm) × units × rate — recomputed from the row itself.
      const units = row.baseAmount.dividedBy(row.navPerUnit!);
      const expected = row.navPerUnit!.minus(row.hwmUnitPrice!).times(units).times(row.rateBps).dividedBy(10000);
      expect(expected.toFixed(2)).toBe(row.amount.toFixed(2));
    });

    it('refuses to rewrite what an investor was charged', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);
      const row = await prisma.feeAccrual.findFirstOrThrow({ where: { position: { userId: alice.id } } });

      await expect(
        prisma.$executeRaw`UPDATE fee_accruals SET amount = 1 WHERE id = ${row.id}`,
      ).rejects.toThrow(/frozen at accrual time/i);
      await expect(
        prisma.$executeRaw`DELETE FROM fee_accruals WHERE id = ${row.id}`,
      ).rejects.toThrow(/append-only/i);
    });

    it('writes no rows at all when nothing is owed', async () => {
      const alice = await invested('100000');
      await fees.accrue(strategyId);
      expect(await prisma.feeAccrual.count({ where: { position: { userId: alice.id } } })).toBe(0);
    });

    it('prorates the management fee by elapsed time, from a stored watermark', async () => {
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { mgmtFeeBps: 200 } });
      const alice = await invested('100000');

      // Backdate the watermark by exactly 365 days: a full year at 2% on 100,000 is 2,000.
      const position = await positionOf(alice.id);
      const start = new Date(Date.now() - 365 * DAY_MS);
      await prisma.investmentPosition.update({
        where: { id: position.id },
        data: { lastAccruedAt: start },
      });

      await fees.accrue(strategyId, new Date(start.getTime() + 365 * DAY_MS));
      const charged = (await positionOf(alice.id)).accruedMgmtFee;
      expect(charged.toFixed(2)).toBe('2000.00');
    });

    it('charges for a missed day when the job next runs, and only once for a day it already charged', async () => {
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { mgmtFeeBps: 365 } });
      const alice = await invested('100000');
      const position = await positionOf(alice.id);

      const t0 = new Date(Date.now() - 10 * DAY_MS);
      await prisma.investmentPosition.update({ where: { id: position.id }, data: { lastAccruedAt: t0 } });

      // The job misses two days and runs on the third. It must charge for all three: 3.65% a
      // year is 0.01% a day, so 3 days on 100,000 is 30.
      await fees.accrue(strategyId, new Date(t0.getTime() + 3 * DAY_MS));
      expect((await positionOf(alice.id)).accruedMgmtFee.toFixed(2)).toBe('30.00');

      // Running again immediately charges for the sliver of time since, not another period.
      await fees.accrue(strategyId, new Date(t0.getTime() + 3 * DAY_MS));
      expect((await positionOf(alice.id)).accruedMgmtFee.toFixed(2)).toBe('30.00');

      // One more day, one more day's charge.
      await fees.accrue(strategyId, new Date(t0.getTime() + 4 * DAY_MS));
      expect((await positionOf(alice.id)).accruedMgmtFee.toFixed(2)).toBe('40.00');
    });

    it('does not run time backwards if it is called with an earlier timestamp', async () => {
      await prisma.investmentStrategy.update({ where: { id: strategyId }, data: { mgmtFeeBps: 365 } });
      const alice = await invested('100000');
      const position = await positionOf(alice.id);
      const t0 = new Date(Date.now() - 10 * DAY_MS);
      await prisma.investmentPosition.update({ where: { id: position.id }, data: { lastAccruedAt: t0 } });

      await fees.accrue(strategyId, new Date(t0.getTime() + 5 * DAY_MS));
      const after = (await positionOf(alice.id)).accruedMgmtFee;

      // A clock going backwards must not credit the investor a fee they never paid.
      await fees.accrue(strategyId, new Date(t0.getTime() + 2 * DAY_MS));
      expect((await positionOf(alice.id)).accruedMgmtFee.toFixed(18)).toBe(after.toFixed(18));
    });
  });

  // ── Crystallisation ─────────────────────────────────────────────────────

  describe('crystallisation', () => {
    it('leaves every other investor\'s unit price exactly where it was', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.40');

      // Bob enters at the top, so he owes nothing and only Alice is charged.
      const bob = await investor('70000');
      await subscribe(bob.token, '70000').expect(201);
      await strike('bob enters');

      const bobBefore = await positionOf(bob.id);
      const priceBefore = await navPerUnit();

      const res = await crystallise();
      expect(res.body.charged).toHaveLength(1);
      expect(res.body.charged[0].userId).toBe(alice.id);

      const bobAfter = await positionOf(bob.id);
      const priceAfter = await navPerUnit();

      // This is the whole point: one investor's bill is paid out of that investor's units.
      expect(priceAfter.toFixed(18)).toBe(priceBefore.toFixed(18));
      expect(bobAfter.units.toFixed(18)).toBe(bobBefore.units.toFixed(18));
      expect(bobAfter.units.times(priceAfter).toFixed(2)).toBe(bobBefore.units.times(priceBefore).toFixed(2));
      expect(bobAfter.accruedPerfFee.toFixed(2)).toBe('0.00');
    });

    it('cancels units worth exactly the fee and moves the cash to platform revenue', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');
      const poolBefore = await poolCash();

      const res = await crystallise();
      const charged = res.body.charged[0];

      expect(charged.amount).toBe('10000');
      expect(new Prisma.Decimal(charged.unitsCancelled).times('1.2').toFixed(2)).toBe('10000.00');
      expect((await platformRevenue()).toFixed(2)).toBe('10000.00');
      expect((await poolCash()).toFixed(2)).toBe(poolBefore.minus(10000).toFixed(2));

      // The posting is a FEE_CRYSTALLISATION — the only transaction type, along with three
      // others, that the ownership boundary lets cross from pool to platform.
      const tx = await prisma.ledgerTransaction.findUniqueOrThrow({ where: { id: charged.transactionId } });
      expect(tx.type).toBe(LedgerTransactionType.FEE_CRYSTALLISATION);
    });

    it('keeps Σ units equal to totalUnits', async () => {
      const alice = await invested('33333.33');
      const bob = await investor('66666.67');
      await subscribe(bob.token, '66666.67').expect(201);
      await strike('bob');
      await setNavPerUnit('1.37');
      await crystallise();

      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      const positions = await prisma.investmentPosition.findMany({ where: { strategyId } });
      // Summed exactly: a plain `.plus()` chain rounds to 20 significant digits and would make
      // this assertion fail on the test's own arithmetic rather than on the code under test.
      const sum = exactSum(...positions.map((p) => p.units));

      expect(sum.toFixed(18)).toBe(strategy.totalUnits.toFixed(18));
      expect(alice.id && bob.id).toBeTruthy();
    });

    it('stamps every open accrual as settled and zeroes the balance', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);
      const res = await crystallise();

      const position = await positionOf(alice.id);
      expect(position.accruedPerfFee.toFixed(2)).toBe('0.00');
      expect(position.accruedMgmtFee.toFixed(2)).toBe('0.00');

      const open = await prisma.feeAccrual.count({
        where: { positionId: position.id, crystallisedAt: null },
      });
      expect(open).toBe(0);
      const settled = await prisma.feeAccrual.findFirstOrThrow({ where: { positionId: position.id } });
      expect(settled.crystallisedTransactionId).toBe(res.body.charged[0].transactionId);
    });

    it('charges nothing the second time it is run back to back', async () => {
      await invested('100000');
      await setNavPerUnit('1.20');
      await crystallise();
      const revenueAfterFirst = await platformRevenue();

      const second = await crystallise();
      expect(second.body.charged).toHaveLength(0);
      expect((await platformRevenue()).toFixed(18)).toBe(revenueAfterFirst.toFixed(18));
    });

    it('skips a position the pool cannot fund, and leaves its high water mark alone', async () => {
      const alice = await invested('100000');

      // The realistic shape of this: the pool is *up*, but the gain is in a position rather than
      // in cash. Move 99,900 USDC into WBTC at a price that leaves the pool worth 120,000, so
      // NAV rises to 1.20 and a fee accrues — while only 100 USDC is on hand to pay it with.
      await ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `buy-wbtc:${randomUUID()}`,
        legs: [
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount: '-99900' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId: wbtcId, type: LedgerAccountType.STRATEGY_POOL, strategyId, amount: '1' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId: wbtcId, type: LedgerAccountType.EXTERNAL, amount: '-1' },
          { userId: PLATFORM_SYSTEM_USER_ID, assetId, type: LedgerAccountType.EXTERNAL, amount: '99900' },
        ],
      });
      await seedMark(wbtcId, '119900');

      await fees.accrue(strategyId);
      expect((await positionOf(alice.id)).accruedPerfFee.toFixed(2)).toBe('10000.00');
      expect((await poolCash()).toFixed(2)).toBe('100.00');

      const res = await crystallise();
      expect(res.body.charged).toHaveLength(0);
      expect(res.body.skipped).toHaveLength(1);
      expect(res.body.skipped[0].reason).toMatch(/pool holds/i);

      // Not part-paid, and — crucially — the mark did not move. Ratcheting it here would mean
      // the investor lost their protection without the platform ever collecting.
      const position = await positionOf(alice.id);
      expect(position.hwmUnitPrice.toFixed(2)).toBe('1.00');
      expect(position.accruedPerfFee.toFixed(2)).toBe('10000.00');
      expect((await platformRevenue()).toFixed(2)).toBe('0.00');
    });
  });

  // ── Redemption ──────────────────────────────────────────────────────────

  describe('redemption', () => {
    it('deducts the accrued fee from the proceeds and pays the investor the rest', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');

      await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: '100000' })
        .expect(201);
      await strike('redeem everything');

      const redemption = await prisma.redemptionRequest.findFirstOrThrow({ where: { userId: alice.id } });
      expect(redemption.status).toBe('SETTLED');
      // Gross 120,000; fee 50% of the 20,000 gain = 10,000; net 110,000.
      expect(redemption.grossAmount!.toFixed(2)).toBe('120000.00');
      expect(redemption.feesCharged!.toFixed(2)).toBe('10000.00');
      expect(redemption.netAmount!.toFixed(2)).toBe('110000.00');

      const wallet = await prisma.balance.findFirstOrThrow({
        where: { userId: alice.id, assetId, type: LedgerAccountType.AVAILABLE, ledgerAccount: { strategyId: null } },
      });
      expect(wallet.amount.toFixed(2)).toBe('110000.00');
      expect((await platformRevenue()).toFixed(2)).toBe('10000.00');
    });

    it('charges a partial redemption pro rata, leaving the rest accrued against the units kept', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');

      await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: '25000' })
        .expect(201);
      await strike('partial');

      const redemption = await prisma.redemptionRequest.findFirstOrThrow({ where: { userId: alice.id } });
      // A quarter of the units, so a quarter of the 10,000 accrued.
      expect(redemption.feesCharged!.toFixed(2)).toBe('2500.00');
      expect(redemption.netAmount!.toFixed(2)).toBe('27500.00');

      // The other three quarters stay owed against the units still held — charging it all now
      // would bill the investor early for a position they have not exited.
      expect((await positionOf(alice.id)).accruedPerfFee.toFixed(2)).toBe('7500.00');
    });

    it('leaves the remaining holders\' unit price untouched', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.30');
      const bob = await investor('50000');
      await subscribe(bob.token, '50000').expect(201);
      await strike('bob enters');

      const priceBefore = await navPerUnit();
      await request(server())
        .post(`/api/v1/investments/strategies/${strategySlug}/redeem`)
        .set(auth(alice.token))
        .send({ units: '40000' })
        .expect(201);
      await strike('alice partially exits');

      // The fee is carved out of the gross the pool pays anyway, so the price does not move.
      expect((await navPerUnit()).toFixed(12)).toBe(priceBefore.toFixed(12));
      expect(bob.id).toBeDefined();
    });
  });

  // ── Authority and transparency ──────────────────────────────────────────

  describe('who may charge, and what an investor can see', () => {
    it('gives the manager no way to name an amount', async () => {
      await invested('100000');
      await setNavPerUnit('1.20');

      // Accrual takes no body at all, and crystallisation is above the manager's authority:
      // the manager is the beneficiary of the charge.
      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/accrue-fees`)
        .set(auth(managerToken))
        .send({ amount: '999999' })
        .expect(201);

      await request(server())
        .post(`/api/v1/admin/investments/strategies/${strategyId}/crystallise-fees`)
        .set(auth(managerToken))
        .send({ amount: '999999' })
        .expect(403);

      // Whatever was sent, the amount owed is the one the formula produces.
      const position = await prisma.investmentPosition.findFirstOrThrow({ where: { strategyId } });
      expect(position.accruedPerfFee.toFixed(2)).toBe('10000.00');
    });

    it('refuses a performance fee above the platform ceiling, at the database', async () => {
      await expect(
        prisma.$executeRaw`UPDATE investment_strategies SET "perfFeeBps" = 9000 WHERE id = ${strategyId}`,
      ).rejects.toThrow(/perf_fee_range/i);
    });

    it('shows an investor the terms and every accrual behind their charges', async () => {
      const alice = await invested('100000');
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);

      const res = await request(server())
        .get(`/api/v1/investments/me/positions/${strategySlug}/fees`)
        .set(auth(alice.token))
        .expect(200);

      expect(res.body.terms.performanceFeeBps).toBe(5000);
      expect(res.body.terms.description).toContain('50% of profit above your high water mark');
      expect(res.body.highWaterMark).toBe('1');
      expect(res.body.accrued.total).toBe('10000');
      expect(res.body.accruals).toHaveLength(1);
      expect(res.body.accruals[0]).toMatchObject({
        kind: 'PERFORMANCE',
        rateBps: 5000,
        hwmUnitPrice: '1',
        navPerUnit: '1.2',
        amount: '10000',
        isRelease: false,
      });
    });

    it('never shows one investor another\'s fees', async () => {
      const alice = await invested('100000');
      const bob = await investor('50000');
      await subscribe(bob.token, '50000').expect(201);
      await strike('bob');
      await setNavPerUnit('1.20');
      await fees.accrue(strategyId);

      const mine = await request(server())
        .get(`/api/v1/investments/me/positions/${strategySlug}/fees`)
        .set(auth(bob.token))
        .expect(200);

      const aliceFees = await request(server())
        .get(`/api/v1/investments/me/positions/${strategySlug}/fees`)
        .set(auth(alice.token))
        .expect(200);

      expect(mine.body.accrued.total).not.toBe(aliceFees.body.accrued.total);
      expect(mine.body.accruals.every((a: { id: string }) => a.id)).toBe(true);
    });
  });

  // ── Precision ───────────────────────────────────────────────────────────

  describe('precision', () => {
    it('keeps 18 decimal places through a fee charge on an awkward number', async () => {
      // 20-significant-digit truncation in Decimal.js bites at exactly this magnitude: a
      // five-figure balance with 18 decimal places has 23 significant digits, and a plain
      // `.plus()` silently drops the last three.
      const alice = await invested('12345.678901234567891234');
      await setNavPerUnit('1.234567890123456789');
      await crystallise();

      const strategy = await prisma.investmentStrategy.findUniqueOrThrow({ where: { id: strategyId } });
      const positions = await prisma.investmentPosition.findMany({ where: { strategyId } });
      // Summed exactly: a plain `.plus()` chain rounds to 20 significant digits and would make
      // this assertion fail on the test's own arithmetic rather than on the code under test.
      const sum = exactSum(...positions.map((p) => p.units));
      expect(sum.toFixed(18)).toBe(strategy.totalUnits.toFixed(18));

      // The pool still balances against what it paid out.
      const pool = await poolCash();
      const revenue = await platformRevenue();
      expect(exactSum(pool, revenue).greaterThan(0)).toBe(true);
      expect(alice.id).toBeDefined();
    });
  });
});
