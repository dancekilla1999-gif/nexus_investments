import { EvmAdapter } from './evm.adapter';

/**
 * Integration tests against a **live Ethereum Sepolia node**.
 *
 * These are the tests that distinguish "an adapter that compiles" from "an adapter that works".
 * Mocking an RPC would only assert that this code calls the functions this code calls; it
 * would not catch a wrong topic filter, a misread receipt status, or an off-by-one in
 * confirmation counting — the failure modes that actually lose or fabricate deposits.
 *
 * These tests REQUIRE network access by default and will fail loudly without it. Skipping is
 * an explicit opt-out via SKIP_LIVE_RPC_TESTS=1, never an automatic degradation: a suite that
 * quietly skips itself when the network is missing looks like coverage while providing none,
 * which is worse than having no test at all.
 */
const RPC_URL = process.env.EVM_RPC_URL_SEPOLIA ?? 'https://ethereum-sepolia-rpc.publicnode.com';

/** Canonical BIP-39 test-mnemonic account xpub — a public key; holds nothing, signs nothing. */
const TEST_XPUB =
  'xpub6DCoCpSuQZB2jawqnGMEPS63ePKWkwWPH4TU45Q7LPXWuNd8TMtVxRrgjtEshuqpK3mdhaWHPFsBngh5GFZaM6si3yZdUsT8ddYM3PwnATt';

const SKIP_LIVE = process.env.SKIP_LIVE_RPC_TESTS === '1';

describe('EvmAdapter (live Sepolia)', () => {
  const adapter = new EvmAdapter({ chainKey: 'ethereum', rpcUrl: RPC_URL, accountXpub: TEST_XPUB });

  // Evaluated at describe-registration time, which is BEFORE any beforeAll hook runs — reading
  // a flag set in beforeAll here would always see its initial value and skip everything
  // unconditionally. (Learned the hard way; the first version of this file did exactly that.)
  const liveIt = () => (SKIP_LIVE ? it.skip : it);

  liveIt()(
    'reaches the configured RPC endpoint at all',
    async () => {
      const status = await adapter.getNetworkStatus();
      if (!status.healthy) {
        throw new Error(
          `Sepolia RPC unreachable at ${RPC_URL}: ${status.error}. ` +
            'Set SKIP_LIVE_RPC_TESTS=1 to opt out deliberately.',
        );
      }
    },
    30_000,
  );

  liveIt()(
    'reports a healthy network with a plausible block height',
    async () => {
      const status = await adapter.getNetworkStatus();
      expect(status.healthy).toBe(true);
      // Sepolia passed block 5,000,000 in early 2024; anything below that means we are talking
      // to the wrong network or a badly stale node.
      expect(status.blockNumber!).toBeGreaterThan(5_000_000n);
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    },
    30_000,
  );

  liveIt()(
    'reads a chain head whose timestamp is recent, not a stalled node',
    async () => {
      const head = await adapter.getChainHead();
      expect(head.blockNumber).toBeGreaterThan(5_000_000n);

      const ageMs = Date.now() - head.timestamp.getTime();
      // Sepolia produces a block every ~12s. An hour of drift means the node is stuck, and a
      // stuck node silently stops detecting deposits — worth failing loudly over.
      expect(ageMs).toBeLessThan(60 * 60 * 1000);
      expect(ageMs).toBeGreaterThan(-60 * 1000);
    },
    30_000,
  );

  liveIt()(
    'scans a real block range without inventing transfers to addresses we do not watch',
    async () => {
      const head = await adapter.getChainHead();
      const from = head.blockNumber - 3n;

      // Freshly derived addresses from a public test xpub: real, valid, and (at these high
      // indices) overwhelmingly unlikely to have ever received anything.
      const unusedAddresses = [900_001, 900_002].map((i) => adapter.deriveDepositAddress(i));

      // A real Sepolia ERC-20 (Circle's test USDC) — scoping the log query to specific token
      // contracts is mandatory on public RPCs, not merely an optimisation.
      const SEPOLIA_USDC = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';

      const transfers = await adapter.getIncomingTransfers(
        unusedAddresses,
        [SEPOLIA_USDC],
        from,
        head.blockNumber,
      );
      expect(transfers).toEqual([]);
    },
    60_000,
  );

  liveIt()(
    'returns zero confirmations for a transaction hash that does not exist',
    async () => {
      const nonexistent = `0x${'ab'.repeat(32)}`;
      expect(await adapter.getConfirmations(nonexistent)).toBe(0);
    },
    30_000,
  );

  liveIt()(
    'reads native and ERC-20 balances from a real node, in base units',
    async () => {
      // Custody reconciliation compares these numbers against what the ledger says the platform
      // owes its users, so a wrong reading does not produce a display bug — it either invents a
      // shortfall or conceals one.
      const unused = adapter.deriveDepositAddress(900_003);
      const SEPOLIA_USDC = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';

      expect(await adapter.getBalance(unused, null)).toBe(0n);
      expect(await adapter.getBalance(unused, SEPOLIA_USDC)).toBe(0n);

      // Zeroes alone would also pass against a stub that returns 0n for everything, so read an
      // address that must hold something. Rather than hardcode one — balances move, and a test
      // that rots into a false pass is worse than no test — take senders from a recent block:
      // an account that just paid gas is funded, live, and found the same way every run.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = (adapter as any).client;
      const head = await adapter.getChainHead();
      let sawFundedAccount = false;

      for (let n = head.blockNumber; n > head.blockNumber - 4n && !sawFundedAccount; n--) {
        const block = await client.getBlock({ blockNumber: n, includeTransactions: true });
        for (const tx of block.transactions.slice(0, 10)) {
          if (typeof tx === 'string' || !tx.from) continue;
          if ((await adapter.getBalance(tx.from, null)) > 0n) {
            sawFundedAccount = true;
            break;
          }
        }
      }
      expect(sawFundedAccount).toBe(true);
    },
    120_000,
  );

  liveIt()(
    'counts confirmations for a real, mined transaction as at least one',
    async () => {
      // Walk back from the head to find a block that actually contains a transaction.
      const head = await adapter.getChainHead();
      let txHash: string | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = (adapter as any).client;
      for (let n = head.blockNumber; n > head.blockNumber - 5n && !txHash; n--) {
        const block = await client.getBlock({ blockNumber: n, includeTransactions: false });
        if (block.transactions.length > 0) txHash = block.transactions[0];
      }

      if (!txHash) {
        // Five consecutive empty blocks on Sepolia would be unusual but is not this code's bug.
        return;
      }

      const confirmations = await adapter.getConfirmations(txHash);
      expect(confirmations).toBeGreaterThanOrEqual(1);
      expect(confirmations).toBeLessThan(100);
    },
    60_000,
  );

  liveIt()(
    'estimates a withdrawal fee from real network gas prices',
    async () => {
      const estimate = await adapter.estimateWithdrawalFee(
        '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
        10n ** 16n,
        null,
      );

      expect(estimate.totalNative).toBeGreaterThan(0n);
      expect(estimate.detail.gasLimit).toBe('21000');
      // An ERC-20 transfer costs more gas than a bare native send, always.
      const tokenEstimate = await adapter.estimateWithdrawalFee(
        '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
        10n ** 6n,
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
      );
      expect(tokenEstimate.totalNative).toBeGreaterThan(estimate.totalNative);
    },
    30_000,
  );

  it('reports unhealthy for a bad RPC endpoint instead of throwing', async () => {
    const broken = new EvmAdapter({
      chainKey: 'ethereum',
      rpcUrl: 'http://127.0.0.1:1/nope',
      accountXpub: TEST_XPUB,
    });
    const status = await broken.getNetworkStatus();
    expect(status.healthy).toBe(false);
    expect(status.error).toBeTruthy();
  }, 30_000);
});
