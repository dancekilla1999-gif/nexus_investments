/**
 * Owner of the platform-boundary (EXTERNAL) ledger accounts.
 *
 * `LedgerAccount.userId` is non-nullable, and deliberately so — every query, index, and
 * constraint in the ledger is simpler when accounts always have an owner, and system accounts
 * are a handful of rows against millions of user ones. Rather than weaken that for every
 * account, the platform's own accounts are owned by one reserved, seeded identity that can
 * never authenticate (no usable password hash, permanently CLOSED status, reserved email
 * domain) and is filtered out of every user-facing listing.
 *
 * Seeded by `prisma/seed.ts` as reference data, with a fixed id so services can reference it
 * without a lookup.
 */
export const PLATFORM_SYSTEM_USER_ID = 'system__platform_boundary';
export const PLATFORM_SYSTEM_USER_EMAIL = 'system+boundary@nexus.internal.invalid';
