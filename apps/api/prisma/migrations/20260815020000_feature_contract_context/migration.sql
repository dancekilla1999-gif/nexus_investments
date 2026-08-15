-- The feature contract must fully determine the computation (roadmap MVP33).
--
-- `featureSetVersion` named the anchor and context sets, but nothing recorded *which* context
-- timeframes were actually folded in, so recomputation fell back to the default set. On a vector
-- computed with no context that adds several hundred all-null columns and a different hash — and
-- the skew check reported skew where none existed. A verification that cries wolf is worse than
-- no verification, because the first real finding then gets waved through.
--
-- Found by the milestone's own acceptance test, which is the point of having one.

ALTER TABLE "feature_vectors"
  ADD COLUMN "contextTimeframes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
