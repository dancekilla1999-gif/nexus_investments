import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OhlcvBar,
  OhlcvProvider,
  OhlcvQuery,
  TIMEFRAME_MS,
  Timeframe,
} from '../ohlcv-provider.interface';

/**
 * Coinbase Exchange public candles. No key required.
 *
 * **Secondary, and the cross-check that makes disagreement detection possible.** A single source
 * cannot be wrong in a way anybody notices; two can. Coinbase is a good second precisely because
 * it is a different venue with a different user base and different outage causes, so its
 * failures are unlikely to correlate with OKX's.
 *
 * Two real limitations, stated rather than worked around:
 *
 *   - Coinbase offers a fixed granularity set. There is no 30m and no 1w, so `supports` and
 *     `fetchOhlcv` decline those outright instead of substituting a nearby timeframe. A
 *     substituted timeframe compared against a real one manufactures a disagreement.
 *   - It quotes USD, not USDT. `BTC/USDT` is served from `BTC-USD`, which is a genuine
 *     approximation — during a Tether depeg the two are not the same price. That is acceptable
 *     for a corroborating source whose job is to catch a venue printing a wrong number, and it
 *     is not acceptable for a mark. The registry never uses a SECONDARY value when the primary
 *     answered.
 */
const COINBASE_GRANULARITY: Partial<Record<Timeframe, number>> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 21600, // Coinbase's 6h bucket — see below; deliberately NOT offered as 4h.
  '1d': 86400,
};

/** The timeframes Coinbase can answer exactly. 4h is excluded: its nearest bucket is 6h. */
const EXACT: Timeframe[] = ['1m', '5m', '15m', '1h', '1d'];

export class CoinbaseOhlcvProvider implements OhlcvProvider {
  readonly key = 'coinbase';
  readonly tier = 'SECONDARY' as const;
  private readonly logger = new Logger(CoinbaseOhlcvProvider.name);

  constructor(
    private readonly baseUrl = 'https://api.exchange.coinbase.com',
    private readonly timeoutMs = 10_000,
  ) {}

  supports(symbol: string): boolean {
    return symbol.includes('/');
  }

  supportsTimeframe(timeframe: Timeframe): boolean {
    return EXACT.includes(timeframe);
  }

  /** "BTC/USDT" → "BTC-USD". Coinbase's quote currency is USD; see the class comment. */
  private productId(symbol: string): string {
    const [base, quote] = symbol.split('/');
    const mapped = quote === 'USDT' || quote === 'USDC' ? 'USD' : quote;
    return `${base}-${mapped}`;
  }

  async fetchOhlcv(query: OhlcvQuery): Promise<OhlcvBar[] | null> {
    if (!this.supportsTimeframe(query.timeframe)) return null;
    const granularity = COINBASE_GRANULARITY[query.timeframe];
    if (!granularity) return null;

    const url =
      `${this.baseUrl}/products/${encodeURIComponent(this.productId(query.symbol))}/candles` +
      `?granularity=${granularity}`;

    let rows: number[][];
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'User-Agent': 'nexus-investments/1.0' },
      });
      if (!res.ok) {
        this.logger.warn(`Coinbase responded ${res.status} for ${query.symbol}`);
        return null;
      }
      const body = await res.json();
      if (!Array.isArray(body)) return null;
      rows = body as number[][];
    } catch (err) {
      this.logger.warn(
        `Coinbase unreachable for ${query.symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    const span = TIMEFRAME_MS[query.timeframe];
    const now = Date.now();
    const bars: OhlcvBar[] = [];

    // Coinbase rows are [time, low, high, open, close, volume], newest first, seconds.
    // Note the ordering: low and high come BEFORE open and close, which is the opposite of most
    // venues and an easy way to silently invert a candle.
    for (const row of rows) {
      const openTime = new Date(row[0] * 1000);
      const closeTime = new Date(openTime.getTime() + span);

      // Coinbase has no `confirm` flag, so closure is inferred from the clock. A bar counts as
      // closed only once its close time has actually passed.
      if (closeTime.getTime() > now) continue;

      bars.push({
        openTime,
        closeTime,
        low: new Prisma.Decimal(row[1]),
        high: new Prisma.Decimal(row[2]),
        open: new Prisma.Decimal(row[3]),
        close: new Prisma.Decimal(row[4]),
        volume: new Prisma.Decimal(row[5]),
        trades: null,
      });
    }

    if (bars.length === 0) return null;

    bars.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
    return bars.slice(-query.limit);
  }
}
