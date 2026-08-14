-- Per-asset mark provenance on every valuation.
--
-- Records what was held, at what price, from which provider, and when that provider observed
-- it. Without this a historical NAV is an assertion nobody can check: "the pool was worth X"
-- with no way to ask where X came from. With it, any past valuation can be re-derived and
-- challenged — which is what makes a performance fee computed from it defensible.
--
-- Nullable because snapshots predating this column exist and must not be rewritten; the table
-- is append-only by trigger, and backfilling a provenance we do not actually have would be
-- inventing an audit trail.

ALTER TABLE "nav_snapshots" ADD COLUMN "marks" JSONB;
