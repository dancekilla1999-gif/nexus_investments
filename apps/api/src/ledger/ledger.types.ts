import { LedgerAccountType, LedgerTransactionType, Prisma } from '@prisma/client';

/**
 * One side of a double-entry posting. `amount` is signed: positive credits the account,
 * negative debits it. The legs of a single posting must sum to zero per asset — enforced in
 * the service AND by a deferred constraint trigger in the database
 * (migration 20260814091830_ledger_integrity_constraints).
 */
export interface PostingLeg {
  userId: string;
  assetId: string;
  type: LedgerAccountType;
  amount: Prisma.Decimal | string | number;
  /** Null/omitted = the user's own self-directed balance; set = a Managed Account sub-balance. */
  managedAccountId?: string | null;
}

export interface PostTransactionInput {
  type: LedgerTransactionType;
  /**
   * Caller-supplied or deterministically derived (e.g. `deposit:${chainId}:${txHash}:${logIndex}`).
   * Replaying the same key never double-applies — see docs/03-database-architecture.md §3.
   */
  idempotencyKey: string;
  legs: PostingLeg[];
  referenceType?: string;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface PostedTransaction {
  id: string;
  type: LedgerTransactionType;
  idempotencyKey: string;
  createdAt: Date;
  /** True when this call matched an existing transaction by idempotency key and applied nothing. */
  replayed: boolean;
}

export interface BalanceView {
  assetId: string;
  assetSymbol: string;
  chainKey: string;
  type: LedgerAccountType;
  amount: string;
}
