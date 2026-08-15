-- The AI data platform's storage layer (docs/17 §2).
--
-- One idea runs through all of it: **you may only query what you could have known.** Every
-- record carries when the thing happened and when we first could have seen it, and the
-- constraints below make the impossible row unstorable rather than merely discouraged.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Replace the unused placeholder candle table
-- ─────────────────────────────────────────────────────────────────────────
--
-- `market_data` was declared in the original schema and never written to: no source column, no
-- close time, no ingest time. It described a candle you cannot backtest against honestly, so it
-- is replaced rather than migrated. Dropping is safe precisely because nothing ever wrote to it.

DROP TABLE IF EXISTS "market_data";

CREATE TABLE "market_candles" (
  "source"     TEXT NOT NULL,
  "symbol"     TEXT NOT NULL,
  "timeframe"  TEXT NOT NULL,
  "openTime"   TIMESTAMP(3) NOT NULL,
  "closeTime"  TIMESTAMP(3) NOT NULL,
  "open"       DECIMAL(36,18) NOT NULL,
  "high"       DECIMAL(36,18) NOT NULL,
  "low"        DECIMAL(36,18) NOT NULL,
  "close"      DECIMAL(36,18) NOT NULL,
  "volume"     DECIMAL(36,18) NOT NULL,
  "trades"     INTEGER,
  "ingestTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "market_candles_pkey" PRIMARY KEY ("source","symbol","timeframe","openTime")
);

-- **The constraint this whole document exists for.**
--
-- A bar cannot be known before it closes. Storing a row whose ingestTime precedes its closeTime
-- would mean the platform recorded the future, and every point-in-time query built on top would
-- inherit that lie. Enforced here rather than in the ingestion service because a service can be
-- bypassed by a backfill script, and a backfill script written at 2am is exactly how this rule
-- gets broken.
ALTER TABLE "market_candles"
  ADD CONSTRAINT "market_candles_not_known_before_close"
  CHECK ("ingestTime" >= "closeTime");

ALTER TABLE "market_candles"
  ADD CONSTRAINT "market_candles_time_ordered"
  CHECK ("closeTime" > "openTime");

-- OHLC has to be internally coherent. A bar whose high is below its close is corrupt data, and
-- corrupt data that reaches a feature is worse than absent data: it produces a number.
ALTER TABLE "market_candles"
  ADD CONSTRAINT "market_candles_ohlc_coherent"
  CHECK (
    "high" >= "low"
    AND "high" >= "open" AND "high" >= "close"
    AND "low"  <= "open" AND "low"  <= "close"
    AND "open" > 0 AND "high" > 0 AND "low" > 0 AND "close" > 0
    AND "volume" >= 0
  );

-- The point-in-time access path: "everything for this symbol/timeframe knowable as of t".
CREATE INDEX "market_candles_symbol_timeframe_ingestTime_idx"
  ON "market_candles" ("symbol", "timeframe", "ingestTime");

-- BRIN on the time column: candle inserts are naturally time-ordered, so a BRIN index covers
-- range scans over years of history at a tiny fraction of a btree's size.
CREATE INDEX "market_candles_open_time_brin"
  ON "market_candles" USING BRIN ("openTime");

-- Candles are observations, not opinions. A correction arrives as a new source's row or a new
-- observation, never as an edit to a bar a model has already trained on.
CREATE OR REPLACE FUNCTION reject_candle_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'market_candles is append-only. A bar a model has already been trained on must not change underneath it; ingest a corrected observation instead.'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER market_candles_append_only
  BEFORE UPDATE OR DELETE ON "market_candles"
  FOR EACH ROW EXECUTE FUNCTION reject_candle_mutation();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Measured provider reliability
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE "DataProviderTier" AS ENUM ('PRIMARY', 'SECONDARY', 'REFERENCE');

CREATE TABLE "data_provider_status" (
  "id"                TEXT NOT NULL,
  "providerKey"       TEXT NOT NULL,
  "tier"              "DataProviderTier" NOT NULL,
  "category"          TEXT NOT NULL,
  "symbol"            TEXT,
  "reliability"       DECIMAL(5,4) NOT NULL DEFAULT 0,
  "successCount"      INTEGER NOT NULL DEFAULT 0,
  "failureCount"      INTEGER NOT NULL DEFAULT 0,
  "gapCount"          INTEGER NOT NULL DEFAULT 0,
  "disagreementCount" INTEGER NOT NULL DEFAULT 0,
  "lastLatencyMs"     INTEGER,
  "lastSuccessAt"     TIMESTAMP(3),
  "lastFailureAt"     TIMESTAMP(3),
  "lastError"         TEXT,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "data_provider_status_pkey" PRIMARY KEY ("id")
);

-- Postgres treats NULLs as distinct in a unique index, so the provider-wide row (symbol IS NULL)
-- needs its own partial index or two of them could exist and the scores would diverge.
CREATE UNIQUE INDEX "data_provider_status_symbol_unique"
  ON "data_provider_status" ("providerKey", "category", "symbol")
  WHERE "symbol" IS NOT NULL;

CREATE UNIQUE INDEX "data_provider_status_overall_unique"
  ON "data_provider_status" ("providerKey", "category")
  WHERE "symbol" IS NULL;

ALTER TABLE "data_provider_status"
  ADD CONSTRAINT "data_provider_status_reliability_range"
  CHECK ("reliability" >= 0 AND "reliability" <= 1);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Data quality failures
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE "DataQualityFailureKind" AS ENUM (
  'MISSING_CANDLES', 'STALE', 'PRICE_OUTLIER', 'ZERO_VOLUME',
  'PROVIDER_DISAGREEMENT', 'NO_DATA', 'INSUFFICIENT_HISTORY'
);

CREATE TABLE "data_quality_failures" (
  "id"        TEXT NOT NULL,
  "symbol"    TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "kind"      "DataQualityFailureKind" NOT NULL,
  "detail"    TEXT NOT NULL,
  "asOf"      TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "data_quality_failures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_quality_failures_symbol_timeframe_asOf_idx"
  ON "data_quality_failures" ("symbol", "timeframe", "asOf");

-- "Why was there no signal at 14:00?" must have an answer that cannot be rewritten later.
CREATE TRIGGER data_quality_failures_append_only
  BEFORE UPDATE OR DELETE ON "data_quality_failures"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Macro series and their vintages
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "macro_series" (
  "id"         TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "country"    TEXT NOT NULL,
  "unit"       TEXT NOT NULL,
  "importance" INTEGER NOT NULL DEFAULT 2,

  CONSTRAINT "macro_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "macro_series_code_key" ON "macro_series" ("code");

ALTER TABLE "macro_series"
  ADD CONSTRAINT "macro_series_importance_range"
  CHECK ("importance" BETWEEN 1 AND 3);

CREATE TABLE "macro_observations" (
  "id"          TEXT NOT NULL,
  "seriesId"    TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd"   TIMESTAMP(3) NOT NULL,
  "releaseTime" TIMESTAMP(3) NOT NULL,
  "ingestTime"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vintage"     INTEGER NOT NULL DEFAULT 0,
  "actual"      DECIMAL(36,18),
  "consensus"   DECIMAL(36,18),
  "previous"    DECIMAL(36,18),
  "source"      TEXT NOT NULL,

  CONSTRAINT "macro_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "macro_observations_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "macro_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "macro_observations_series_period_vintage_key"
  ON "macro_observations" ("seriesId", "periodStart", "vintage");

CREATE INDEX "macro_observations_seriesId_ingestTime_idx"
  ON "macro_observations" ("seriesId", "ingestTime");

-- Same rule as candles, and for the same reason: a figure cannot be known before it is
-- published. Without this a revision back-filled from a provider's history endpoint would carry
-- today's ingestTime against a release date years ago — which is precisely the shape of the
-- macro-revision leak (docs/17 §2.1) this table exists to prevent.
ALTER TABLE "macro_observations"
  ADD CONSTRAINT "macro_observations_not_known_before_release"
  CHECK ("ingestTime" >= "releaseTime");

ALTER TABLE "macro_observations"
  ADD CONSTRAINT "macro_observations_period_ordered"
  CHECK ("periodEnd" > "periodStart");

ALTER TABLE "macro_observations"
  ADD CONSTRAINT "macro_observations_vintage_non_negative"
  CHECK ("vintage" >= 0);

-- A vintage is a historical fact about what was published. Revisions are new rows.
CREATE TRIGGER macro_observations_append_only
  BEFORE UPDATE OR DELETE ON "macro_observations"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
