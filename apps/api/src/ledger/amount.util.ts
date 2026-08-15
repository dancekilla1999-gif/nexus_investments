import { Prisma } from '@prisma/client';

/**
 * Renders a monetary amount as a plain decimal string for transport across the API boundary.
 *
 * `Decimal.prototype.toString()` switches to exponential notation for very small or very large
 * magnitudes — a balance of one wei serializes as `"3e-18"`, which a frontend will render
 * verbatim to a user and which naive client-side parsing mishandles. `toFixed()` always
 * produces positional notation.
 *
 * Trailing zeros are trimmed so `1.500000000000000000` reads as `1.5`, while `0` stays `"0"`
 * rather than becoming an empty string.
 *
 * Amounts cross the wire as strings, never as JavaScript numbers: 18-decimal values exceed
 * what a float64 can represent exactly, and silently rounding someone's balance in JSON
 * serialization is not a class of bug worth risking.
 */
export function formatAmount(value: Prisma.Decimal | string | number, decimals = 18): string {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  const fixed = decimal.toFixed(decimals);

  if (!fixed.includes('.')) return fixed;

  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

/** The scale the database stores money and units at — `Decimal(36, 18)`. */
export const STORED_DP = 18;

/**
 * Intermediates here multiply a holding by a price and then divide by units — three operations
 * where Decimal.js's default 20 significant digits truncates silently. See CLAUDE.md §2 rule 10.
 */
export const HighPrecision = Prisma.Decimal.clone({ precision: 60 });

/**
 * Rounds to the precision the database actually stores, **downward**, before a value is used
 * anywhere.
 *
 * Two reasons, and the first is a bug this codebase already had. Decimal.js keeps ~20
 * significant digits, so `400 / 1.2` is a repeating decimal that gets rounded once when a
 * position row is written and *again*, differently, when the same value is added into
 * `totalUnits` — Postgres rounds the accumulated sum, not each addend. The two disagree by
 * ~1e-17 per deal, `Σ units == totalUnits` stops holding, and every per-investor figure derived
 * from it is quietly wrong. Quantising once, here, means both sides store the identical number.
 *
 * Downward specifically: issuing *more* units than the money paid for dilutes every existing
 * holder, and paying out more than a claim is worth takes it from the ones who stay. Rounding
 * down leaves a sub-wei residue in the pool, which is the only direction that harms nobody.
 * Applied to a fee it rounds in the investor's favour, which is the same principle.
 */
export function quantize(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(STORED_DP, Prisma.Decimal.ROUND_DOWN);
}

/**
 * Addition that does not lose digits.
 *
 * `Prisma.Decimal` is Decimal.js configured to **20 significant digits**, and that limit applies
 * to `plus`/`minus`, not only to multiplication and division. A balance stored at
 * `Decimal(36, 18)` uses 18 of those digits after the point, so anything from 100 upward is
 * already at the limit:
 *
 *     new Decimal('10000.123456789012345678').plus('0.000000000000000001')
 *       → 10000.123456789012346          // three decimal places gone, silently
 *
 * That is not a rounding artefact at the edge of representable precision — it is a five-figure
 * balance losing real stored digits on an ordinary addition. Every `Σ units == totalUnits`
 * invariant in the system is a chain of these, and the drift is invisible until a reconciliation
 * fails for no apparent reason.
 *
 * Summing at 60 digits and quantising once at the end is exact: the inputs are all whole
 * multiples of 1e-18, so their sum is too, and nothing is lost in the final rounding.
 */
export function exactSum(...values: Array<Prisma.Decimal | string | number>): Prisma.Decimal {
  const total = values.reduce<InstanceType<typeof HighPrecision>>(
    (acc, v) => acc.plus(new HighPrecision(v.toString())),
    new HighPrecision(0),
  );
  return new Prisma.Decimal(total.toFixed(STORED_DP));
}

/**
 * `−v`, exactly.
 *
 * `Decimal.negated()` is itself exact — it flips the sign without re-rounding — but the obvious
 * alternatives are not: `x.times(-1)` and `new Decimal(0).minus(x)` both go through the rounding
 * step and drop a 23-digit balance to 20. Since a negated value is almost always the debit leg
 * of a posting whose credit leg is the original, a silent change of magnitude there means the
 * transaction no longer balances. Having one named helper is what stops the next person reaching
 * for `times(-1)`.
 */
export function exactNeg(v: Prisma.Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(new HighPrecision(v.toString()).negated().toFixed(STORED_DP));
}

/** `a − b`, exactly. Same reasoning as {@link exactSum}; a difference truncates just as readily. */
export function exactDiff(
  a: Prisma.Decimal | string | number,
  b: Prisma.Decimal | string | number,
): Prisma.Decimal {
  return new Prisma.Decimal(
    new HighPrecision(a.toString()).minus(new HighPrecision(b.toString())).toFixed(STORED_DP),
  );
}
