-- Scope the personal-account uniqueness rule to accounts that are actually personal.
--
-- `ledger_accounts_personal_unique` (migration 20260814091830) enforces one ledger account per
-- (userId, assetId, type) wherever managedAccountId IS NULL. That was exactly right when every
-- such row was somebody's own balance bucket: two "available USDC" accounts for one user would
-- silently split their balance in half.
--
-- STRATEGY_POOL accounts break the assumption. They are held under the platform system user
-- (ownership is carried by `type` + `strategyId`, not by userId — see docs/12 §1), and every
-- strategy needs its own pool account for the same asset. Under the old index the second
-- strategy to hold USDC would be rejected, which is a real bug: it caps the platform at one
-- strategy per asset.
--
-- Pool accounts have their own, stricter uniqueness — one per (strategyId, assetId), added in
-- 20260814200100_ownership_boundary — so narrowing this index removes nothing.
--
-- Found by a test that created a second strategy and tried to give it a pool.

DROP INDEX ledger_accounts_personal_unique;

CREATE UNIQUE INDEX ledger_accounts_personal_unique
  ON ledger_accounts ("userId", "assetId", type)
  WHERE "managedAccountId" IS NULL
    AND "strategyId" IS NULL
    AND type <> 'STRATEGY_POOL';
