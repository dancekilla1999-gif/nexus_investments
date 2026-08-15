-- Recorded feature vectors — the artefact that makes the train/serve skew invariant testable
-- (docs/17 §3.4, roadmap MVP33).
--
-- The claim being tested is that recomputing a historical instant offline reproduces exactly what
-- the live path computed at the time. That is only checkable if the live path's output was
-- written down and cannot be edited afterwards, so this table is append-only like every other
-- historical record in the platform.

CREATE TABLE "feature_vectors" (
  "id"                TEXT NOT NULL,
  "symbol"            TEXT NOT NULL,
  "timeframe"         TEXT NOT NULL,
  "asOf"              TIMESTAMP(3) NOT NULL,
  "barOpenTime"       TIMESTAMP(3) NOT NULL,
  "featureSetVersion" TEXT NOT NULL,
  "values"            JSONB NOT NULL,
  "missing"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "hash"              TEXT NOT NULL,
  "computedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "feature_vectors_pkey" PRIMARY KEY ("id")
);

-- One vector per (symbol, timeframe, instant, contract). Recomputing the same instant under the
-- same feature contract must not create a second row — if the value differed, that is precisely
-- the skew this table exists to detect, and it should surface as a comparison failure rather
-- than as two rows nobody notices.
CREATE UNIQUE INDEX "feature_vectors_identity_key"
  ON "feature_vectors" ("symbol", "timeframe", "asOf", "featureSetVersion");

CREATE INDEX "feature_vectors_symbol_timeframe_bar_idx"
  ON "feature_vectors" ("symbol", "timeframe", "barOpenTime");

-- The hash must be a 64-character hex digest. A truncated or absent hash would make the
-- comparison silently pass.
ALTER TABLE "feature_vectors"
  ADD CONSTRAINT "feature_vectors_hash_shape"
  CHECK ("hash" ~ '^[0-9a-f]{64}$');

CREATE TRIGGER feature_vectors_append_only
  BEFORE UPDATE OR DELETE ON "feature_vectors"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
