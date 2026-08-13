import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { UserRole, UserStatus } from '@prisma/client';

/**
 * Explicit allow-list for anything that leaves the process shaped like a User — the opposite
 * of the destructuring-out-the-secrets pattern, which silently leaks a new sensitive column
 * the moment someone adds one to the Prisma model and forgets to strip it by hand
 * (docs/05-security-architecture.md §4). `passwordHash`/`totpSecretEnc` are never even
 * candidates here because they're simply not declared — `excludeExtraneousValues` drops
 * anything not marked `@Expose()`.
 */
@Exclude()
class ProfileResponseDto {
  @Expose() firstName?: string | null;
  @Expose() lastName?: string | null;
  @Expose() country?: string | null;
  @Expose() preferredCurrency!: string;
  @Expose() timezone!: string;
  @Expose() avatarUrl?: string | null;
}

@Exclude()
export class UserResponseDto {
  @Expose() id!: string;
  @Expose() email!: string;
  @Expose() role!: UserRole;
  @Expose() status!: UserStatus;
  @Expose() totpEnabled!: boolean;
  @Expose() withdrawalWhitelistEnabled!: boolean;
  @Expose() referralCode!: string;
  @Expose() createdAt!: Date;
  @Expose() lastLoginAt?: Date | null;

  @Expose()
  @Transform(({ obj }) => Boolean(obj.emailVerifiedAt))
  emailVerified!: boolean;

  @Expose()
  @Type(() => ProfileResponseDto)
  profile?: ProfileResponseDto;
}
