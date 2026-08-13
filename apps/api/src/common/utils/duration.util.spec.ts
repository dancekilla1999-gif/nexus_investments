import { parseDurationToMs } from './duration.util';

describe('parseDurationToMs', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 15 * 60_000],
    ['2h', 2 * 60 * 60_000],
    ['30d', 30 * 24 * 60 * 60_000],
  ])('parses "%s" to %i ms', (input, expected) => {
    expect(parseDurationToMs(input)).toBe(expected);
  });

  it('throws on an invalid format', () => {
    expect(() => parseDurationToMs('not-a-duration')).toThrow();
    expect(() => parseDurationToMs('15')).toThrow();
    expect(() => parseDurationToMs('15y')).toThrow();
  });
});
