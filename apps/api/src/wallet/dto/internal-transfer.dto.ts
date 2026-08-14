import { ApiProperty } from '@nestjs/swagger';
import { LedgerAccountType } from '@prisma/client';
import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';

/**
 * The balance buckets a user may move funds between themselves. Deliberately a narrower set
 * than LedgerAccountType: LOCKED and PENDING are moved *by the system* (an order reserving
 * funds, a deposit awaiting confirmations) and must never be a user-selectable destination —
 * being able to move your own funds out of LOCKED would defeat the point of locking them.
 */
export const USER_TRANSFERABLE_BUCKETS = [
  LedgerAccountType.AVAILABLE,
  LedgerAccountType.TRADING,
  LedgerAccountType.FUNDING,
] as const;

export class InternalTransferDto {
  @ApiProperty({ enum: USER_TRANSFERABLE_BUCKETS })
  @IsEnum(LedgerAccountType)
  from!: LedgerAccountType;

  @ApiProperty({ enum: USER_TRANSFERABLE_BUCKETS })
  @IsEnum(LedgerAccountType)
  to!: LedgerAccountType;

  @ApiProperty({ description: 'Asset id to move.' })
  @IsString()
  assetId!: string;

  @ApiProperty({
    description:
      'Decimal amount as a string. Strings, not numbers: an 18-decimal value does not survive a float64 round-trip.',
    example: '10.5',
  })
  @IsString()
  @MaxLength(40)
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount must be a positive decimal string with at most 18 decimal places',
  })
  amount!: string;
}
