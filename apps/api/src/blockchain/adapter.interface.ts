/**
 * The Blockchain Abstraction Layer contract (docs/06-blockchain-architecture.md §1).
 *
 * Everything above this interface — the wallet module, the deposit pipeline, the ledger — is
 * chain-agnostic. Adding Solana, TRON, or Bitcoin means implementing this once and registering
 * it; it does not mean touching a single line of the code that moves money.
 *
 * Deliberately absent from this interface: anything that signs. Signing lives behind its own
 * `SigningProvider` boundary (docs/06 §4) because the security requirements are completely
 * different — an adapter needs an RPC endpoint, a signer needs an HSM or an MPC quorum.
 */

export interface ChainHead {
  blockNumber: bigint;
  /** Wall-clock time of the head block, for staleness detection on a stalled node. */
  timestamp: Date;
}

export interface ObservedTransfer {
  /** Uniquely identifies this transfer on-chain; the deposit pipeline's idempotency key. */
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  from: string | null;
  to: string;
  /** Base units (wei and equivalents) — never a decimal, never a float. */
  amount: bigint;
  /**
   * Null for the chain's native asset; a token contract address otherwise. The caller resolves
   * this to a platform asset — the adapter does not know what a "platform asset" is.
   */
  tokenContract: string | null;
}

export interface FeeEstimate {
  /** Total estimated cost in the chain's native base units. */
  totalNative: bigint;
  /** Human-readable breakdown for display; shape varies by chain's fee model. */
  detail: Record<string, string>;
}

export interface NetworkStatus {
  healthy: boolean;
  blockNumber?: bigint;
  latencyMs?: number;
  error?: string;
}

export interface BlockchainAdapter {
  /** Matches `chains.key` in the database. */
  readonly chainKey: string;

  /**
   * Watch-only derivation from the custody account's extended public key. No private key is
   * involved, and none is derivable from what this method needs — see docs/06 §4.
   */
  deriveDepositAddress(accountIndex: number): string;

  /** Normalizes an address to the form stored and compared against (EVM: lowercase). */
  normalizeAddress(address: string): string;

  getChainHead(): Promise<ChainHead>;

  /**
   * All incoming transfers to `addresses` within the inclusive block range, covering both the
   * native asset and the given token contracts.
   *
   * `tokenContracts` is required rather than "everything": public and rate-limited RPC
   * providers reject an unfiltered log query outright (verified against a real node), and the
   * platform can only credit assets it actually has a record for — a token it does not support
   * arriving at a deposit address is not a deposit. Pass an empty array to watch the native
   * asset only.
   *
   * Implementations must not silently truncate; the caller sizes the block range so it can
   * bound the work itself.
   */
  getIncomingTransfers(
    addresses: string[],
    tokenContracts: string[],
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ObservedTransfer[]>;

  getConfirmations(txHash: string): Promise<number>;

  /**
   * Balance actually held on chain by `address`, in base units. `tokenContract` null = native.
   *
   * This exists for custody reconciliation (docs/06 §6) — proving that what the ledger says the
   * platform owes its users is backed by assets that really exist. It is deliberately NOT used
   * by the crediting path: a balance is a snapshot and says nothing about who sent what, so
   * crediting from a balance read rather than from a transfer would be untraceable, and an
   * untraceable credit is indistinguishable from an invented one.
   */
  getBalance(address: string, tokenContract: string | null): Promise<bigint>;

  estimateWithdrawalFee(to: string, amount: bigint, tokenContract: string | null): Promise<FeeEstimate>;

  getNetworkStatus(): Promise<NetworkStatus>;
}
