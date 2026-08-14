-- The ownership boundary: what makes "an administrator cannot take user funds" a property of
-- the system rather than a promise in a document (docs/12 §1.1, docs/14).
--
-- Separate from the migration that adds the enum values because PostgreSQL will not allow a
-- newly-added enum value to be *used* in the same transaction that adds it, and Prisma runs
-- each migration file in its own transaction.
--
-- The rule:
--
--   A ledger transaction may not place a user-owned or pool-owned account on one side and a
--   platform-owned account on the other, unless its type is one of a short, named list whose
--   amounts are computed by the fee engine from configured rates.
--
-- Why a trigger and not a service check: application code can be changed by anyone who can
-- merge a commit. A migration is a visible, reviewable artefact, and the constraint keeps
-- holding even if the application layer is compromised or bypassed entirely.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. The boundary
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assert_ownership_boundary() RETURNS TRIGGER AS $$
DECLARE
  tx_type TEXT;
  touches_investor BOOLEAN;
  touches_platform BOOLEAN;
BEGIN
  SELECT lt.type::TEXT INTO tx_type
    FROM ledger_transactions lt
   WHERE lt.id = NEW."ledgerTransactionId";

  -- Permitted crossings. Each has its amount produced by the fee engine or a venue report,
  -- never by an operator typing a number:
  --   FEE_CRYSTALLISATION  accrued management/performance fee, pool → platform revenue
  --   TRADING_FEE          venue/execution fee on a fill
  --   FEE                  disclosed platform fee (e.g. a subscription plan charge)
  --   REFERRAL_COMMISSION  platform → user; the platform spending its own money, not taking
  IF tx_type IN ('FEE_CRYSTALLISATION', 'TRADING_FEE', 'FEE', 'REFERRAL_COMMISSION') THEN
    RETURN NULL;
  END IF;

  SELECT
    bool_or(la.type IN (
      'AVAILABLE', 'TRADING', 'LOCKED', 'FUNDING', 'BONUS', 'PENDING',
      'PENDING_SUBSCRIPTION', 'STRATEGY_POOL'
    )),
    bool_or(la.type IN ('PLATFORM_TREASURY', 'PLATFORM_REVENUE'))
    INTO touches_investor, touches_platform
    FROM ledger_entries le
    JOIN ledger_accounts la ON la.id = le."ledgerAccountId"
   WHERE le."ledgerTransactionId" = NEW."ledgerTransactionId";

  IF touches_investor AND touches_platform THEN
    RAISE EXCEPTION
      'Ledger transaction % (type %) moves value between investor-owned and platform-owned accounts. Only FEE_CRYSTALLISATION, TRADING_FEE, FEE and REFERRAL_COMMISSION may cross that boundary.',
      NEW."ledgerTransactionId", tx_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Deferred to COMMIT for the same reason as the balance trigger: a transaction is legitimately
-- half-written while its entries are being inserted, and only has to be legal once complete.
CREATE CONSTRAINT TRIGGER ledger_entries_respect_ownership_boundary
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_ownership_boundary();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Pool and platform accounts carry no per-user ownership
-- ─────────────────────────────────────────────────────────────────────────
--
-- A STRATEGY_POOL account is owned by the strategy's investors collectively, so it must be
-- bound to a strategy and must never be mistaken for someone's personal balance. The reverse
-- also has to hold: a user bucket must not carry a strategyId, or "whose money is this?" would
-- have two contradictory answers on the same row.

ALTER TABLE ledger_accounts
  ADD CONSTRAINT ledger_accounts_pool_requires_strategy
  CHECK (
    (type = 'STRATEGY_POOL' AND "strategyId" IS NOT NULL)
    OR (type <> 'STRATEGY_POOL' AND "strategyId" IS NULL)
  );

-- One pool account per (strategy, asset). Two would let the same pool's holdings of one asset
-- be split across rows, and a reconciliation that reads only one of them would report a
-- shortfall that is not real — or miss one that is.
CREATE UNIQUE INDEX ledger_accounts_pool_unique
  ON ledger_accounts ("strategyId", "assetId")
  WHERE type = 'STRATEGY_POOL';

-- Likewise one platform account per (type, asset).
CREATE UNIQUE INDEX ledger_accounts_platform_unique
  ON ledger_accounts (type, "assetId")
  WHERE type IN ('PLATFORM_TREASURY', 'PLATFORM_REVENUE');

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Economic terms cannot be set outside their documented bounds
-- ─────────────────────────────────────────────────────────────────────────
--
-- These mirror service-layer validation rather than replacing it: the service gives a good
-- error message, the constraint makes the rule true regardless of which code path writes.

-- 50% profit share is the platform's model (docs/12 §6.0). The ceiling exists so a typo cannot
-- turn a 50% share into a 500% one.
ALTER TABLE investment_strategies
  ADD CONSTRAINT investment_strategies_perf_fee_range
  CHECK ("perfFeeBps" >= 0 AND "perfFeeBps" <= 5000);

ALTER TABLE investment_strategies
  ADD CONSTRAINT investment_strategies_mgmt_fee_range
  CHECK ("mgmtFeeBps" >= 0 AND "mgmtFeeBps" <= 1000);

-- The hard 10% drawdown ceiling. Load-bearing under a 50% profit share, because the manager
-- takes half the upside and none of the downside (docs/12 §6.0) — so it is enforced here too,
-- not only in the service layer.
ALTER TABLE investment_strategies
  ADD CONSTRAINT investment_strategies_max_drawdown_ceiling
  CHECK ("maxDrawdownBps" > 0 AND "maxDrawdownBps" <= 1000);

-- Units and money cannot be negative.
ALTER TABLE investment_strategies
  ADD CONSTRAINT investment_strategies_total_units_non_negative
  CHECK ("totalUnits" >= 0);

ALTER TABLE investment_positions
  ADD CONSTRAINT investment_positions_non_negative
  CHECK (
    units >= 0 AND "costBasis" >= 0 AND "hwmUnitPrice" >= 0
    AND "accruedMgmtFee" >= 0 AND "accruedPerfFee" >= 0
  );

ALTER TABLE nav_snapshots
  ADD CONSTRAINT nav_snapshots_non_negative
  CHECK ("poolNav" >= 0 AND "totalUnits" >= 0 AND "navPerUnit" >= 0);

ALTER TABLE subscription_requests
  ADD CONSTRAINT subscription_requests_amount_positive
  CHECK (amount > 0);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Valuation and fee history are append-only
-- ─────────────────────────────────────────────────────────────────────────
--
-- Same convention as ledger_entries and audit_logs (docs/03 §5). An investor's performance
-- history and the arithmetic behind every fee they were charged must not be editable after the
-- fact — including by a superadmin. `nav_snapshots` additionally means no code path can write
-- navPerUnit twice for the same instant and quietly change what an investor was shown.

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted. Corrections are new rows, never edits.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nav_snapshots_append_only
  BEFORE UPDATE OR DELETE ON nav_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- fee_accruals permits exactly one field to change after insert: the crystallisation stamp.
-- Everything the investor could audit — rate, base, HWM, amount — is frozen at accrual time.
CREATE OR REPLACE FUNCTION assert_fee_accrual_immutable() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fee_accruals is append-only; DELETE is not permitted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."positionId" IS DISTINCT FROM OLD."positionId"
     OR NEW.kind        IS DISTINCT FROM OLD.kind
     OR NEW."periodStart" IS DISTINCT FROM OLD."periodStart"
     OR NEW."periodEnd"   IS DISTINCT FROM OLD."periodEnd"
     OR NEW."rateBps"     IS DISTINCT FROM OLD."rateBps"
     OR NEW."baseAmount"  IS DISTINCT FROM OLD."baseAmount"
     OR NEW."hwmUnitPrice" IS DISTINCT FROM OLD."hwmUnitPrice"
     OR NEW."navPerUnit"   IS DISTINCT FROM OLD."navPerUnit"
     OR NEW.amount         IS DISTINCT FROM OLD.amount
     OR NEW."createdAt"    IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION
      'fee_accruals: only the crystallisation stamp may change after insert. The rate, base, high water mark and amount an investor was charged are frozen at accrual time.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Crystallisation happens once.
  IF OLD."crystallisedAt" IS NOT NULL AND NEW."crystallisedAt" IS DISTINCT FROM OLD."crystallisedAt" THEN
    RAISE EXCEPTION 'fee_accrual % is already crystallised.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fee_accruals_immutable
  BEFORE UPDATE OR DELETE ON fee_accruals
  FOR EACH ROW EXECUTE FUNCTION assert_fee_accrual_immutable();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. The high water mark ratchets
-- ─────────────────────────────────────────────────────────────────────────
--
-- Lowering an HWM is indistinguishable from charging an investor twice for the same
-- performance. Under a 50% profit share it would take half of a gain they have already paid
-- for. There is no administrative path to do it, and now no SQL path either.

CREATE OR REPLACE FUNCTION assert_hwm_ratchets() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."hwmUnitPrice" < OLD."hwmUnitPrice" THEN
    RAISE EXCEPTION
      'investment_positions.hwmUnitPrice may not decrease (% -> %). Lowering a high water mark charges the investor twice for the same performance.',
      OLD."hwmUnitPrice", NEW."hwmUnitPrice"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER investment_positions_hwm_ratchets
  BEFORE UPDATE ON investment_positions
  FOR EACH ROW EXECUTE FUNCTION assert_hwm_ratchets();
