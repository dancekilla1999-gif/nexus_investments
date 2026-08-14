import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { BlockchainRegistry } from '../blockchain/blockchain.registry';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { creditableAssetsOnChain } from './creditable-assets';
import { DepositsService } from './deposits.service';

/**
 * Polls each configured chain for incoming transfers to platform deposit addresses.
 *
 * Deliberately simple and deliberately re-entrant-safe rather than clever: correctness here
 * comes from the deposit pipeline's `(chainId, txHash, logIndex)` uniqueness, not from the
 * watcher never scanning the same block twice. That inverts the usual difficulty — the watcher
 * is allowed to be crude, overlap its windows, restart mid-range, or rewind after a reorg,
 * because none of that can double-credit anyone.
 *
 * A BullMQ queue (docs/02-system-architecture.md §5) replaces this timer when there is more
 * than one API instance, so two processes don't scan the same range concurrently. Until then a
 * single in-process interval is the honest amount of machinery for the job.
 */
@Injectable()
export class DepositWatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DepositWatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BlockchainRegistry,
    private readonly deposits: DepositsService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.depositWatcherEnabled) {
      this.logger.log('Deposit watcher disabled by configuration.');
      return;
    }
    const interval = this.config.depositScanIntervalMs;
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    // Do not hold the process open purely for the watcher.
    this.timer.unref?.();
    this.logger.log(`Deposit watcher started (every ${interval}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One full pass over every configured chain. Exposed so tests can drive it deterministically. */
  async tick(): Promise<void> {
    if (this.running) {
      // The previous pass is still going — scanning is I/O-bound and a slow RPC must not cause
      // overlapping passes to pile up.
      return;
    }
    this.running = true;
    try {
      for (const chainKey of await this.registry.getConfiguredChainKeys()) {
        try {
          await this.scanChain(chainKey);
          await this.deposits.advancePendingDeposits(chainKey);
        } catch (err) {
          // One unhealthy chain must not stop the others from being watched.
          this.logger.error(
            `Deposit scan failed for "${chainKey}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  async scanChain(chainKey: string): Promise<{ from: bigint; to: bigint; found: number } | null> {
    const chain = await this.prisma.chain.findUniqueOrThrow({ where: { key: chainKey } });
    const adapter = await this.registry.getAdapter(chainKey);

    const addresses = (
      await this.prisma.walletAddress.findMany({
        where: { chainId: chain.id },
        select: { address: true },
      })
    ).map((a) => a.address);

    if (addresses.length === 0) return null;

    // Same creditability rule the deposit screen and reconciliation use — see
    // creditable-assets.ts for why these three must not be allowed to drift.
    const tokenContracts = (
      await this.prisma.asset.findMany({
        where: { ...creditableAssetsOnChain(chain.id), kind: 'TOKEN' },
        select: { contractAddress: true },
      })
    ).map((a) => a.contractAddress!);

    const head = (await adapter.getChainHead()).blockNumber;

    // First run starts at the head, not at genesis: a deposit that predates the platform
    // knowing about an address is not a deposit, and replaying millions of blocks to discover
    // that would be an expensive way to find nothing.
    const from = chain.lastScannedBlock === null ? head : BigInt(chain.lastScannedBlock) + 1n;
    if (from > head) return null;

    const to = from + BigInt(this.config.depositScanBatchBlocks) - 1n > head
      ? head
      : from + BigInt(this.config.depositScanBatchBlocks) - 1n;

    const transfers = await adapter.getIncomingTransfers(addresses, tokenContracts, from, to);

    let recorded = 0;
    for (const transfer of transfers) {
      const outcome = await this.deposits.recordObservedTransfer(chain.id, transfer);
      if (outcome === 'created') recorded++;
    }

    // Advance the cursor only after the range is fully processed. Crashing mid-range means the
    // range is rescanned on restart, which is harmless — and far better than skipping it.
    await this.prisma.chain.update({
      where: { id: chain.id },
      data: { lastScannedBlock: to },
    });

    if (recorded > 0) {
      this.logger.log(`Recorded ${recorded} deposit(s) on "${chainKey}" in blocks ${from}–${to}.`);
    }

    return { from, to, found: recorded };
  }
}
