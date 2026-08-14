-- Adds the platform-boundary contra-account, and scopes the non-negative balance rule to
-- user-facing balances only.
--
-- Found by writing the ledger's own test suite: there was no legitimate way to originate value
-- in the system. Double-entry requires a deposit to debit *something* in order to credit a
-- user, and every account type available was one that must never go negative — so a deposit
-- was, structurally, impossible to record. EXTERNAL is that counter-account: its (negative)
-- balance is the platform's cumulative obligation to its users, which is precisely the figure
-- custody reconciliation compares against on-chain holdings.
--
-- See the LedgerAccountType enum in schema.prisma for the full rationale.

ALTER TYPE "LedgerAccountType" ADD VALUE 'EXTERNAL';
