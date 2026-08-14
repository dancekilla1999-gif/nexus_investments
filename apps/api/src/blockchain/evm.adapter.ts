import { Logger } from '@nestjs/common';
import { createPublicClient, http, parseAbiItem, type PublicClient } from 'viem';
import {
  BlockchainAdapter,
  ChainHead,
  FeeEstimate,
  NetworkStatus,
  ObservedTransfer,
} from './adapter.interface';
import { deriveEvmAddressFromXpub, normalizeEvmAddress } from './hd-derivation';

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const ERC20_BALANCE_OF = parseAbiItem(
  'function balanceOf(address owner) view returns (uint256)',
);

export interface EvmAdapterConfig {
  chainKey: string;
  rpcUrl: string;
  /** Account-level extended public key (`m/44'/60'/0'`). Public — holds and signs nothing. */
  accountXpub: string;
}

/**
 * One adapter serving every EVM chain — Ethereum, Arbitrum, Base, BNB Chain, Polygon — because
 * they share address derivation, the ERC-20 Transfer event, and JSON-RPC semantics
 * (docs/06-blockchain-architecture.md §1). Adding "the next EVM chain" is a config row, not
 * new code. Solana, TRON and Bitcoin get their own adapters precisely because they do not
 * share those things.
 */
export class EvmAdapter implements BlockchainAdapter {
  readonly chainKey: string;
  private readonly logger: Logger;
  private readonly client: PublicClient;
  private readonly accountXpub: string;

  constructor(config: EvmAdapterConfig) {
    this.chainKey = config.chainKey;
    this.accountXpub = config.accountXpub;
    this.logger = new Logger(`EvmAdapter:${config.chainKey}`);
    this.client = createPublicClient({ transport: http(config.rpcUrl) });
  }

  deriveDepositAddress(accountIndex: number): string {
    return deriveEvmAddressFromXpub(this.accountXpub, accountIndex);
  }

  normalizeAddress(address: string): string {
    return normalizeEvmAddress(address);
  }

  async getChainHead(): Promise<ChainHead> {
    const block = await this.client.getBlock({ blockTag: 'latest' });
    return { blockNumber: block.number ?? 0n, timestamp: new Date(Number(block.timestamp) * 1000) };
  }

  /**
   * Native-asset transfers come from scanning block bodies; token transfers come from
   * `eth_getLogs` filtered on the ERC-20 Transfer topic with our addresses in the indexed
   * `to` position. Both are needed: a plain ETH send emits no log at all, and a token transfer
   * moves no value in the transaction's own `value` field.
   */
  async getIncomingTransfers(
    addresses: string[],
    tokenContracts: string[],
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ObservedTransfer[]> {
    if (addresses.length === 0 || toBlock < fromBlock) return [];

    const watched = new Set(addresses.map((a) => this.normalizeAddress(a)));
    const [native, tokens] = await Promise.all([
      this.scanNativeTransfers(watched, fromBlock, toBlock),
      tokenContracts.length > 0
        ? this.scanTokenTransfers(addresses, tokenContracts, fromBlock, toBlock)
        : Promise.resolve([]),
    ]);
    return [...native, ...tokens];
  }

  private async scanNativeTransfers(
    watched: Set<string>,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ObservedTransfer[]> {
    const found: ObservedTransfer[] = [];

    for (let n = fromBlock; n <= toBlock; n++) {
      const block = await this.client.getBlock({ blockNumber: n, includeTransactions: true });
      for (const tx of block.transactions) {
        if (typeof tx === 'string' || !tx.to || tx.value === 0n) continue;
        if (!watched.has(this.normalizeAddress(tx.to))) continue;

        // A transaction can revert while still appearing in the block; crediting a reverted
        // transfer would credit money that never arrived.
        const receipt = await this.client.getTransactionReceipt({ hash: tx.hash });
        if (receipt.status !== 'success') continue;

        found.push({
          txHash: tx.hash,
          // Native transfers emit no log, so there is no log index. Zero keeps the
          // (txHash, logIndex) idempotency key well-formed and cannot collide with a real log
          // index for the same hash, because a token transfer to us in the same transaction
          // would be a different (token) transfer entirely.
          logIndex: 0,
          blockNumber: n,
          from: tx.from ? this.normalizeAddress(tx.from) : null,
          to: this.normalizeAddress(tx.to),
          amount: tx.value,
          tokenContract: null,
        });
      }
    }

    return found;
  }

  private async scanTokenTransfers(
    addresses: string[],
    tokenContracts: string[],
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ObservedTransfer[]> {
    // Scoped to the specific token contracts the platform supports. Beyond being the only
    // thing worth crediting, this is a hard requirement of real infrastructure: public and
    // rate-limited RPC providers reject a topic-only log query with "please specify an
    // address" — found by running this against an actual Sepolia node rather than a mock.
    //
    // viem's typed `event` + `args` form (rather than hand-built topic hex) handles the
    // 32-byte left-padding of indexed address topics and decodes `value`, so a padding mistake
    // cannot silently cause deposits to go unnoticed.
    const logs = await this.client.getLogs({
      address: tokenContracts.map((c) => this.normalizeAddress(c) as `0x${string}`),
      event: ERC20_TRANSFER_EVENT,
      args: { to: addresses.map((a) => this.normalizeAddress(a) as `0x${string}`) },
      fromBlock,
      toBlock,
    });

    const found: ObservedTransfer[] = [];
    for (const log of logs) {
      const { from, to, value } = log.args;
      // ERC-721 shares this event signature but indexes its third parameter, so `value` comes
      // back undefined for an NFT transfer. An NFT is not a fungible deposit — skip it.
      if (value === undefined || value === 0n || !to) continue;
      if (log.transactionHash === null || log.blockNumber === null || log.logIndex === null) continue;

      found.push({
        txHash: log.transactionHash,
        logIndex: Number(log.logIndex),
        blockNumber: log.blockNumber,
        from: from ? this.normalizeAddress(from) : null,
        to: this.normalizeAddress(to),
        amount: value,
        tokenContract: this.normalizeAddress(log.address),
      });
    }

    return found;
  }

  async getConfirmations(txHash: string): Promise<number> {
    try {
      const receipt = await this.client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      const head = await this.client.getBlockNumber();
      if (head < receipt.blockNumber) return 0;
      // A transaction in the head block has one confirmation, not zero.
      return Number(head - receipt.blockNumber) + 1;
    } catch {
      // Not yet mined, or dropped from the mempool.
      return 0;
    }
  }

  async getBalance(address: string, tokenContract: string | null): Promise<bigint> {
    const account = this.normalizeAddress(address) as `0x${string}`;
    if (tokenContract === null) {
      return this.client.getBalance({ address: account });
    }
    return this.client.readContract({
      address: this.normalizeAddress(tokenContract) as `0x${string}`,
      abi: [ERC20_BALANCE_OF],
      functionName: 'balanceOf',
      args: [account],
    });
  }

  async estimateWithdrawalFee(
    to: string,
    amount: bigint,
    tokenContract: string | null,
  ): Promise<FeeEstimate> {
    const fees = await this.client.estimateFeesPerGas();
    // A bare native transfer is exactly 21,000 gas; an ERC-20 transfer varies with storage
    // state, so this is an upper-ish estimate re-checked at broadcast time (docs/06 §7).
    const gasLimit = tokenContract === null ? 21_000n : 65_000n;
    const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;

    return {
      totalNative: gasLimit * maxFeePerGas,
      detail: {
        gasLimit: gasLimit.toString(),
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: (fees.maxPriorityFeePerGas ?? 0n).toString(),
        note: tokenContract ? 'ERC-20 transfer estimate' : 'native transfer',
      },
    };
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    const started = Date.now();
    try {
      const blockNumber = await this.client.getBlockNumber();
      return { healthy: true, blockNumber, latencyMs: Date.now() - started };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`RPC unreachable: ${message}`);
      return { healthy: false, error: message, latencyMs: Date.now() - started };
    }
  }
}
