-- MVP18 — Manager Trading Terminal (docs/09-roadmap.md).
--
-- Hand-trimmed from `prisma migrate diff`'s output: the raw diff also proposed dropping
-- `market_candles_open_time_brin` (a hand-written BRIN index from an earlier migration that
-- schema.prisma has no DSL for — pre-existing, unrelated drift) and renaming several indexes on
-- `feature_vectors`/`macro_observations` that already exist correctly under their current names.
-- None of that belongs to this migration, so it is excluded. Only the two new tables below are
-- this milestone's change.

-- AlterEnum
-- Added here, used only in a later migration (20260819235600): PostgreSQL will not let a
-- newly-added enum value be used inside the same transaction that adds it, and Prisma runs each
-- migration file in its own transaction (CLAUDE.md §3).
ALTER TYPE "LedgerAccountType" ADD VALUE 'SANDBOX_TRADE_EXECUTION';

-- CreateEnum
CREATE TYPE "StrategyAssignmentRole" AS ENUM ('MANAGER', 'TRADER');

-- CreateEnum
CREATE TYPE "StrategyOrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP');

-- CreateEnum
CREATE TYPE "StrategyOrderStatus" AS ENUM ('PENDING', 'FILLED', 'CANCELLED', 'REJECTED');

-- CreateTable
CREATE TABLE "strategy_assignments" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StrategyAssignmentRole" NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "strategy_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_orders" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "placedByUserId" TEXT NOT NULL,
    "fromAssetId" TEXT NOT NULL,
    "toAssetId" TEXT NOT NULL,
    "type" "StrategyOrderType" NOT NULL,
    "status" "StrategyOrderStatus" NOT NULL DEFAULT 'PENDING',
    "fromQuantity" DECIMAL(36,18) NOT NULL,
    "triggerPrice" DECIMAL(36,18),
    "filledRate" DECIMAL(36,18),
    "toQuantity" DECIMAL(36,18),
    "ledgerTransactionId" TEXT,
    "rejectionReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "strategy_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategy_assignments_userId_idx" ON "strategy_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_assignments_strategyId_userId_key" ON "strategy_assignments"("strategyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_orders_idempotencyKey_key" ON "strategy_orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "strategy_orders_strategyId_status_idx" ON "strategy_orders"("strategyId", "status");

-- CreateIndex
CREATE INDEX "strategy_orders_status_type_idx" ON "strategy_orders"("status", "type");

-- AddForeignKey
ALTER TABLE "strategy_assignments" ADD CONSTRAINT "strategy_assignments_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_assignments" ADD CONSTRAINT "strategy_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_orders" ADD CONSTRAINT "strategy_orders_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_orders" ADD CONSTRAINT "strategy_orders_placedByUserId_fkey" FOREIGN KEY ("placedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_orders" ADD CONSTRAINT "strategy_orders_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_orders" ADD CONSTRAINT "strategy_orders_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
