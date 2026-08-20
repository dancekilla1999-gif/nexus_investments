import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateStrategyDto } from './create-strategy.dto';

/**
 * `slug`, `baseAssetId` and `custodyModel` are deliberately not updatable: the first is a
 * public URL investors may have saved, and the other two change what the strategy fundamentally
 * is. Those need a new strategy, not an edit.
 *
 * `maxDrawdownBps` is also omitted (MVP19, docs/12 §8): it may be *set* at creation like any
 * other initial configuration, but *changing* it afterwards is a risk-limit change and must go
 * through `RiskLimitsService`'s dual control — a plain PATCH here would let a single compromised
 * account widen its own drawdown ceiling, exactly what dual control exists to prevent.
 */
export class UpdateStrategyDto extends PartialType(
  OmitType(CreateStrategyDto, ['slug', 'baseAssetId', 'custodyModel', 'maxDrawdownBps'] as const),
) {
  @ApiPropertyOptional({ description: 'The validated TradingStrategy this product will trade.' })
  @IsOptional()
  @IsString()
  tradingStrategyId?: string;
}
