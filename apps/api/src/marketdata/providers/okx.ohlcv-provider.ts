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
 * Platform timeframe → OKX bar code.
 *
 * **`1Dutc` and `1Wutc`, not `1D` and `1W`.** OKX's plain daily bar opens at 16:00 UTC, a Hong
 * Kong close convention; Coinbase's opens at 00:00. Compared naively, the two venues share *zero*
 * daily bars — they are not disagreeing about a price, they are describing different days.
 *
 * Found by running both providers against the live APIs and printing the overlap: 1h had five
 * common bars agreeing to 10 bps, and 1d had none at all. The cross-check silently degraded to
 * doing nothing, which is the worst way for a data-quality mechanism to fail, because it goes on
 * reporting success. Anchoring every platform timeframe to UTC fixes it at the source rather
 * than teaching the comparator about venue conventions.
 */
const OKX_BAR: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1H',
  // 4H has no `utc` variant, and needs none: OKX's 4H buckets already land on 00/04/08/12/16/20
  // UTC, verified against the live API. Coinbase has no 4h granularity at all — its nearest
  // bucket is 6h — so 4h simply has no cross-check, which is stated rather than faked.
  '4h': '4H',
  '1d': '1Dutc',
  '1w': '1Wutc',
};

interface OkxResponse {
  code: string;
  msg: string;
  data?: string[][];
}

/**
 * OKX public market data. No API key, no registration, deep history.
 *
 * **Primary, chosen empirically rather than from the docs' first recommendation.** `docs/17` §5
 * proposed Binance as the default, and Binance turned out to answer this deployment's requests
 * with a geographic block — as did Bybit, behind a CloudFront country rule. OKX, Coinbase and
 * Kraken all answered. That is exactly the situation the provider abstraction exists for: the
 * finding cost one afternoon and a config change instead of a rewrite, and it is worth recording
 * that the recommendation in a design document is a hypothesis until something calls the API.
 */
export class OkxOhlcvProvider implements OhlcvProvider {
  readonly key = 'okx';
  readonly tier = 'PRIMARY' as const;
  private readonly logger = new Logger(OkxOhlcvProvider.name);

  constructor(private readonly baseUrl = 'https://www.okx.com', private readonly timeoutMs = 10_000) {}

  supports(symbol: string): boolean {
    return symbol.includes('/');
  }

  /** "BTC/USDT" → "BTC-USDT". */
  private instId(symbol: string): string {
    return symbol.replace('/', '-');
  }

  /**
   * Closed bars, newest `limit` of them, paginating backwards when more than one page is asked for.
   *
   * OKX caps `/candles` at 300 rows. A research harness that can only ever see 300 bars is not a
   * research harness — 300 hourly bars is under two weeks, which is not enough to label, split
   * and walk forward over. Deeper history comes from `/history-candles` with an `after` cursor,
   * walking backwards until the request is satisfied or the venue runs out.
   */
  async fetchOhlcv(query: OhlcvQuery): Promise<OhlcvBar[] | null> {
    const bar = OKX_BAR[query.timeframe];
    if (!bar) return null;

    const collected = new Map<number, OhlcvBar>();
    let cursor: number | null = null;
    let pages = 0;
    // A hard page cap so a misbehaving cursor cannot spin. 40 pages is 4000 bars, which is well
    // past what any single call should be asking for.
    const maxPages = Math.min(40, Math.ceil(query.limit / 100) + 1);

    while (collected.size < query.limit && pages < maxPages) {
      const page: OhlcvBar[] | null = await this.fetchPage(query, bar, cursor);
      pages++;
      if (!page || page.length === 0) break;

      for (const b of page) collected.set(b.openTime.getTime(), b);

      const oldest = Math.min(...page.map((b) => b.openTime.getTime()));
      // `after` means "strictly older than this timestamp" on OKX. If the cursor does not move,
      // the venue has no more history and looping again would fetch the same page forever.
      if (cursor !== null && oldest >= cursor) break;
      cursor = oldest;
    }

    if (collected.size === 0) return null;

    const bars = [...collected.values()].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
    return bars.slice(-query.limit);
  }

  /**
   * One page. `cursor` null asks the live endpoint for the newest bars; a cursor asks the history
   * endpoint for bars strictly older than it.
   */
  private async fetchPage(
    query: OhlcvQuery,
    bar: string,
    cursor: number | null,
  ): Promise<OhlcvBar[] | null> {
    const endpoint = cursor === null ? 'candles' : 'history-candles';
    const url =
      `${this.baseUrl}/api/v5/market/${endpoint}` +
      `?instId=${encodeURIComponent(this.instId(query.symbol))}` +
      `&bar=${bar}&limit=${cursor === null ? Math.min(query.limit + 1, 300) : 100}` +
      (cursor === null ? '' : `&after=${cursor}`);

    let payload: OkxResponse;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) {
        this.logger.warn(`OKX responded ${res.status} for ${query.symbol} ${query.timeframe}`);
        return null;
      }
      payload = (await res.json()) as OkxResponse;
    } catch (err) {
      this.logger.warn(
        `OKX unreachable for ${query.symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    if (payload.code !== '0' || !Array.isArray(payload.data)) {
      this.logger.warn(`OKX error for ${query.symbol}: ${payload.code} ${payload.msg}`);
      return null;
    }

    const span = TIMEFRAME_MS[query.timeframe];
    const bars: OhlcvBar[] = [];

    // OKX returns newest-first: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm].
    for (const row of payload.data) {
      // `confirm` is OKX telling us whether the bar is closed. Trusting it is better than
      // inferring closure from the clock, which gets it wrong across the boundary.
      if (row[8] !== '1') continue;

      const openTime = new Date(Number(row[0]));
      if (!Number.isFinite(openTime.getTime())) continue;

      bars.push({
        openTime,
        closeTime: new Date(openTime.getTime() + span),
        open: new Prisma.Decimal(row[1]),
        high: new Prisma.Decimal(row[2]),
        low: new Prisma.Decimal(row[3]),
        close: new Prisma.Decimal(row[4]),
        volume: new Prisma.Decimal(row[5]),
        trades: null,
      });
    }

    return bars.length === 0 ? null : bars;
  }
}
