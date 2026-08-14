import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealingFrequency, StrategyCustodyModel } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DECIMAL = /^\d+(\.\d{1,18})?$/;

export class CreateStrategyDto {
  @ApiProperty({ example: 'ai-top-25' })
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug must be lowercase kebab-case' })
  @MaxLength(64)
  slug!: string;

  @ApiProperty({ example: 'AI Top 25' })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  thesis?: string;

  @ApiProperty({ description: 'Asset the strategy NAV is denominated in.' })
  @IsString()
  baseAssetId!: string;

  @ApiProperty({ example: '1000', description: 'Decimal string.' })
  @IsString()
  @Matches(DECIMAL)
  minimumInvestment!: string;

  @ApiPropertyOptional({ example: '500000' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL)
  maximumInvestment?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  lockupDays?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  redemptionNoticeDays?: number;

  @ApiPropertyOptional({ enum: DealingFrequency })
  @IsOptional()
  @IsEnum(DealingFrequency)
  dealingFrequency?: DealingFrequency;

  /**
   * Bounds mirror the CHECK constraints and the service-layer gate. The platform's model is a
   * pure 50/50 profit share (perfFeeBps 5000, mgmtFeeBps 0) — see docs/12 §6.0 — but both stay
   * configurable per strategy, and neither is ever hardcoded in the frontend.
   */
  @ApiPropertyOptional({ default: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  mgmtFeeBps?: number;

  @ApiPropertyOptional({ default: 5000, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  perfFeeBps?: number;

  /** Hard platform ceiling of 1000 (10%). A strategy may be stricter, never looser. */
  @ApiPropertyOptional({ default: 1000, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxDrawdownBps?: number;

  @ApiPropertyOptional({ example: 'BTC' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  benchmarkSymbol?: string;

  @ApiPropertyOptional({ enum: StrategyCustodyModel, default: StrategyCustodyModel.POOLED_NAV })
  @IsOptional()
  @IsEnum(StrategyCustodyModel)
  custodyModel?: StrategyCustodyModel;
}
