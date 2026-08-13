/**
 * Seeds reference data only — chains, assets, subscription plans, indicator catalog.
 * Never seeds fake user/financial data outside `development`
 * (docs/03-database-architecture.md §7).
 */
import { PrismaClient, ChainType, SubscriptionTier } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding reference data (chains, assets, subscription plans)...');

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
