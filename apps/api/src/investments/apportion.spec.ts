import { Prisma } from '@prisma/client';
import { apportion, sumApportioned, Weighted } from './apportion';

const D = (v: string | number) => new Prisma.Decimal(v);

function holders(...weights: Array<string | number>): Weighted[] {
  return weights.map((w, i) => ({ key: `h${i}`, weight: D(w) }));
}

/**
 * The whole point of this function is one property: the parts add up to the whole. Most of these
 * tests are that property under conditions chosen to break it — repeating decimals, wildly
 * unequal weights, many holders, tiny totals.
 */
describe('apportion', () => {
  describe('the parts always sum to the whole', () => {
    it('divides evenly when it can', () => {
      const result = apportion(D('900'), holders(1, 1, 1));
      expect(result.map((r) => r.amount.toFixed(2))).toEqual(['300.00', '300.00', '300.00']);
      expect(sumApportioned(result).equals(D('900'))).toBe(true);
    });

    it('handles a total that does not divide evenly', () => {
      // 100 / 3 repeats forever. Floored shares leave a shortfall that must go somewhere.
      const result = apportion(D('100'), holders(1, 1, 1));
      expect(sumApportioned(result).equals(D('100'))).toBe(true);
    });

    it.each([
      ['1', [1, 1, 1]],
      ['0.000000000000000001', [1, 1, 1]],
      ['1000000000', [7, 11, 13, 17]],
      ['12345.678901234567890123', [1, 2, 3, 5, 8, 13, 21]],
      ['3', [1, 1, 1, 1, 1, 1, 1]],
    ])('sums exactly for total %s', (total, weights) => {
      const result = apportion(D(total), holders(...weights));
      expect(sumApportioned(result).toFixed(18)).toBe(D(total).toFixed(18));
    });

    it('sums exactly with wildly unequal weights', () => {
      // A whale and a dust holder in the same pool is the normal case, not the edge case.
      const result = apportion(D('1000000'), holders('999999999999', '0.000000000000000001'));
      expect(sumApportioned(result).equals(D('1000000'))).toBe(true);
    });

    it('sums exactly across 10,000 holders', () => {
      // The acceptance criterion for MVP14. Rounding error that is invisible at three holders
      // is the whole story at ten thousand.
      const many: Weighted[] = Array.from({ length: 10_000 }, (_, i) => ({
        key: `h${i}`,
        weight: D(i + 1),
      }));
      const total = D('7777777.777777777777777777');

      const result = apportion(total, many);

      expect(result).toHaveLength(10_000);
      expect(sumApportioned(result).toFixed(18)).toBe(total.toFixed(18));
    });
  });

  describe('shares are fair and bounded', () => {
    it('gives a holder with no units exactly nothing', () => {
      const result = apportion(D('100'), [
        { key: 'a', weight: D(1) },
        { key: 'redeemed', weight: D(0) },
      ]);
      expect(result.find((r) => r.key === 'redeemed')!.amount.isZero()).toBe(true);
      expect(result.find((r) => r.key === 'a')!.amount.equals(D('100'))).toBe(true);
    });

    it('never overpays a holder by more than one ulp', () => {
      const weights = holders(1, 1, 1, 1, 1, 1, 1);
      const total = D('10');
      const ideal = total.dividedBy(7);
      const ulp = D('1e-18');

      for (const part of apportion(total, weights)) {
        expect(part.amount.lessThanOrEqualTo(ideal.plus(ulp))).toBe(true);
        expect(part.amount.isNegative()).toBe(false);
      }
    });

    it('gives the remainder to whoever was rounded down hardest', () => {
      // Weights 1 and 2 of 3: the 2/3 holder loses more to flooring, so the leftover ulp is
      // theirs. Handing it to the first holder in the list instead would be arbitrary.
      const result = apportion(D('1'), [
        { key: 'small', weight: D(1) },
        { key: 'large', weight: D(2) },
      ]);
      const small = result.find((r) => r.key === 'small')!.amount;
      const large = result.find((r) => r.key === 'large')!.amount;

      expect(small.plus(large).equals(D('1'))).toBe(true);
      expect(large.greaterThan(small)).toBe(true);
      // 1/3 floors to 0.333…333 and 2/3 to 0.666…666, leaving one ulp for the larger remainder.
      expect(large.toFixed(18)).toBe('0.666666666666666667');
      expect(small.toFixed(18)).toBe('0.333333333333333333');
    });

    it('is deterministic — the same input gives the same output', () => {
      // A report that disagrees with itself between runs is worse than one that is slightly off.
      const weights = holders(1, 1, 1, 1, 1);
      const first = apportion(D('100'), weights).map((r) => r.amount.toFixed(18));
      for (let i = 0; i < 5; i++) {
        expect(apportion(D('100'), weights).map((r) => r.amount.toFixed(18))).toEqual(first);
      }
    });

    it('preserves the caller\'s ordering, whatever the remainder does', () => {
      const result = apportion(D('100'), holders(5, 3, 1));
      expect(result.map((r) => r.key)).toEqual(['h0', 'h1', 'h2']);
    });
  });

  describe('degenerate inputs', () => {
    it('divides zero among holders as zero each', () => {
      const result = apportion(D('0'), holders(1, 2, 3));
      expect(result.every((r) => r.amount.isZero())).toBe(true);
    });

    it('divides zero among zero holders', () => {
      expect(apportion(D('0'), [])).toEqual([]);
    });

    it('refuses to divide a non-zero total among nobody', () => {
      // Returning [] would discard the money from the report rather than report a problem.
      expect(() => apportion(D('100'), [])).toThrow(/zero holders/);
    });

    it('refuses to divide a non-zero total among holders with no units', () => {
      expect(() => apportion(D('100'), holders(0, 0))).toThrow(/no weight/);
    });

    it('refuses a negative total', () => {
      expect(() => apportion(D('-1'), holders(1))).toThrow(/must not be negative/);
    });
  });

  describe('scale', () => {
    it('respects a coarser scale exactly', () => {
      // Fiat is quoted to 2dp; the same exactness must hold there.
      const result = apportion(D('100'), holders(1, 1, 1), 2);
      expect(result.map((r) => r.amount.toFixed(2)).sort()).toEqual(['33.33', '33.33', '33.34']);
      expect(sumApportioned(result).toFixed(2)).toBe('100.00');
    });
  });
});
