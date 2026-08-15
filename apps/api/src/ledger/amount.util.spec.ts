import { Prisma } from '@prisma/client';
import { exactDiff, exactNeg, exactSum, formatAmount, quantize } from './amount.util';

describe('formatAmount', () => {
  it('renders sub-wei magnitudes positionally, never in exponential notation', () => {
    // Decimal.toString() gives "3e-18" here, which would reach a user's wallet screen verbatim.
    expect(formatAmount(new Prisma.Decimal('0.000000000000000003'))).toBe('0.000000000000000003');
    expect(formatAmount(new Prisma.Decimal('1e-18'))).toBe('0.000000000000000001');
  });

  it('trims trailing zeros without mangling whole numbers or zero', () => {
    expect(formatAmount(new Prisma.Decimal('1.500000000000000000'))).toBe('1.5');
    expect(formatAmount(new Prisma.Decimal('42'))).toBe('42');
    expect(formatAmount(new Prisma.Decimal('0'))).toBe('0');
    expect(formatAmount(new Prisma.Decimal('-0'))).toBe('0');
  });

  it('preserves large magnitudes positionally', () => {
    expect(formatAmount(new Prisma.Decimal('123456789012345.678'))).toBe('123456789012345.678');
  });

  it('keeps negative amounts signed (the EXTERNAL boundary account is negative by design)', () => {
    expect(formatAmount(new Prisma.Decimal('-1000'))).toBe('-1000');
    expect(formatAmount(new Prisma.Decimal('-0.000000000000000001'))).toBe('-0.000000000000000001');
  });

  it('accepts strings and numbers, not just Decimal', () => {
    expect(formatAmount('7.10')).toBe('7.1');
    expect(formatAmount(3)).toBe('3');
  });
});

/**
 * `Prisma.Decimal` is Decimal.js capped at **20 significant digits**, and that cap applies to
 * addition, subtraction and even negation — not only to multiplication and division. A
 * `Decimal(36, 18)` balance spends 18 of those digits after the point, so anything from 100
 * upward is already over the line, and the loss is silent.
 *
 * Each test pairs a helper against the raw operator it replaces, so the failure mode stays
 * visible in the file instead of being described in a comment. This is not theoretical: an
 * ordinary fee crystallisation made `Σ units == totalUnits` stop holding, because the running
 * total was accumulated with `.plus()`.
 */
describe('exact decimal arithmetic', () => {
  const BIG = '10000.123456789012345678'; // 23 significant digits
  const ULP = '0.000000000000000001';

  it('adds without dropping the digits the raw operator loses', () => {
    const a = new Prisma.Decimal(BIG);

    // The bug, demonstrated: three decimal places vanish from a five-figure balance.
    expect(a.plus(ULP).toFixed(18)).toBe('10000.123456789012346000');

    expect(exactSum(a, ULP).toFixed(18)).toBe('10000.123456789012345679');
  });

  it('subtracts without dropping digits', () => {
    const a = new Prisma.Decimal(BIG);
    expect(a.minus(ULP).toFixed(18)).toBe('10000.123456789012346000');
    expect(exactDiff(a, ULP).toFixed(18)).toBe('10000.123456789012345677');
  });

  it('negates without changing the magnitude', () => {
    // `negated()` is exact, but the two ways people reach for instead are not — both round, and
    // a debit leg that quietly changes magnitude no longer matches the credit leg it came from.
    const a = new Prisma.Decimal(BIG);
    expect(a.times(-1).toFixed(18)).toBe('-10000.123456789012346000');
    expect(new Prisma.Decimal(0).minus(a).toFixed(18)).toBe('-10000.123456789012346000');

    const negated = exactNeg(a);
    expect(negated.toFixed(18)).toBe('-10000.123456789012345678');
    expect(exactSum(a, negated).isZero()).toBe(true);
  });

  it('sums many values without accumulating drift', () => {
    // A thousand 18-decimal addends. The naive accumulator's error compounds at every step,
    // which is what makes a per-position sum disagree with a stored total.
    const values = Array.from(
      { length: 1000 },
      (_, i) => new Prisma.Decimal(`1000.${String(i).padStart(18, '0')}`),
    );

    const exact = exactSum(...values);
    const naive = values.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0));

    expect(exact.toFixed(18)).toBe('1000000.000000000000499500');
    expect(naive.toFixed(18)).not.toBe(exact.toFixed(18));
  });

  it('changes nothing for values that already fit', () => {
    expect(exactSum('1.5', '2.25').toFixed(2)).toBe('3.75');
    expect(exactDiff('10', '0.1').toFixed(1)).toBe('9.9');
    expect(exactNeg('0').isZero()).toBe(true);
    expect(exactSum().isZero()).toBe(true);
  });

  it('quantises downward, never up', () => {
    // Issuing more units than the money paid for dilutes existing holders; paying out more than
    // a claim is worth takes it from the ones who stay. Down harms nobody.
    expect(quantize(new Prisma.Decimal('1.9999999999999999999')).toFixed(18)).toBe('1.999999999999999999');
    expect(quantize(new Prisma.Decimal('-1.0000000000000000001')).toFixed(18)).toBe('-1.000000000000000000');
  });
});
