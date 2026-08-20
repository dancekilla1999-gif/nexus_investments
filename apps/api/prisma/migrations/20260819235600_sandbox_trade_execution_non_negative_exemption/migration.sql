-- Exempt SANDBOX_TRADE_EXECUTION from the non-negative balance rule, alongside EXTERNAL and
-- SANDBOX_MINT.
--
-- It is a contra-account like the other two: the Manager Trading Terminal's simulated fills
-- (MVP18 — no real ExecutionVenue exists until MVP22) debit it on one leg and credit it on the
-- mirror leg, so its balance is negative by construction. The invariant this constraint actually
-- protects is that a *user* (or a strategy pool) can never hold less than zero of an asset.

ALTER TABLE balances DROP CONSTRAINT balances_non_negative;

ALTER TABLE balances
  ADD CONSTRAINT balances_non_negative
  CHECK (type IN ('EXTERNAL', 'SANDBOX_MINT', 'SANDBOX_TRADE_EXECUTION') OR amount >= 0);
