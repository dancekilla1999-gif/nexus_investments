-- Re-key the balance projection to the ledger account it describes (1:1), instead of to a
-- separate (userId, assetId, type) tuple that could drift from it — see the Balance model's
-- doc comment in schema.prisma for the reasoning.
--
-- SAFE AS A NOT NULL ADD WITHOUT A DEFAULT: `balances` is empty in every environment at this
-- point — the LedgerService that will be the first and only writer to it is being introduced
-- in this same change. Verified empty in dev and test before generating this migration. If
-- this migration is ever replayed against a database that somehow has rows, it will fail
-- loudly rather than invent a ledgerAccountId, which is the correct outcome for financial data.

-- DropIndex
DROP INDEX "balances_userId_assetId_type_key";

-- AlterTable
ALTER TABLE "balances" ADD COLUMN     "ledgerAccountId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "balances_ledgerAccountId_key" ON "balances"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "balances_userId_idx" ON "balances"("userId");

-- AddForeignKey
ALTER TABLE "balances" ADD CONSTRAINT "balances_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
