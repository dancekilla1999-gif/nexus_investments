import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateStrategyDto } from './create-strategy.dto';

/**
 * `slug`, `baseAssetId` and `custodyModel` are deliberately not updatable: the first is a
 * public URL investors may have saved, and the other two change what the strategy fundamentally
 * is. Those need a new strategy, not an edit.
 */
export class UpdateStrategyDto extends PartialType(
  OmitType(CreateStrategyDto, ['slug', 'baseAssetId', 'custodyModel'] as const),
) {
  @ApiPropertyOptional({ description: 'The validated TradingStrategy this product will trade.' })
  @IsOptional()
  @IsString()
  tradingStrategyId?: string;
}
