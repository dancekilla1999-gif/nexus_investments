-- Ledger integrity, enforced by the database rather than only by application code.
--
-- docs/03-database-architecture.md §1 and §5 describe these guarantees; this migration is
-- where they stop being conventions and become constraints. The point is that an application
-- bug, a bad migration, or a careless `prisma.ledgerEntry.create()` somewhere in a future
-- module CANNOT produce money out of nothing or quietly rewrite financial history — the
-- database refuses the write.
--
-- Written as raw SQL because none of this is expressible in Prisma's schema DSL (deferred
-- constraint triggers, partial unique indexes, statement-level guards).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Every ledger transaction must sum to zero, per asset.
-- ─────────────────────────────────────────────────────────────────────────
--
-- This is THE double-entry invariant. It is a CONSTRAINT TRIGGER, DEFERRABLE INITIALLY
-- DEFERRED, so it evaluates at COMMIT rather than after each row — a transaction is legitimately
-- unbalanced in the middle of inserting its entries, and only has to balance once complete.
-- A plain CHECK constraint cannot express this (it can only see one row at a time).
--
-- Grouped by asset because a single ledger transaction may legitimately move two different
-- assets (a trade: -100 USDT on one side, +0.002 BTC on the other). Each asset must balance
-- independently; summing across assets would be meaningless.

CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced() RETURNS TRIGGER AS $$
DECLARE
  offending_asset TEXT;
  offending_total NUMERIC;
BEGIN
  SELECT la."assetId", SUM(le.amount)
    INTO offending_asset, offending_total
  FROM ledger_entries le
  JOIN ledger_accounts la ON la.id = le."ledgerAccountId"
  WHERE le."ledgerTransactionId" = NEW."ledgerTransactionId"
  GROUP BY la."assetId"
  HAVING SUM(le.amount) <> 0
  LIMIT 1;

  IF offending_asset IS NOT NULL THEN
    RAISE EXCEPTION
      'Unbalanced ledger transaction %: asset % sums to % (must be 0)',
      NEW."ledgerTransactionId", offending_asset, offending_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entries_must_balance
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_ledger_transaction_balanced();

-- A transaction with no entries at all is also invalid — it would trivially "balance" by
-- virtue of being empty, and the trigger above never fires for it (no rows inserted).
CREATE OR REPLACE FUNCTION assert_ledger_transaction_has_entries() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ledger_entries WHERE "ledgerTransactionId" = NEW.id
  ) THEN
    RAISE EXCEPTION 'Ledger transaction % has no entries', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_transactions_must_have_entries
  AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_ledger_transaction_has_entries();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Append-only enforcement for financial history.
-- ─────────────────────────────────────────────────────────────────────────
--
-- docs/03-database-architecture.md §5: corrections are made by inserting a compensating
-- entry, never by editing history. The service layer has no update/delete methods for these
-- tables; this makes that structural instead of merely conventional.
--
-- A production deployment should ALSO run the application under a role without UPDATE/DELETE
-- on these tables (defense in depth — a superuser connection could disable a trigger, it
-- cannot grant itself privileges it was never given). These triggers are the portion that
-- travels with the schema and therefore cannot be forgotten during environment setup.

CREATE OR REPLACE FUNCTION reject_mutation_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Table % is append-only: % is not permitted. Insert a compensating record instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_mutation_append_only();

CREATE TRIGGER ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_mutation_append_only();

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation_append_only();

CREATE TRIGGER risk_disclosure_acceptances_append_only
  BEFORE UPDATE OR DELETE ON risk_disclosure_acceptances
  FOR EACH ROW EXECUTE FUNCTION reject_mutation_append_only();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. One ledger account per (user, asset, type) — including personal accounts.
-- ─────────────────────────────────────────────────────────────────────────
--
-- Closes the gap documented in schema.prisma's LedgerAccount model: Postgres treats NULLs as
-- distinct in a unique index, so the Prisma-declared
-- @@unique([userId, managedAccountId, assetId, type]) does NOT stop two personal ledger
-- accounts (managedAccountId IS NULL) of the same kind from existing. Two "available USDT"
-- accounts for one user would silently split their balance in half. A partial unique index —
-- not expressible in Prisma's DSL — is the fix.

CREATE UNIQUE INDEX ledger_accounts_personal_unique
  ON ledger_accounts ("userId", "assetId", type)
  WHERE "managedAccountId" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Balances are never negative.
-- ─────────────────────────────────────────────────────────────────────────
--
-- The LedgerService checks available funds under a row lock before posting, so this should be
-- unreachable. That is exactly why it is worth having: if it ever fires, a concurrency bug
-- exists in the service layer, and the platform finds out by refusing the write rather than
-- by silently letting a user spend money they do not have.

ALTER TABLE balances
  ADD CONSTRAINT balances_non_negative CHECK (amount >= 0);
