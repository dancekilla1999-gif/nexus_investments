import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class FaucetDto {
  @ApiProperty({ description: 'Asset id to credit with test funds.' })
  @IsString()
  assetId!: string;

  @ApiProperty({ example: '100', description: 'Decimal amount as a string.' })
  @IsString()
  @MaxLength(40)
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount must be a positive decimal string with at most 18 decimal places',
  })
  amount!: string;
}
