import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Wipes all per-test data while respecting the append-only constraints.
 *
 * `ledger_entries`, `ledger_transactions`, `audit_logs`, and `risk_disclosure_acceptances`
 * reject DELETE by trigger (migration 20260814091830_ledger_integrity_constraints) — that is
 * the point of them. Row-level triggers do not fire on TRUNCATE, which is the standard and
 * intended escape hatch for resetting append-only tables in a test database.
 *
 * Reference data (chains, assets, subscription plans, risk disclosure agreements) is
 * deliberately NOT cleared: it is seeded once and shared, and recreating it per test would be
 * both slow and a source of cross-suite interference.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE
      balances,
      ledger_entries,
      ledger_transactions,
      ledger_accounts,
      fee_accruals,
      nav_snapshots,
      investment_positions,
      subscription_requests,
      investment_strategies,
      audit_logs,
      risk_disclosure_acceptances,
      notifications,
      backup_codes,
      refresh_sessions,
      devices,
      referrals,
      api_keys,
      profiles,
      users
    CASCADE
  `);
}
