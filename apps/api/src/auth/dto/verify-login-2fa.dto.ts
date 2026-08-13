import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VerifyLoginTwoFactorDto {
  @ApiProperty({ description: 'Short-lived ticket returned by /auth/login when 2FA is required.' })
  @IsString()
  loginTicket!: string;

  @ApiProperty({ description: '6-digit TOTP code, or a backup code (format XXXXX-XXXXX).' })
  @IsString()
  @Length(6, 11)
  code!: string;
}
