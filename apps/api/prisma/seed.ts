/**
 * Seeds reference data only — chains, assets, subscription plans, indicator catalog.
 * Never seeds fake user/financial data outside `development`
 * (docs/03-database-architecture.md §7).
 */
import { PrismaClient, ChainType, SubscriptionTier, UserStatus } from '@prisma/client';
import {
  PLATFORM_SYSTEM_USER_EMAIL,
  PLATFORM_SYSTEM_USER_ID,
} from '../src/ledger/ledger.constants';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding reference data (chains, assets, subscription plans)...');

  // The owner of the platform's EXTERNAL boundary ledger accounts — see
  // src/ledger/ledger.constants.ts. Cannot authenticate: the password hash is not a valid
  // argon2 encoding, so verification always fails rather than matching some crafted input, and
  // the account is permanently CLOSED.
  await prisma.user.upsert({
    where: { id: PLATFORM_SYSTEM_USER_ID },
    update: {},
    create: {
      id: PLATFORM_SYSTEM_USER_ID,
      email: PLATFORM_SYSTEM_USER_EMAIL,
      passwordHash: 'NOT_A_VALID_HASH__SYSTEM_ACCOUNT_CANNOT_LOG_IN',
      status: UserStatus.CLOSED,
    },
  });

  const chains = [
    { key: 'ethereum', name: 'Ethereum (Sepolia testnet)', type: ChainType.EVM, nativeAssetSymbol: 'ETH', confirmationsRequired: 12 },
    { key: 'arbitrum', name: 'Arbitrum (Sepolia testnet)', type: ChainType.EVM, nativeAssetSymbol: 'ETH', confirmationsRequired: 20 },
    { key: 'base', name: 'Base (Sepolia testnet)', type: ChainType.EVM, nativeAssetSymbol: 'ETH', confirmationsRequired: 20 },
    { key: 'bnb', name: 'BNB Chain (testnet)', type: ChainType.EVM, nativeAssetSymbol: 'BNB', confirmationsRequired: 15 },
    { key: 'polygon', name: 'Polygon (Amoy testnet)', type: ChainType.EVM, nativeAssetSymbol: 'MATIC', confirmationsRequired: 128 },
    { key: 'solana', name: 'Solana (devnet)', type: ChainType.SOLANA, nativeAssetSymbol: 'SOL', confirmationsRequired: 32 },
    { key: 'tron', name: 'TRON (Shasta testnet)', type: ChainType.TRON, nativeAssetSymbol: 'TRX', confirmationsRequired: 19 },
    { key: 'bitcoin', name: 'Bitcoin (testnet)', type: ChainType.BITCOIN, nativeAssetSymbol: 'BTC', confirmationsRequired: 3 },
  ];

  for (const chain of chains) {
    await prisma.chain.upsert({
      where: { key: chain.key },
      update: {},
      create: { ...chain, isTestnet: true, isEnabled: true },
    });
  }

  const ethereum = await prisma.chain.findUniqueOrThrow({ where: { key: 'ethereum' } });
  const tron = await prisma.chain.findUniqueOrThrow({ where: { key: 'tron' } });

  await prisma.asset.upsert({
    where: { chainId_symbol: { chainId: ethereum.id, symbol: 'ETH' } },
    update: {},
    create: { symbol: 'ETH', name: 'Ether', chainId: ethereum.id, decimals: 18, kind: 'NATIVE', coingeckoId: 'ethereum' },
  });
  // Circle's official USDC on Sepolia. A token is only *depositable* if the platform knows its
  // contract address — that is what lets the watcher filter logs for it and what lets an
  // observed transfer be resolved to an asset (see src/deposits/creditable-assets.ts). Without
  // it a token row is ledger-usable but invisible to the chain scanner.
  await prisma.asset.upsert({
    where: { chainId_symbol: { chainId: ethereum.id, symbol: 'USDC' } },
    update: { contractAddress: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' },
    create: {
      symbol: 'USDC',
      name: 'USD Coin (Sepolia)',
      chainId: ethereum.id,
      decimals: 6,
      kind: 'TOKEN',
      contractAddress: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
      coingeckoId: 'usd-coin',
    },
  });
  // Tether has no canonical Sepolia deployment, so this row deliberately carries no contract
  // address: it exists for ledger, P2P and market plumbing, and the deposit screen correctly
  // declines to list it as creditable rather than inviting a deposit nothing would detect.
  await prisma.asset.upsert({
    where: { chainId_symbol: { chainId: ethereum.id, symbol: 'USDT' } },
    update: {},
    create: { symbol: 'USDT', name: 'Tether USD', chainId: ethereum.id, decimals: 6, kind: 'TOKEN', coingeckoId: 'tether' },
  });
  await prisma.asset.upsert({
    where: { chainId_symbol: { chainId: tron.id, symbol: 'USDT' } },
    update: {},
    create: { symbol: 'USDT', name: 'Tether USD (TRC-20)', chainId: tron.id, decimals: 6, kind: 'TOKEN', coingeckoId: 'tether' },
  });

  const plans = [
    { tier: SubscriptionTier.FREE, name: 'Free', priceMonthlyUsd: 0, priceYearlyUsd: 0, signalLimitPerDay: 3, features: { advancedIndicators: false, aiExplanations: false, macroAnalysis: false, onChainAnalytics: false, priorityAlerts: false } },
    { tier: SubscriptionTier.PRO, name: 'Pro', priceMonthlyUsd: 29, priceYearlyUsd: 290, signalLimitPerDay: 25, features: { advancedIndicators: true, aiExplanations: true, macroAnalysis: false, onChainAnalytics: false, priorityAlerts: false } },
    { tier: SubscriptionTier.ELITE, name: 'Elite', priceMonthlyUsd: 99, priceYearlyUsd: 990, signalLimitPerDay: null, features: { advancedIndicators: true, aiExplanations: true, macroAnalysis: true, onChainAnalytics: true, priorityAlerts: true } },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: {},
      create: plan as never,
    });
  }

  // See docs/10-managed-accounts-architecture.md §3: this is a clearly-labeled placeholder
  // draft, not real legal copy. It must be drafted or reviewed by licensed counsel per
  // jurisdiction before PLATFORM_MODE=live is ever set for Managed Accounts specifically —
  // see docs/10 §1. Seeding it now only makes the acceptance-recording flow exercisable.
  await prisma.riskDisclosureAgreement.upsert({
    where: { version: 1 },
    update: {},
    create: {
      version: 1,
      title: 'Managed Account Risk Disclosure (DRAFT — placeholder, not final legal copy)',
      isCurrent: true,
      effectiveAt: new Date('2026-01-01T00:00:00Z'),
      bodyMarkdown: `> **Draft placeholder.** This text has not been reviewed by licensed
counsel in any jurisdiction and must not be relied upon or shown to a real investor before
that review happens (docs/10-managed-accounts-architecture.md §1, §3). It exists so the
acceptance-recording mechanism can be built and tested honestly ahead of the legal text it
will eventually carry.

## What a Managed Account is

A Managed Account lets you allocate capital that a designated manager or a validated
algorithmic strategy trades on your behalf, inside a sub-account that remains yours at all
times — your funds are never pooled with another investor's.

## The risks, stated plainly

- **You can lose money, including some or all of the capital you allocate.** Trading digital
  assets is volatile and unpredictable.
- **Nothing is guaranteed.** No manager, algorithm, or backtest result — however strong — is a
  promise of future performance. Past results, including backtested and paper-traded results,
  do not predict future results.
- **This is not financial advice**, and nothing in this platform should be read as a
  personalized recommendation that a Managed Account is suitable for you.
- **The platform is not your fiduciary** unless and until it is licensed as such in your
  jurisdiction; check the current licensing status shown on this page before allocating any
  capital.

## The one number that matters: the 10% cap

Every Managed Account has a hard maximum-drawdown ceiling of **10% of the account's
high-water-mark capital** — the platform will not configure an account to risk more than that,
and it is not a target, it is a ceiling. Crossing it halts new risk-taking on that account
immediately and notifies you; it does not undo a loss that already happened. You may set a
stricter (lower) limit; you cannot set a looser one.

## Before you allocate capital

You confirm that you understand and accept the above, that you are allocating capital you can
afford to lose, and that you have read the fee schedule shown to you before authorizing the
account.`,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
