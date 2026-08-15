import { Prisma } from '@prisma/client';
import { exactSum } from '../ledger/amount.util';

/**
 * Moves `totalUnits` by an exact Decimal delta, under a row lock.
 *
 * Deliberately not Prisma's `{ increment }`: that hands the arithmetic to the driver, which
 * does not preserve full decimal precision, so `Σ position.units` and `strategy.totalUnits`
 * drifted apart by ~1e-17 on any deal whose unit price does not divide evenly. Doing the
 * addition here, in Decimal, means both sides store the identical number by construction.
 *
 * The `FOR UPDATE` lock serialises concurrent settlements against the same strategy — a
 * read-modify-write on a shared counter is exactly the shape that silently loses updates.
 */
export async function adjustTotalUnits(
  tx: Prisma.TransactionClient,
  strategyId: string,
  delta: Prisma.Decimal,
): Promise<void> {
  const [locked] = await tx.$queryRaw<Array<{ totalUnits: Prisma.Decimal }>>`
    SELECT "totalUnits" FROM investment_strategies WHERE id = ${strategyId} FOR UPDATE
  `;
  const next = exactSum(locked.totalUnits, delta);
  await tx.investmentStrategy.update({
    where: { id: strategyId },
    data: { totalUnits: next },
  });
}
