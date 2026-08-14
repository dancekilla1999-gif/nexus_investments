import { ApiProperty } from '@nestjs/swagger';
import { StrategyStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetStrategyStatusDto {
  @ApiProperty({ enum: StrategyStatus })
  @IsEnum(StrategyStatus)
  status!: StrategyStatus;
}
