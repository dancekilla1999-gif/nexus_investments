-- Add the sandbox faucet's own contra-account type.
--
-- Faucet mints previously debited EXTERNAL, the same boundary account that represents real
-- custody. That made custody reconciliation compare a sandbox's play balances against real
-- on-chain holdings and report a permanent shortfall. Separating them keeps the platform's
-- stated obligation to its users backed by assets that actually exist.
--
-- The constraint that exempts this type from the non-negative rule lives in the NEXT migration:
-- PostgreSQL will not allow a newly-added enum value to be used in the same transaction that
-- adds it, and Prisma runs each migration file in its own transaction.

ALTER TYPE "LedgerAccountType" ADD VALUE 'SANDBOX_MINT';
