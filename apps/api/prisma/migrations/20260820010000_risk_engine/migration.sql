-- MVP19 — Risk Engine (docs/09-roadmap.md, docs/12 §8-9).
--
-- Hand-trimmed from `prisma migrate diff`'s raw output: it also proposed dropping
-- `market_candles_open_time_brin` and renaming indexes on `feature_vectors`/`macro_observations`
-- that already exist correctly under their current names — pre-existing drift unrelated to this
-- migration (see 20260819235500_manager_trading_terminal's own migration.sql for the same note).
-- None of that belongs here.

-- CreateEnum
CREATE TYPE "RiskLimitField" AS ENUM ('MAX_DRAWDOWN_BPS', 'MAX_ASSET_EXPOSURE_BPS', 'MAX_LEVERAGE_BPS', 'DAILY_LOSS_LIMIT_BPS');

-- CreateEnum
CREATE TYPE "RiskLimitChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- Not used by any statement below, so — unlike the LedgerAccountType split in
-- 20260819235500/20260819235600 — this is safe as one migration even when batch-applied
-- alongside others in a single `prisma migrate deploy` run.
ALTER TYPE "RiskEventType" ADD VALUE 'STRATEGY_CIRCUIT_BREAKER';
ALTER TYPE "RiskEventType" ADD VALUE 'STRATEGY_RISK_LIMIT_BREACH';

-- AlterEnum
ALTER TYPE "StrategyStatus" ADD VALUE 'CIRCUIT_BROKEN';

-- CreateTable
CREATE TABLE "strategy_allowed_assets" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_allowed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_limit_change_requests" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "field" "RiskLimitField" NOT NULL,
    "oldValue" INTEGER NOT NULL,
    "newValue" INTEGER NOT NULL,
    "status" "RiskLimitChangeStatus" NOT NULL DEFAULT 'PENDING',
    "proposedByUserId" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "risk_limit_change_requests_pkey" PRIMARY KEY ("id"),
    -- Dual control (docs/12 §8): "a single compromised account cannot widen its own limits."
    -- Enforced here, not only in RiskLimitsService.approve, so the guarantee holds regardless of
    -- which code path writes.
    CONSTRAINT "risk_limit_change_requests_approver_differs_from_proposer" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" != "proposedByUserId")
);

-- CreateTable
CREATE TABLE "emergency_controls" (
    "key" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "emergency_controls_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "strategy_allowed_assets_strategyId_assetId_key" ON "strategy_allowed_assets"("strategyId", "assetId");

-- CreateIndex
CREATE INDEX "risk_limit_change_requests_strategyId_status_idx" ON "risk_limit_change_requests"("strategyId", "status");

-- AddForeignKey
ALTER TABLE "strategy_allowed_assets" ADD CONSTRAINT "strategy_allowed_assets_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_allowed_assets" ADD CONSTRAINT "strategy_allowed_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_limit_change_requests" ADD CONSTRAINT "risk_limit_change_requests_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
