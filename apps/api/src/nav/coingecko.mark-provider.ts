import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Mark, MarkProvider, MarkRequest } from './mark-provider.interface';

interface SimplePriceResponse {
  [coinId: string]: { usd?: number; last_updated_at?: number };
}

/**
 * Prices from CoinGecko's public simple-price endpoint.
 *
 * Chosen for the same reason Sepolia was chosen for the chain adapter: it is a real, external,
 * independently-operated source. A price the platform generates itself is not a mark, it is an
 * assertion — and an assertion by the party that gets paid on performance.
 *
 * Cross-rates go through USD: both legs are priced in USD and divided. That is one extra hop of
 * rounding, but the alternative — asking for `vs_currency=<the pool's base asset>` — only works
 * for currencies CoinGecko happens to support and would silently fail for an arbitrary token
 * pair.
 *
 * **`last_updated_at` is used as `asOf`, not the time we called.** A feed that has stopped
 * updating still answers instantly with a stale number; judging freshness by our own clock would
 * make a frozen oracle look perfectly healthy.
 */
export class CoinGeckoMarkProvider implements MarkProvider {
  readonly key = 'coingecko';
  private readonly logger = new Logger(CoinGeckoMarkProvider.name);

  constructor(
    private readonly baseUrl = 'https://api.coingecko.com/api/v3',
    private readonly apiKey?: string,
    private readonly timeoutMs = 8000,
  ) {}

  async getMark(request: MarkRequest): Promise<Mark | null> {
    if (!request.externalId || !request.quoteExternalId) {
      // No feed identifier for one of the legs. Returning null lets the registry try another
      // provider and, failing that, refuse to value — which is the correct outcome. Guessing a
      // price for an asset we cannot identify would be worse than admitting we cannot.
      return null;
    }

    const ids = Array.from(new Set([request.externalId, request.quoteExternalId]));
    const prices = await this.fetchUsdPrices(ids);
    if (!prices) return null;

    const assetUsd = prices[request.externalId];
    const quoteUsd = prices[request.quoteExternalId];

    if (assetUsd === undefined || quoteUsd === undefined) {
      this.logger.warn(
        `No USD price for ${assetUsd === undefined ? request.assetSymbol : request.quoteAssetSymbol}.`,
      );
      return null;
    }
    if (quoteUsd.price <= 0) {
      // Dividing by a zero or negative quote would produce an infinite or negative NAV.
      this.logger.error(`Implausible quote price for ${request.quoteAssetSymbol}: ${quoteUsd.price}`);
      return null;
    }

    // Prices arrive as JSON numbers, so they are float64 the moment they are parsed — there is
    // no avoiding that at the wire. Converting through the shortest exact decimal string keeps
    // the value the feed actually sent rather than a float's binary expansion, and every
    // downstream operation is Decimal.
    const price = new Prisma.Decimal(assetUsd.price.toString()).dividedBy(
      new Prisma.Decimal(quoteUsd.price.toString()),
    );

    // The pair is only as fresh as its stalest leg.
    const asOf = assetUsd.asOf < quoteUsd.asOf ? assetUsd.asOf : quoteUsd.asOf;

    return { price, source: this.key, asOf };
  }

  private async fetchUsdPrices(
    ids: string[],
  ): Promise<Record<string, { price: number; asOf: Date }> | null> {
    const url = new URL(`${this.baseUrl}/simple/price`);
    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_last_updated_at', 'true');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: this.apiKey ? { 'x-cg-demo-api-key': this.apiKey } : undefined,
      });

      if (!response.ok) {
        // Including 429. A rate-limited feed is an unavailable feed, and NAV must fail rather
        // than fall back to something older than the staleness policy allows.
        this.logger.warn(`CoinGecko responded ${response.status} for ${ids.join(',')}`);
        return null;
      }

      const body = (await response.json()) as SimplePriceResponse;
      const out: Record<string, { price: number; asOf: Date }> = {};

      for (const id of ids) {
        const entry = body[id];
        if (!entry || typeof entry.usd !== 'number' || !Number.isFinite(entry.usd)) continue;
        out[id] = {
          price: entry.usd,
          asOf: entry.last_updated_at ? new Date(entry.last_updated_at * 1000) : new Date(0),
        };
      }

      return out;
    } catch (err) {
      this.logger.warn(
        `CoinGecko unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
