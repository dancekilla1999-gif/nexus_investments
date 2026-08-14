import { Prisma } from '@prisma/client';

/**
 * A price, and where it came from.
 *
 * Provenance is not metadata here — it is the control. Whoever can set a price can author their
 * own performance fee, so a mark that cannot say where it came from must not be used to value
 * anyone's money (docs/12 §5).
 */
export interface Mark {
  /** Price of one unit of the asset, expressed in the quote asset. */
  price: Prisma.Decimal;
  /** Provider identity, e.g. `coingecko` or `identity`. Recorded on the NAV snapshot. */
  source: string;
  /** When the provider observed it — not when we read it. Staleness is judged on this. */
  asOf: Date;
}

export interface MarkRequest {
  assetId: string;
  assetSymbol: string;
  /** External price-feed identifier, from `assets.coingeckoId`. Null = this provider cannot help. */
  externalId: string | null;
  quoteAssetId: string;
  quoteAssetSymbol: string;
  quoteExternalId: string | null;
}

/**
 * A source of prices. Deliberately has no `setMark` and no way for a caller to supply a value —
 * the absence is the point. There is no code path anywhere in this platform by which an operator
 * can hand the NAV engine a number.
 */
export interface MarkProvider {
  readonly key: string;
  /** Null when this provider has no opinion about the pair; the registry tries the next one. */
  getMark(request: MarkRequest): Promise<Mark | null>;
}
