-- Deposit tracking: scan cursor, address-index allocator, and the on-chain fields a detected
-- transfer carries.
--
-- SAFE AS NOT NULL ADDS WITHOUT DEFAULTS on `deposits`: the table is empty in every
-- environment — no deposit has ever been recorded, since detection is being introduced in this
-- same change. Replaying this against a database that somehow holds rows fails loudly rather
-- than inventing a block number, which is the correct outcome for financial data.
--
-- The unique index on (chainId, txHash, logIndex) is the important one: it is the natural key
-- of an on-chain transfer, so a watcher that rescans a block range — after a restart, a
-- reorg-driven rewind, or an overlapping scan window — physically cannot credit the same
-- deposit twice.

-- AlterTable
ALTER TABLE "chains" ADD COLUMN     "lastScannedBlock" BIGINT,
ADD COLUMN     "nextDerivationIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "blockNumber" BIGINT NOT NULL,
ADD COLUMN     "confirmations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fromAddress" TEXT,
ADD COLUMN     "logIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "toAddress" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_chainId_txHash_logIndex_key" ON "deposits"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_addresses_chainId_derivationIndex_key" ON "wallet_addresses"("chainId", "derivationIndex");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_addresses_userId_chainId_key" ON "wallet_addresses"("userId", "chainId");

