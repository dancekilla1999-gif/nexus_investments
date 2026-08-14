-- Scope the non-negative balance rule to user-facing balances.
--
-- Separate from the migration that adds the EXTERNAL enum value because PostgreSQL will not
-- allow a newly-added enum value to be *used* in the same transaction it was added in, and
-- Prisma runs each migration file in its own transaction.
--
-- The invariant being expressed: a user can never hold less than zero of an asset (that would
-- be the platform having created money it does not hold). The EXTERNAL boundary account is the
-- mirror image of that and is expected to be negative — see the LedgerAccountType enum.

ALTER TABLE balances DROP CONSTRAINT balances_non_negative;

ALTER TABLE balances
  ADD CONSTRAINT balances_non_negative
  CHECK (type = 'EXTERNAL' OR amount >= 0);
