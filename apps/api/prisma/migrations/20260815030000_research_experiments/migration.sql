-- The trial counter (docs/18 §3.3, roadmap MVP34).
--
-- Try five hundred configurations and the best looks excellent by chance. Every individual step
-- was honest; the selection across them was not. The deflated Sharpe corrects for this, and it
-- needs the number of trials actually run — which is why the harness owns the count and the
-- researcher cannot reset it by opening a new notebook.

CREATE TABLE "research_experiments" (
  "id"              TEXT NOT NULL,
  "scope"           TEXT NOT NULL,
  "symbol"          TEXT NOT NULL,
  "timeframe"       TEXT NOT NULL,
  "labelDefinition" TEXT NOT NULL,
  "config"          JSONB NOT NULL,
  "auc"             DOUBLE PRECISION,
  "sharpe"          DOUBLE PRECISION,
  "controlsPassed"  BOOLEAN NOT NULL DEFAULT false,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "research_experiments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "research_experiments_scope_createdAt_idx"
  ON "research_experiments" ("scope", "createdAt");

-- Append-only. A trial counter that can be decremented is not a trial counter, and deleting a
-- disappointing run is precisely the behaviour the deflated Sharpe exists to price in.
CREATE TRIGGER research_experiments_append_only
  BEFORE UPDATE OR DELETE ON "research_experiments"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
