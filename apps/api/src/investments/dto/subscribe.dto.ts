import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ example: '5000', description: 'Decimal string, in the strategy base asset.' })
  @IsString()
  @MaxLength(40)
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount must be a positive decimal string with at most 18 decimal places',
  })
  amount!: string;

  /** Supply one to make a retried subscribe safe; omitted, the server generates one. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class RedeemDto {
  @ApiProperty({
    example: '250.5',
    description:
      'Units to redeem, or "ALL". Denominated in units rather than currency because the ' +
      'currency value is not known until the dealing-point NAV is struck.',
  })
  @IsString()
  @MaxLength(40)
  @Matches(/^(ALL|\d+(\.\d{1,18})?)$/, { message: 'units must be a positive decimal string or "ALL"' })
  units!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class StrikeDealingPointDto {
  @ApiProperty({
    example: 'manual:risk-ops',
    description: 'Where the valuation came from. Stored on the snapshot so a price is traceable.',
  })
  @IsString()
  @MaxLength(120)
  markSource!: string;
}
