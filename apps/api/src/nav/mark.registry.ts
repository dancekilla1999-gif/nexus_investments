import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { CoinGeckoMarkProvider } from './coingecko.mark-provider';
import { IdentityMarkProvider } from './identity.mark-provider';
import { Mark, MarkProvider, MarkRequest } from './mark-provider.interface';

export class StaleMarkError extends Error {
  constructor(
    readonly assetSymbol: string,
    readonly ageSeconds: number,
    readonly maxAgeSeconds: number,
  ) {
    super(
      `Mark for ${assetSymbol} is ${ageSeconds}s old, past the ${maxAgeSeconds}s limit. ` +
        'Refusing to value a position on a stale price.',
    );
    this.name = 'StaleMarkError';
  }
}

export class NoMarkError extends Error {
  constructor(readonly assetSymbol: string) {
    super(
      `No price source can mark ${assetSymbol}. A NAV that omits a holding is worse than no NAV.`,
    );
    this.name = 'NoMarkError';
  }
}

/**
 * Resolves a price for (asset, quote asset) by asking providers in order, and enforces the two
 * rules that make a mark usable:
 *
 *   1. **It must exist.** An asset nothing can price is not valued at zero — the whole valuation
 *      fails. Zero-valuing a holding understates NAV, which understates every investor's stake
 *      and quietly reduces the performance fee base; it is wrong in a direction someone benefits
 *      from, which is the worst kind of wrong.
 *   2. **It must be fresh.** A dead feed answers instantly with yesterday's number. Freshness is
 *      judged on the provider's own `asOf`, never on when we made the call.
 *
 * Caching is short and Redis-backed so several strategies revaluing in the same minute make one
 * upstream call rather than N. The cache **stores `asOf`** and the staleness check runs after
 * reading it, so a cache hit can never launder a stale price into a fresh-looking one.
 */
@Injectable()
export class MarkRegistry {
  private readonly logger = new Logger(MarkRegistry.name);
  private readonly providers: MarkProvider[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    // Identity first: a pool's base asset needs no feed, and asking one would invent a failure
    // mode where there is no uncertainty.
    this.providers = [
      new IdentityMarkProvider(),
      new CoinGeckoMarkProvider(this.config.coingeckoBaseUrl, this.config.coingeckoApiKey),
    ];
  }

  /** Throws rather than returning null: a caller that can ignore a missing mark will. */
  async requireMark(assetId: string, quoteAssetId: string): Promise<Mark> {
    const [asset, quote] = await Promise.all([
      this.prisma.asset.findUniqueOrThrow({ where: { id: assetId } }),
      this.prisma.asset.findUniqueOrThrow({ where: { id: quoteAssetId } }),
    ]);

    const request: MarkRequest = {
      assetId: asset.id,
      assetSymbol: asset.symbol,
      externalId: asset.coingeckoId,
      quoteAssetId: quote.id,
      quoteAssetSymbol: quote.symbol,
      quoteExternalId: quote.coingeckoId,
    };

    const cached = await this.readCache(assetId, quoteAssetId);
    const mark = cached ?? (await this.resolve(request));

    if (!mark) throw new NoMarkError(asset.symbol);

    const ageSeconds = Math.floor((Date.now() - mark.asOf.getTime()) / 1000);
    const maxAge = this.config.markMaxAgeSeconds;
    if (ageSeconds > maxAge) {
      throw new StaleMarkError(asset.symbol, ageSeconds, maxAge);
    }
    if (mark.price.lessThanOrEqualTo(0)) {
      throw new NoMarkError(asset.symbol);
    }

    if (!cached) await this.writeCache(assetId, quoteAssetId, mark);
    return mark;
  }

  private async resolve(request: MarkRequest): Promise<Mark | null> {
    for (const provider of this.providers) {
      try {
        const mark = await provider.getMark(request);
        if (mark) return mark;
      } catch (err) {
        // One broken provider must not stop the others being tried, but it must be visible:
        // silently falling through every provider ends in NoMarkError with no explanation.
        this.logger.error(
          `Provider "${provider.key}" failed for ${request.assetSymbol}/${request.quoteAssetSymbol}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return null;
  }

  private cacheKey(assetId: string, quoteAssetId: string): string {
    return `mark:${assetId}:${quoteAssetId}`;
  }

  private async readCache(assetId: string, quoteAssetId: string): Promise<Mark | null> {
    const raw = await this.redis.get(this.cacheKey(assetId, quoteAssetId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { price: string; source: string; asOf: string };
      return {
        price: new Prisma.Decimal(parsed.price),
        source: parsed.source,
        // Preserved from the provider, not reset on cache write — otherwise a cache hit would
        // make a stale price look freshly observed.
        asOf: new Date(parsed.asOf),
      };
    } catch {
      return null;
    }
  }

  private async writeCache(assetId: string, quoteAssetId: string, mark: Mark): Promise<void> {
    await this.redis.set(
      this.cacheKey(assetId, quoteAssetId),
      JSON.stringify({ price: mark.price.toString(), source: mark.source, asOf: mark.asOf.toISOString() }),
      'EX',
      this.config.markCacheTtlSeconds,
    );
  }
}
