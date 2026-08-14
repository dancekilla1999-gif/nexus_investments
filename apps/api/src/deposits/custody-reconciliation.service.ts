import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { LedgerAccountType, Prisma, RiskEventType } from '@prisma/client';
import { BlockchainRegistry } from '../blockchain/blockchain.registry';
import { AppConfigService } from '../config/app-config.service';
import { creditableAssetsOnChain } from './creditable-assets';
import { formatAmount } from '../ledger/amount.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * What the platform *says* it owes, versus what it *has*.
 *
 * The double-entry ledger guarantees internal consistency: every credit has a matching debit and
 * nothing is created from nothing. What it cannot guarantee is that the assets behind those
 * numbers exist. A ledger can be perfectly balanced and completely wrong about reality — a bug
 * that credits a transfer twice, a scanning error, an operator moving funds out of band, or an
 * attacker with database access all produce a *balanced* ledger describing money that is not
 * there. Reconciliation is the only check that closes that gap, so it runs on a schedule and
 * files a risk event rather than a log line when it fails (docs/06-blockchain-architecture.md §6,
 * docs/05-security-architecture.md §7).
 *
 * The comparison, per (chain, asset):
 *
 *   obligation = −(EXTERNAL contra-account balance)   ← what crossed the platform boundary in
 *   custody    = Σ on-chain balance of every deposit address we control
 *
 * A **shortfall** (custody < obligation) means user balances are not fully backed. That is the
 * serious direction and is filed at high severity.
 *
 * A **surplus** (custody > obligation) is expected and usually benign: a transfer that has landed
 * on chain but has not been scanned yet sits in custody without being in the ledger, for exactly
 * one scan interval. It is still recorded — at low severity, above a tolerance — because a
 * persistent surplus means deposits are arriving and *not being credited*, which is a user's
 * money going missing from their point of view even though the platform holds it.
 *
 * Scope note: this reconciles funds sitting at deposit addresses. Once sweeping to cold custody
 * exists (MVP3), swept balances must be added to the custody side or every sweep will look like
 * a shortfall; the sweep destinations are tracked in `wallets` for exactly that reason.
 */
@Injectable()
export class CustodyReconciliationService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CustodyReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BlockchainRegistry,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.reconciliationEnabled) {
      this.logger.log('Custody reconciliation disabled by configuration.');
      return;
    }
    const interval = this.config.reconciliationIntervalMs;
    this.timer = setInterval(() => {
      void this.runAll();
    }, interval);
    this.timer.unref?.();
    this.logger.log(`Custody reconciliation started (every ${interval}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runAll(): Promise<ReconciliationReport[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const reports: ReconciliationReport[] = [];
      for (const chainKey of await this.registry.getConfiguredChainKeys()) {
        try {
          reports.push(...(await this.reconcileChain(chainKey)));
        } catch (err) {
          // A reconciliation that cannot complete is itself worth knowing about, but one
          // unreachable RPC must not stop the other chains from being checked.
          this.logger.error(
            `Reconciliation failed for "${chainKey}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return reports;
    } finally {
      this.running = false;
    }
  }

  /** Reconciles every enabled asset on one chain. Exposed so tests and admins can drive it. */
  async reconcileChain(chainKey: string): Promise<ReconciliationReport[]> {
    const chain = await this.prisma.chain.findUniqueOrThrow({ where: { key: chainKey } });
    const adapter = await this.registry.getAdapter(chainKey);

    const addresses = (
      await this.prisma.walletAddress.findMany({
        where: { chainId: chain.id },
        select: { address: true },
      })
    ).map((a) => a.address);

    // Only assets whose on-chain balance can actually be read. Reconciling a token with no
    // contract address would read the chain's native balance and report it under that token's
    // symbol — a phantom mismatch loud enough to bury a real one.
    const assets = await this.prisma.asset.findMany({
      where: creditableAssetsOnChain(chain.id),
    });

    const reports: ReconciliationReport[] = [];
    for (const asset of assets) {
      const obligation = await this.ledgerObligation(asset.id);

      let custodyBaseUnits = 0n;
      for (const address of addresses) {
        custodyBaseUnits += await adapter.getBalance(address, asset.contractAddress);
      }
      const custody = new Prisma.Decimal(custodyBaseUnits.toString()).dividedBy(
        new Prisma.Decimal(10).pow(asset.decimals),
      );

      const difference = custody.minus(obligation);
      const report: ReconciliationReport = {
        chainKey,
        assetSymbol: asset.symbol,
        obligation: formatAmount(obligation),
        custody: formatAmount(custody),
        difference: formatAmount(difference),
        addressesChecked: addresses.length,
        status: 'MATCHED',
      };

      if (difference.isNegative() && difference.abs().greaterThan(this.tolerance(asset.decimals))) {
        report.status = 'SHORTFALL';
        await this.fileMismatch(report, 5);
      } else if (
        difference.isPositive() &&
        difference.greaterThan(this.tolerance(asset.decimals))
      ) {
        report.status = 'SURPLUS';
        await this.fileMismatch(report, 1);
      }

      reports.push(report);
    }

    return reports;
  }

  /**
   * What the platform owes users in this asset, read from the boundary contra-account rather
   * than by summing user balances.
   *
   * These are the same number by construction — every unit that entered came out of EXTERNAL —
   * but reading the boundary makes the check independent of how many user accounts exist and of
   * which buckets (available/pending/locked/trading) the value currently sits in. Internal
   * transfers between users, and PENDING→AVAILABLE releases, move value around without touching
   * the boundary at all, so the obligation only changes when value genuinely crosses in or out.
   */
  private async ledgerObligation(assetId: string): Promise<Prisma.Decimal> {
    // Summed rather than read from a single row: the boundary is conceptually one account per
    // asset, but summing means a second EXTERNAL account appearing for any reason is counted
    // instead of silently ignored — and silently ignoring part of the obligation would make
    // reconciliation report a match while users were under-backed, the exact failure this
    // service exists to catch.
    const total = await this.prisma.balance.aggregate({
      where: { assetId, type: LedgerAccountType.EXTERNAL },
      _sum: { amount: true },
    });
    // No boundary account means nothing has ever crossed in for this asset: obligation zero.
    return (total._sum.amount ?? new Prisma.Decimal(0)).negated();
  }

  /**
   * Dust tolerance of one base unit. Not a fudge factor for rounding — the ledger stores exact
   * decimals and does no rounding — but a guard against a single-wei artefact of an RPC node
   * reporting a balance mid-block paging an on-call engineer at 3am.
   */
  private tolerance(decimals: number): Prisma.Decimal {
    return new Prisma.Decimal(10).pow(-decimals);
  }

  private async fileMismatch(report: ReconciliationReport, severity: number): Promise<void> {
    this.logger.error(
      `Custody ${report.status} on ${report.chainKey}/${report.assetSymbol}: ` +
        `ledger owes ${report.obligation}, chain holds ${report.custody} ` +
        `(difference ${report.difference}).`,
    );

    // Deduplicated on the open event for this (chain, asset): a mismatch that persists across
    // scans is one incident, not one incident per minute. The details are refreshed so a
    // responder always sees the current numbers rather than the ones from first detection.
    const open = await this.prisma.riskEvent.findFirst({
      where: {
        type: RiskEventType.RECONCILIATION_MISMATCH,
        status: 'OPEN',
        details: { path: ['scope'], equals: this.scope(report) },
      },
    });

    const details = {
      scope: this.scope(report),
      chain: report.chainKey,
      asset: report.assetSymbol,
      kind: report.status,
      ledgerObligation: report.obligation,
      onChainCustody: report.custody,
      difference: report.difference,
      addressesChecked: report.addressesChecked,
      observedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;

    if (open) {
      await this.prisma.riskEvent.update({
        where: { id: open.id },
        data: { details, severity },
      });
      return;
    }

    await this.prisma.riskEvent.create({
      data: { type: RiskEventType.RECONCILIATION_MISMATCH, severity, details },
    });
  }

  private scope(report: ReconciliationReport): string {
    return `custody:${report.chainKey}:${report.assetSymbol}`;
  }
}

export interface ReconciliationReport {
  chainKey: string;
  assetSymbol: string;
  /** All amounts are positional decimal strings — never floats, never exponential notation. */
  obligation: string;
  custody: string;
  difference: string;
  addressesChecked: number;
  status: 'MATCHED' | 'SHORTFALL' | 'SURPLUS';
}
