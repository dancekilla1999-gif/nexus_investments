import { ApiProperty } from '@nestjs/swagger';
import { RiskLimitField } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class ProposeRiskLimitChangeDto {
  @ApiProperty({ enum: RiskLimitField })
  @IsEnum(RiskLimitField)
  field!: RiskLimitField;

  @ApiProperty({ example: 500, description: 'Basis points, 0–10000.' })
  @IsInt()
  @Min(0)
  @Max(10000)
  newValue!: number;
}

export class RejectRiskLimitChangeDto {
  @ApiProperty({ example: 'Strategy has not demonstrated stability at this drawdown yet.' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SetEmergencyControlDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ example: 'Suspected mark-price feed compromise, pausing pending investigation.' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
