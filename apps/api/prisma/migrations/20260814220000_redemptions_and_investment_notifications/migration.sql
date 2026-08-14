-- CreateEnum
CREATE TYPE "RedemptionRequestStatus" AS ENUM ('PENDING', 'SETTLED', 'QUEUED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INVESTMENT';

-- CreateTable
CREATE TABLE "redemption_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "units" DECIMAL(36,18) NOT NULL,
    "status" "RedemptionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "eligibleFrom" TIMESTAMP(3) NOT NULL,
    "settledSnapshotId" TEXT,
    "grossAmount" DECIMAL(36,18),
    "feesCharged" DECIMAL(36,18),
    "netAmount" DECIMAL(36,18),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "redemption_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "redemption_requests_idempotencyKey_key" ON "redemption_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "redemption_requests_strategyId_status_idx" ON "redemption_requests"("strategyId", "status");

-- CreateIndex
CREATE INDEX "redemption_requests_userId_idx" ON "redemption_requests"("userId");

-- AddForeignKey
ALTER TABLE "redemption_requests" ADD CONSTRAINT "redemption_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_requests" ADD CONSTRAINT "redemption_requests_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "investment_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

