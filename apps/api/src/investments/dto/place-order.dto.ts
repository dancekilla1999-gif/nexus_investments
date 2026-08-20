import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StrategyOrderType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const DECIMAL_STRING = /^\d+(\.\d{1,18})?$/;

/**
 * Everything the terminal needs to know is the strategy's own two assets and how much of one to
 * sell for the other — there is no field anywhere on this DTO for a destination account, a
 * recipient, or which ledger accounts to touch. Both legs of the resulting posting are computed
 * server-side and stay inside the strategy's own STRATEGY_POOL (MVP18 acceptance: "no endpoint
 * that accepts an arbitrary transfer").
 */
export class PlaceOrderDto {
  @ApiProperty({ description: 'Asset id being sold, one the strategy pool currently holds.' })
  @IsString()
  fromAssetId!: string;

  @ApiProperty({ description: 'Asset id being bought.' })
  @IsString()
  toAssetId!: string;

  @ApiProperty({ enum: StrategyOrderType })
  @IsEnum(StrategyOrderType)
  type!: StrategyOrderType;

  @ApiProperty({ example: '2.5', description: 'Amount of fromAsset to sell, as a decimal string.' })
  @IsString()
  @MaxLength(40)
  @Matches(DECIMAL_STRING, { message: 'fromQuantity must be a positive decimal string' })
  fromQuantity!: string;

  @ApiPropertyOptional({
    example: '3400.00',
    description:
      'Required for LIMIT/STOP: the toAsset-per-fromAsset rate that triggers a fill. LIMIT fills ' +
      'once the achievable rate rises to at least this; STOP fills once it falls to this or below.',
  })
  @ValidateIf((dto: PlaceOrderDto) => dto.type !== StrategyOrderType.MARKET)
  @IsString()
  @MaxLength(40)
  @Matches(DECIMAL_STRING, { message: 'triggerPrice must be a positive decimal string' })
  triggerPrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}
