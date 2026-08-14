import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChainType } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainAdapter } from './adapter.interface';
import { EvmAdapter } from './evm.adapter';

/**
 * Resolves a chain key to its adapter (docs/06-blockchain-architecture.md §1).
 *
 * A chain is only watchable if it has both an RPC endpoint and an account xpub configured.
 * Chains without them are skipped with a warning rather than half-initialised — a watcher
 * silently pointed at nothing would look healthy while missing every deposit.
 *
 * Adding Solana/TRON/Bitcoin means adding a branch here plus their adapter class. Nothing
 * above this file changes.
 */
@Injectable()
export class BlockchainRegistry {
  private readonly logger = new Logger(BlockchainRegistry.name);
  private readonly adapters = new Map<string, BlockchainAdapter>();
  private initialised = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async getAdapter(chainKey: string): Promise<BlockchainAdapter> {
    await this.init();
    const adapter = this.adapters.get(chainKey);
    if (!adapter) {
      throw new NotFoundException({
        code: 'CHAIN_NOT_CONFIGURED',
        message: `Chain "${chainKey}" has no configured adapter on this deployment.`,
      });
    }
    return adapter;
  }

  async getConfiguredChainKeys(): Promise<string[]> {
    await this.init();
    return [...this.adapters.keys()];
  }

  async isConfigured(chainKey: string): Promise<boolean> {
    await this.init();
    return this.adapters.has(chainKey);
  }

  private async init(): Promise<void> {
    if (this.initialised) return;

    const chains = await this.prisma.chain.findMany({ where: { isEnabled: true } });
    for (const chain of chains) {
      const rpcUrl = this.config.chainRpcUrl(chain.key);
      const accountXpub = this.config.chainAccountXpub(chain.key);

      if (!rpcUrl || !accountXpub) {
        this.logger.warn(
          `Chain "${chain.key}" is enabled but not configured (rpcUrl=${Boolean(rpcUrl)}, ` +
            `xpub=${Boolean(accountXpub)}); deposits for it will NOT be detected.`,
        );
        continue;
      }

      if (chain.type === ChainType.EVM) {
        this.adapters.set(chain.key, new EvmAdapter({ chainKey: chain.key, rpcUrl, accountXpub }));
        this.logger.log(`Registered EVM adapter for "${chain.key}".`);
      } else {
        // Honest gap rather than a stub that returns empty results and looks like it works:
        // an adapter that finds no deposits is indistinguishable from a chain with no deposits.
        this.logger.warn(
          `Chain "${chain.key}" has type ${chain.type}, which has no adapter yet — see ` +
            `docs/06-blockchain-architecture.md §1. Deposits for it are NOT detected.`,
        );
      }
    }

    this.initialised = true;
  }
}
