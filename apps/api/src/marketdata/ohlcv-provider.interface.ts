import { Prisma } from '@prisma/client';

/**
 * The timeframes the platform speaks. Every provider translates to and from these; nothing
 * downstream ever sees a venue's own spelling.
 */
export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
};

/**
 * One OHLCV bar as a provider reported it.
 *
 * `closeTime` is derived, not taken from the provider: venues disagree about whether their
 * "close time" is inclusive or exclusive, and a one-millisecond difference in that convention
 * decides whether a bar is knowable before or after the instant a model is scored at. Deriving
 * it from `openTime + timeframe` makes the convention the platform's, uniformly.
 */
export interface OhlcvBar {
  openTime: Date;
  closeTime: Date;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
  trades: number | null;
}

export interface OhlcvQuery {
  /** Canonical symbol, e.g. "BTC/USDT". */
  symbol: string;
  timeframe: Timeframe;
  /** Most recent N closed bars. */
  limit: number;
}

export interface ProviderTierInfo {
  readonly key: string;
  readonly tier: 'PRIMARY' | 'SECONDARY' | 'REFERENCE';
}

/**
 * An OHLCV source.
 *
 * Two rules every implementation follows, and they are the reason this interface exists at all:
 *
 *   1. **Return only closed bars.** Venues routinely include the forming bar as the last element.
 *      Passing it on would put a partial candle into a feature window, and the resulting
 *      indicator would be computed from a bar that does not exist yet — the single most common
 *      lookahead bug in retail backtesting, and it is silent.
 *   2. **Decline rather than guess.** An unreachable venue, a rate limit, an unknown symbol and
 *      a malformed payload all return `null`. They do not return a shorter list, a stale cache,
 *      or a zero. The registry's job is to notice absence; a provider that papers over its own
 *      failure removes the registry's ability to do that.
 */
export interface OhlcvProvider extends ProviderTierInfo {
  /** Whether this venue lists the pair at all. Cheap, and does not count as a failure. */
  supports(symbol: string): boolean;
  /** Closed bars, oldest first. `null` means "I could not answer", never "there is nothing". */
  fetchOhlcv(query: OhlcvQuery): Promise<OhlcvBar[] | null>;
}
