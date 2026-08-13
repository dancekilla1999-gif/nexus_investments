-- CreateEnum
CREATE TYPE "ManagedAccountStatus" AS ENUM ('PENDING_AGREEMENT', 'ACTIVE', 'CIRCUIT_BROKEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "StrategyKind" AS ENUM ('RULE_BASED', 'ML');

-- CreateEnum
CREATE TYPE "StrategyPromotionStatus" AS ENUM ('BACKTESTING', 'PAPER_TRADING', 'LIVE_ELIGIBLE');

-- CreateEnum
CREATE TYPE "BacktestRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RISK_ALERT';

-- AlterEnum
ALTER TYPE "RiskEventType" ADD VALUE 'MANAGED_ACCOUNT_CIRCUIT_BREAKER';

-- DropIndex
DROP INDEX "ledger_accounts_userId_assetId_type_key";

-- AlterTable
ALTER TABLE "ledger_accounts" ADD COLUMN     "managedAccountId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "managedAccountId" TEXT,
ADD COLUMN     "placedByManagerId" TEXT;

-- CreateTable
CREATE TABLE "risk_disclosure_agreements" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_disclosure_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_disclosure_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "risk_disclosure_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT,
    "status" "ManagedAccountStatus" NOT NULL DEFAULT 'PENDING_AGREEMENT',
    "initialCapital" DECIMAL(36,18) NOT NULL,
    "highWaterMark" DECIMAL(36,18) NOT NULL,
    "maxDrawdownBps" INTEGER NOT NULL DEFAULT 1000,
    "autoFlattenOnBreach" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "managed_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_strategies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "StrategyKind" NOT NULL,
    "configJson" JSONB NOT NULL,
    "promotionStatus" "StrategyPromotionStatus" NOT NULL DEFAULT 'BACKTESTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_runs" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "dateRangeStart" TIMESTAMP(3) NOT NULL,
    "dateRangeEnd" TIMESTAMP(3) NOT NULL,
    "pairUniverseSnapshotJson" JSONB NOT NULL,
    "status" "BacktestRunStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backtest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_results" (
    "id" TEXT NOT NULL,
    "backtestRunId" TEXT NOT NULL,
    "totalTrades" INTEGER NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "avgR" DOUBLE PRECISION NOT NULL,
    "maxDrawdownBps" INTEGER NOT NULL,
    "sharpe" DOUBLE PRECISION,
    "sortino" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backtest_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risk_disclosure_agreements_version_key" ON "risk_disclosure_agreements"("version");

-- CreateIndex
CREATE INDEX "risk_disclosure_acceptances_userId_idx" ON "risk_disclosure_acceptances"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_disclosure_acceptances_userId_agreementId_key" ON "risk_disclosure_acceptances"("userId", "agreementId");

-- CreateIndex
CREATE INDEX "managed_accounts_userId_idx" ON "managed_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "trading_strategies_name_version_key" ON "trading_strategies"("name", "version");

-- CreateIndex
CREATE INDEX "backtest_runs_strategyId_idx" ON "backtest_runs"("strategyId");

-- CreateIndex
CREATE UNIQUE INDEX "backtest_results_backtestRunId_key" ON "backtest_results"("backtestRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_userId_managedAccountId_assetId_type_key" ON "ledger_accounts"("userId", "managedAccountId", "assetId", "type");

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_managedAccountId_fkey" FOREIGN KEY ("managedAccountId") REFERENCES "managed_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_managedAccountId_fkey" FOREIGN KEY ("managedAccountId") REFERENCES "managed_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_disclosure_acceptances" ADD CONSTRAINT "risk_disclosure_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_disclosure_acceptances" ADD CONSTRAINT "risk_disclosure_acceptances_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "risk_disclosure_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_accounts" ADD CONSTRAINT "managed_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_accounts" ADD CONSTRAINT "managed_accounts_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "trading_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_runs" ADD CONSTRAINT "backtest_runs_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "trading_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_results" ADD CONSTRAINT "backtest_results_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "backtest_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

