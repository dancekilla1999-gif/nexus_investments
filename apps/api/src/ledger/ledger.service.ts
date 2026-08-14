import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LedgerAccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatAmount } from './amount.util';
import {
  BalanceView,
  PostTransactionInput,
  PostedTransaction,
  PostingLeg,
} from './ledger.types';

/**
 * Contra-accounts: the debit side of a credit to a user, negative by construction and never
 * owned by or visible to a user. Mirrors the CHECK constraint in migration
 * 20260814183100_sandbox_mint_non_negative_exemption — if one gains a member the other must too,
 * or postings will pass here and be rejected at COMMIT.
 */
const CONTRA_ACCOUNT_TYPES: ReadonlySet<LedgerAccountType> = new Set([
  LedgerAccountType.EXTERNAL,
  LedgerAccountType.SANDBOX_MINT,
]);

/**
 * The double-entry ledger — the system of record for user money
 * (docs/03-database-architecture.md §1). Everything that moves value goes through `post()`:
 * deposits, withdrawals, trades, transfers, P2P escrow, fees. There is no other write path,
 * and there is deliberately no method here that sets a balance directly.
 *
 * Three properties this class exists to guarantee, in order of importance:
 *
 *   1. **Conservation.** Every posting balances to zero per asset — value is moved, never
 *      created. Checked here for a good error message, and again by a deferred constraint
 *      trigger at COMMIT so a bug elsewhere still cannot write an unbalanced transaction.
 *   2. **Idempotency.** The same `idempotencyKey` never applies twice, no matter how many
 *      times a webhook redelivers or a queue job retries.
 *   3. **No double-spend.** Concurrent postings against the same account serialize on a row
 *      lock, so two simultaneous withdrawals of the same funds cannot both succeed.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Posting ────────────────────────────────────────────────────────────

  async post(input: PostTransactionInput): Promise<PostedTransaction> {
    this.assertLegsWellFormed(input.legs);

    const existing = await this.prisma.ledgerTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return { ...existing, replayed: true };
    }

    // Ledger accounts (and their balance rows) are created outside the money-moving
    // transaction: they carry no value, so creating one that ends up unused is harmless, and
    // it means the locking step below always has a row to lock. Creating them inside would
    // mean racing inserts deadlocking against each other on the unique index.
    const accountIds = await this.ensureAccounts(input.legs);
    const contraAccountIds = new Set(
      input.legs
        .map((leg, i) => (CONTRA_ACCOUNT_TYPES.has(leg.type) ? accountIds[i] : null))
        .filter((id): id is string => id !== null),
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Deterministic lock order (by id) — two concurrent postings touching the same pair of
        // accounts in opposite orders would otherwise deadlock.
        const lockedIds = [...accountIds].sort();
        const locked = await tx.$queryRaw<Array<{ ledgerAccountId: string; amount: Prisma.Decimal }>>`
          SELECT "ledgerAccountId", amount
          FROM balances
          WHERE "ledgerAccountId" = ANY(${lockedIds}::text[])
          ORDER BY "ledgerAccountId"
          FOR UPDATE
        `;

        const currentByAccount = new Map(locked.map((b) => [b.ledgerAccountId, new Prisma.Decimal(b.amount)]));

        // Net the legs per account first: a posting may legitimately touch the same account
        // twice (e.g. a fee taken from the same balance it debits), and only the net effect
        // determines whether the result is negative.
        const deltaByAccount = new Map<string, Prisma.Decimal>();
        input.legs.forEach((leg, i) => {
          const accountId = accountIds[i];
          const previous = deltaByAccount.get(accountId) ?? new Prisma.Decimal(0);
          deltaByAccount.set(accountId, previous.add(new Prisma.Decimal(leg.amount)));
        });

        for (const [accountId, delta] of deltaByAccount) {
          // Contra-accounts are expected to be negative — they measure value booked into the
          // platform, not a balance anyone holds. Every user-facing account must stay at or
          // above zero.
          if (contraAccountIds.has(accountId)) continue;

          const current = currentByAccount.get(accountId) ?? new Prisma.Decimal(0);
          const next = current.add(delta);
          if (next.isNegative()) {
            throw new BadRequestException({
              code: 'INSUFFICIENT_BALANCE',
              message: 'Insufficient balance for this operation.',
            });
          }
        }

        const ledgerTransaction = await tx.ledgerTransaction.create({
          data: {
            type: input.type,
            idempotencyKey: input.idempotencyKey,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            metadata: input.metadata,
            entries: {
              create: input.legs.map((leg, i) => ({
                ledgerAccountId: accountIds[i],
                amount: new Prisma.Decimal(leg.amount),
              })),
            },
          },
        });

        for (const [accountId, delta] of deltaByAccount) {
          const current = currentByAccount.get(accountId) ?? new Prisma.Decimal(0);
          await tx.balance.update({
            where: { ledgerAccountId: accountId },
            data: { amount: current.add(delta) },
          });
        }

        // Force the deferred balance-check trigger to run HERE, inside the transaction, rather
        // than at COMMIT. Without this, a violation still correctly rolls the transaction back,
        // but the failure surfaces during Prisma's own COMMIT where it is swallowed — the
        // caller is told the posting succeeded while nothing was written. Verified empirically
        // against PostgreSQL 16; the resulting error propagates normally.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');

        return { ...ledgerTransaction, replayed: false };
      });
    } catch (err) {
      // Two concurrent callers with the same idempotency key: one commits, the other loses the
      // race on the unique index. That is a successful no-op from the caller's perspective —
      // the transaction they asked for exists — not an error to propagate.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.ledgerTransaction.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (winner) {
          return { ...winner, replayed: true };
        }
      }
      throw err;
    }
  }

  private assertLegsWellFormed(legs: PostingLeg[]): void {
    if (legs.length < 2) {
      throw new BadRequestException({
        code: 'INVALID_LEDGER_POSTING',
        message: 'A ledger transaction requires at least two entries.',
      });
    }

    const totalByAsset = new Map<string, Prisma.Decimal>();
    for (const leg of legs) {
      const amount = new Prisma.Decimal(leg.amount);
      if (amount.isZero()) {
        throw new BadRequestException({
          code: 'INVALID_LEDGER_POSTING',
          message: 'A ledger entry cannot have a zero amount.',
        });
      }
      const running = totalByAsset.get(leg.assetId) ?? new Prisma.Decimal(0);
      totalByAsset.set(leg.assetId, running.add(amount));
    }

    for (const [assetId, total] of totalByAsset) {
      if (!total.isZero()) {
        throw new BadRequestException({
          code: 'UNBALANCED_LEDGER_POSTING',
          message: `Ledger transaction does not balance for asset ${assetId}: sums to ${total.toString()}.`,
        });
      }
    }
  }

  /**
   * Returns the ledger account id for each leg, positionally, creating the account and its
   * zeroed balance row if they don't exist yet.
   */
  private async ensureAccounts(legs: PostingLeg[]): Promise<string[]> {
    const ids: string[] = [];
    for (const leg of legs) {
      ids.push(
        await this.getOrCreateAccountId(
          leg.userId,
          leg.assetId,
          leg.type,
          leg.managedAccountId ?? null,
          leg.strategyId ?? null,
        ),
      );
    }
    return ids;
  }

  private async getOrCreateAccountId(
    userId: string,
    assetId: string,
    type: LedgerAccountType,
    managedAccountId: string | null,
    strategyId: string | null,
  ): Promise<string> {
    if (type === LedgerAccountType.STRATEGY_POOL && strategyId === null) {
      throw new BadRequestException({
        code: 'POOL_LEG_REQUIRES_STRATEGY',
        message: 'A STRATEGY_POOL leg must name the strategy that owns it.',
      });
    }
    if (type !== LedgerAccountType.STRATEGY_POOL && strategyId !== null) {
      // Otherwise "whose money is this?" would have two contradictory answers on one row.
      throw new BadRequestException({
        code: 'STRATEGY_ON_NON_POOL_LEG',
        message: `A ${type} leg cannot belong to a strategy pool.`,
      });
    }

    // Pool accounts are keyed by (strategy, asset) — many strategies share the platform system
    // user, so userId is not part of their identity.
    const identity =
      type === LedgerAccountType.STRATEGY_POOL
        ? { assetId, type, strategyId }
        : { userId, assetId, type, managedAccountId, strategyId: null };

    const existing = await this.prisma.ledgerAccount.findFirst({
      where: identity,
      select: { id: true },
    });
    if (existing) return existing.id;

    try {
      const created = await this.prisma.ledgerAccount.create({
        data: {
          userId,
          assetId,
          type,
          managedAccountId,
          strategyId,
          balance: { create: { userId, assetId, type, amount: new Prisma.Decimal(0) } },
        },
        select: { id: true },
      });
      return created.id;
    } catch (err) {
      // Lost a race to create the same account — one of the partial unique indexes
      // (ledger_accounts_personal_unique / _pool_unique / _platform_unique) caught it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.ledgerAccount.findFirstOrThrow({
          where: identity,
          select: { id: true },
        });
        return winner.id;
      }
      throw err;
    }
  }

  // ── Reading ────────────────────────────────────────────────────────────

  async getBalances(userId: string, managedAccountId: string | null = null): Promise<BalanceView[]> {
    const balances = await this.prisma.balance.findMany({
      where: { userId, ledgerAccount: { managedAccountId } },
      include: { asset: { include: { chain: true } } },
      orderBy: [{ assetId: 'asc' }, { type: 'asc' }],
    });

    return balances.map((b) => ({
      assetId: b.assetId,
      assetSymbol: b.asset.symbol,
      chainKey: b.asset.chain.key,
      type: b.type,
      amount: formatAmount(b.amount),
    }));
  }

  // ── Reconciliation ─────────────────────────────────────────────────────

  /**
   * Recomputes one account's balance from its entries. The projection in `balances` is a cache;
   * this is the source of truth it must always agree with (docs/03-database-architecture.md §1).
   */
  async recomputeBalance(ledgerAccountId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.ledgerEntry.aggregate({
      where: { ledgerAccountId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  /**
   * Compares every stored balance against a from-scratch recomputation of its entries.
   * Returns the accounts that disagree — empty means the ledger and its projection are
   * consistent. MVP2's acceptance criteria require this to be empty; a scheduled job will run
   * it continuously in production and raise a RECONCILIATION_MISMATCH risk event
   * (docs/06-blockchain-architecture.md §5) rather than waiting for a user to notice.
   */
  async verifyReconciliation(): Promise<
    Array<{ ledgerAccountId: string; projected: string; recomputed: string }>
  > {
    const mismatches = await this.prisma.$queryRaw<
      Array<{ ledgerAccountId: string; projected: Prisma.Decimal; recomputed: Prisma.Decimal }>
    >`
      SELECT
        b."ledgerAccountId"          AS "ledgerAccountId",
        b.amount                     AS projected,
        COALESCE(SUM(e.amount), 0)   AS recomputed
      FROM balances b
      LEFT JOIN ledger_entries e ON e."ledgerAccountId" = b."ledgerAccountId"
      GROUP BY b."ledgerAccountId", b.amount
      HAVING b.amount <> COALESCE(SUM(e.amount), 0)
    `;

    if (mismatches.length > 0) {
      this.logger.error(
        `Ledger reconciliation found ${mismatches.length} mismatched account(s) — this must be investigated immediately.`,
      );
    }

    return mismatches.map((m) => ({
      ledgerAccountId: m.ledgerAccountId,
      projected: formatAmount(m.projected),
      recomputed: formatAmount(m.recomputed),
    }));
  }
}
