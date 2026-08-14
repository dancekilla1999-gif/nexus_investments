import { Prisma } from '@prisma/client';

/**
 * Splitting a total across weighted holders so the parts sum **exactly** to the whole.
 *
 * The naive form — `total × wᵢ / Σw`, rounded per holder — does not add up. Round every share
 * down and the parts fall short of the total; round to nearest and they can overshoot. Either
 * way `Σ parts ≠ total`, and in a fund that discrepancy is not cosmetic: it is either value
 * shown to nobody or value shown to two people at once, and it compounds every time exposure is
 * recomputed.
 *
 * This uses the largest-remainder method (Hamilton apportionment): floor every share, then hand
 * the shortfall out one unit-in-the-last-place at a time to whoever was rounded down hardest.
 * The result sums to the total by construction, and the leftover goes to the holders with the
 * strongest claim to it rather than to whoever the loop happened to reach first.
 *
 * Ties break on the caller's key, so the same inputs always produce the same output. A
 * non-deterministic apportionment would make two runs of the same report disagree.
 */

/**
 * Decimal.js keeps 20 significant digits by default, which silently truncates an intermediate
 * like `total × weight` before the division ever happens — the same class of precision loss that
 * already produced a real bug in unit issuance. A local high-precision constructor keeps the
 * intermediates exact without changing behaviour anywhere else in the process.
 */
const HighPrecision = Prisma.Decimal.clone({ precision: 60 });

export interface Weighted {
  /** Stable identifier; also the deterministic tie-break for the remainder. */
  key: string;
  weight: Prisma.Decimal;
}

export interface Apportioned {
  key: string;
  amount: Prisma.Decimal;
}

/**
 * @param total    The amount to divide. May be zero; must not be negative.
 * @param holders  Weights (unit holdings). Zero weights are allowed and receive zero.
 * @param decimals Storage scale — the granularity the result must land on.
 *
 * Guarantees, all asserted by the test suite:
 *   - `Σ result == total`, exactly, at any scale and holder count.
 *   - Every share is ≥ 0 and ≤ its unrounded ideal plus one ulp.
 *   - A holder with zero weight receives exactly zero.
 *   - Identical inputs produce identical output.
 */
export function apportion(
  total: Prisma.Decimal,
  holders: Weighted[],
  decimals = 18,
): Apportioned[] {
  if (total.isNegative()) {
    throw new Error('apportion: total must not be negative');
  }
  if (holders.length === 0) {
    if (total.isZero()) return [];
    // Dividing a non-zero amount among nobody would have to discard it. Refusing is the only
    // honest answer — silently returning [] loses the money from the report.
    throw new Error('apportion: cannot divide a non-zero total among zero holders');
  }

  const totalWeight = holders.reduce(
    (acc, h) => acc.plus(new HighPrecision(h.weight.toString())),
    new HighPrecision(0),
  );

  if (totalWeight.isZero()) {
    if (total.isZero()) return holders.map((h) => ({ key: h.key, amount: new Prisma.Decimal(0) }));
    throw new Error('apportion: cannot divide a non-zero total among holders with no weight');
  }

  const scaled = new HighPrecision(total.toString());
  const ulp = new HighPrecision(10).pow(-decimals);

  // Floor every share, and remember how much each holder was shortchanged by.
  const parts = holders.map((holder) => {
    const ideal = scaled.times(new HighPrecision(holder.weight.toString())).dividedBy(totalWeight);
    const floored = ideal.toDecimalPlaces(decimals, Prisma.Decimal.ROUND_DOWN);
    return { key: holder.key, floored, remainder: ideal.minus(floored) };
  });

  const distributed = parts.reduce((acc, p) => acc.plus(p.floored), new HighPrecision(0));
  const shortfall = scaled.minus(distributed);

  // Flooring can never lose a whole ulp per holder, so the shortfall is always fewer ulps than
  // there are holders. If that ever stops being true the arithmetic above is wrong, and a wrong
  // apportionment must not be returned quietly.
  const steps = Number(shortfall.dividedBy(ulp).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP));
  if (!Number.isFinite(steps) || steps < 0 || steps > holders.length) {
    throw new Error(
      `apportion: implausible remainder of ${steps} ulps across ${holders.length} holders`,
    );
  }

  // Largest remainder first; ties by key so the result is reproducible.
  const order = [...parts].sort((a, b) => {
    const cmp = b.remainder.comparedTo(a.remainder);
    return cmp !== 0 ? cmp : a.key.localeCompare(b.key);
  });

  const bonus = new Set<string>();
  for (let i = 0; i < steps; i++) bonus.add(order[i].key);

  return parts.map((p) => ({
    key: p.key,
    amount: new Prisma.Decimal(
      (bonus.has(p.key) ? p.floored.plus(ulp) : p.floored).toFixed(decimals),
    ),
  }));
}

/**
 * Sums an apportionment — used by callers that want to assert exactness at the call site.
 *
 * Accumulates in the high-precision constructor, and this is not a detail. Adding 18-decimal
 * values in a default `Prisma.Decimal` rounds the running total to 20 significant digits, so a
 * total above ~100 loses its tail and the sum of a *correct* apportionment reads as wrong. The
 * first version of this helper did exactly that: the function callers use to verify exactness
 * was itself the lossy step.
 */
export function sumApportioned(parts: Apportioned[]): Prisma.Decimal {
  const total = parts.reduce(
    (acc, p) => acc.plus(new HighPrecision(p.amount.toString())),
    new HighPrecision(0),
  );
  return new Prisma.Decimal(total.toString());
}
