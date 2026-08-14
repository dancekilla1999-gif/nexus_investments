-- Exempt SANDBOX_MINT from the non-negative balance rule, alongside EXTERNAL.
--
-- Both are contra-accounts: they are the debit side of a credit to a user, so their balances
-- are negative by construction. The invariant the constraint actually protects is that a *user*
-- can never hold less than zero of an asset.
--
-- Migrating existing sandbox data is deliberately NOT done here. Faucet history already posted
-- against EXTERNAL stays where it is: rewriting posted ledger entries would violate the
-- append-only guarantee that makes the ledger auditable in the first place. A sandbox with
-- pre-existing faucet balances will therefore still report a shortfall until it is reseeded —
-- correct behaviour, since from the ledger's point of view that value really was booked as
-- having crossed the platform boundary.

ALTER TABLE balances DROP CONSTRAINT balances_non_negative;

ALTER TABLE balances
  ADD CONSTRAINT balances_non_negative
  CHECK (type IN ('EXTERNAL', 'SANDBOX_MINT') OR amount >= 0);
