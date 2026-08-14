import { Prisma } from '@prisma/client';

/**
 * The single definition of "an asset this deployment can actually custody on chain".
 *
 * Three places need this rule and they must agree exactly:
 *
 *   - the watcher, deciding which token contracts to scan for;
 *   - the deposit screen, telling a user what they may safely send;
 *   - reconciliation, deciding what to compare against on-chain balances.
 *
 * Any drift between them is a way to lose money. A token row with no contract address is the
 * case that makes this concrete: the scanner cannot see transfers of it (there is no contract
 * to filter logs on), so a deposit of it would arrive and never be credited — and reconciling
 * it would call `getBalance(address, null)`, which reads the chain's *native* balance and
 * reports it under the token's symbol, producing a phantom mismatch that hides real ones.
 *
 * Hence one exported clause rather than three hand-copied `where` objects.
 */
export const CREDITABLE_ASSET_WHERE = {
  isEnabled: true,
  OR: [
    { kind: 'NATIVE' as const },
    { kind: 'TOKEN' as const, contractAddress: { not: null } },
  ],
} satisfies Prisma.AssetWhereInput;

export function creditableAssetsOnChain(chainId: string): Prisma.AssetWhereInput {
  return { chainId, ...CREDITABLE_ASSET_WHERE };
}
