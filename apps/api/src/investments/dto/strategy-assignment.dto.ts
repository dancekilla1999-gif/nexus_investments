import { ApiProperty } from '@nestjs/swagger';
import { StrategyAssignmentRole } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class AssignTraderDto {
  @ApiProperty({ description: 'The user id being granted trading rights on this strategy.' })
  @IsString()
  userId!: string;

  @ApiProperty({ enum: StrategyAssignmentRole })
  @IsEnum(StrategyAssignmentRole)
  role!: StrategyAssignmentRole;
}
