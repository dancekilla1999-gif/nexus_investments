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
