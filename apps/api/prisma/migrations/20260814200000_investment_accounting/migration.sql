-- CreateEnum
CREATE TYPE "StrategyCustodyModel" AS ENUM ('POOLED_NAV', 'SEGREGATED_COPY');

-- CreateEnum
CREATE TYPE "StrategyStatus" AS ENUM ('DRAFT', 'BACKTESTED', 'OPEN', 'SOFT_CLOSED', 'PAUSED', 'WINDING_DOWN', 'CLOSED');

-- CreateEnum
CREATE TYPE "DealingFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('PENDING', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeeAccrualKind" AS ENUM ('MANAGEMENT', 'PERFORMANCE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerAccountType" ADD VALUE 'PENDING_SUBSCRIPTION';
ALTER TYPE "LedgerAccountType" ADD VALUE 'STRATEGY_POOL';
ALTER TYPE "LedgerAccountType" ADD VALUE 'PLATFORM_TREASURY';
ALTER TYPE "LedgerAccountType" ADD VALUE 'PLATFORM_REVENUE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerTransactionType" ADD VALUE 'SUBSCRIPTION_SETTLEMENT';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'REDEMPTION_SETTLEMENT';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'FEE_CRYSTALLISATION';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TRADING_FEE';

-- AlterTable
ALTER TABLE "ledger_accounts" ADD COLUMN     "strategyId" TEXT;

-- CreateTable
CREATE TABLE "investment_strategies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thesis" TEXT,
    "custodyModel" "StrategyCustodyModel" NOT NULL DEFAULT 'POOLED_NAV',
    "status" "StrategyStatus" NOT NULL DEFAULT 'DRAFT',
    "baseAssetId" TEXT NOT NULL,
    "tradingStrategyId" TEXT,
    "minimumInvestment" DECIMAL(36,18) NOT NULL,
    "maximumInvestment" DECIMAL(36,18),
    "lockupDays" INTEGER NOT NULL DEFAULT 0,
    "redemptionNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "dealingFrequency" "DealingFrequency" NOT NULL DEFAULT 'DAILY',
    "mgmtFeeBps" INTEGER NOT NULL DEFAULT 0,
    "perfFeeBps" INTEGER NOT NULL DEFAULT 5000,
    "maxDrawdownBps" INTEGER NOT NULL DEFAULT 1000,
    "maxAssetExposureBps" INTEGER NOT NULL DEFAULT 10000,
    "maxLeverageBps" INTEGER NOT NULL DEFAULT 10000,
    "dailyLossLimitBps" INTEGER,
    "benchmarkSymbol" TEXT,
    "totalUnits" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "investment_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_positions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "units" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "costBasis" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "hwmUnitPrice" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "accruedMgmtFee" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "accruedPerfFee" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nav_snapshots" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "struckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poolNav" DECIMAL(36,18) NOT NULL,
    "totalUnits" DECIMAL(36,18) NOT NULL,
    "navPerUnit" DECIMAL(36,18) NOT NULL,
    "cashComponent" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "positionComponent" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "markSource" TEXT NOT NULL,
    "isDealingPoint" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "nav_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "settledSnapshotId" TEXT,
    "unitsIssued" DECIMAL(36,18),
    "acceptanceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_accruals" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "kind" "FeeAccrualKind" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "baseAmount" DECIMAL(36,18) NOT NULL,
    "hwmUnitPrice" DECIMAL(36,18),
    "navPerUnit" DECIMAL(36,18),
    "amount" DECIMAL(36,18) NOT NULL,
    "crystallisedAt" TIMESTAMP(3),
    "crystallisedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_strategies_slug_key" ON "investment_strategies"("slug");

-- CreateIndex
CREATE INDEX "investment_strategies_status_idx" ON "investment_strategies"("status");

-- CreateIndex
CREATE INDEX "investment_positions_strategyId_idx" ON "investment_positions"("strategyId");

-- CreateIndex
CREATE UNIQUE INDEX "investment_positions_userId_strategyId_key" ON "investment_positions"("userId", "strategyId");

-- CreateIndex
CREATE INDEX "nav_snapshots_strategyId_isDealingPoint_idx" ON "nav_snapshots"("strategyId", "isDealingPoint");

-- CreateIndex
CREATE UNIQUE INDEX "nav_snapshots_strategyId_struckAt_key" ON "nav_snapshots"("strategyId", "struckAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_requests_idempotencyKey_key" ON "subscription_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "subscription_requests_strategyId_status_idx" ON "subscription_requests"("strategyId", "status");

-- CreateIndex
CREATE INDEX "subscription_requests_userId_idx" ON "subscription_requests"("userId");

-- CreateIndex
CREATE INDEX "fee_accruals_positionId_kind_idx" ON "fee_accruals"("positionId", "kind");

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_strategies" ADD CONSTRAINT "investment_strategies_baseAssetId_fkey" FOREIGN KEY ("baseAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_strategies" ADD CONSTRAINT "investment_strategies_tradingStrategyId_fkey" FOREIGN KEY ("tradingStrategyId") REFERENCES "trading_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_positions" ADD CONSTRAINT "investment_positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_positions" ADD CONSTRAINT "investment_positions_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nav_snapshots" ADD CONSTRAINT "nav_snapshots_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_accruals" ADD CONSTRAINT "fee_accruals_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "investment_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

