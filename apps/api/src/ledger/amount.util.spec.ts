import { Prisma } from '@prisma/client';
import { formatAmount } from './amount.util';

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
