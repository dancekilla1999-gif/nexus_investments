import { Prisma } from '@prisma/client';
import { Mark, MarkProvider, MarkRequest } from './mark-provider.interface';

/**
 * One unit of an asset is worth one unit of itself.
 *
 * This is the pool's cash leg: a strategy denominated in USDC valuing its USDC holding needs no
 * price feed, and asking one would introduce a failure mode (and a depeg question) where there
 * is genuinely no uncertainty.
 *
 * Note what this deliberately does **not** do: it does not mark stablecoins at par against each
 * other. USDT is not definitionally worth 1 USDC — it has traded well away from it — and
 * assuming otherwise would quietly overstate NAV exactly when it matters most.
 */
export class IdentityMarkProvider implements MarkProvider {
  readonly key = 'identity';

  async getMark(request: MarkRequest): Promise<Mark | null> {
    if (request.assetId !== request.quoteAssetId) return null;
    return { price: new Prisma.Decimal(1), source: this.key, asOf: new Date() };
  }
}
