import { secp256k1 } from '@noble/curves/secp256k1.js';
import { toHex } from 'viem';
import { HDKey, publicKeyToAddress } from 'viem/accounts';

/**
 * Watch-only deposit address derivation.
 *
 * The platform derives every user's deposit address from an **extended public key** (xpub).
 * That is the entire point: this process can compute where funds should arrive and is
 * mathematically incapable of computing the keys that spend them. Signing is a separate
 * concern behind `SigningProvider`, backed by an HSM or MPC quorum in production
 * (docs/06-blockchain-architecture.md §4).
 *
 * Path is BIP-44: `m/44'/60'/0'/0/{accountIndex}` for EVM chains. The hardened prefix
 * (`m/44'/60'/0'`) is derived once, offline, wherever the seed actually lives; only the
 * resulting account-level xpub reaches this service, and only the final two non-hardened
 * levels are derived here. Hardened derivation from an xpub is impossible by construction —
 * which is precisely the property being relied on.
 *
 * Address encoding is delegated to viem rather than hand-rolled: EIP-55 checksumming and
 * keccak-over-the-right-byte-slice are exactly the sort of thing that should use a
 * widely-exercised implementation in a system that moves money.
 */

/** The non-hardened receive branch, relative to the account-level xpub. */
export const EVM_RECEIVE_BRANCH = 0;

/** BIP-32 caps a child index at 2^31-1 before the hardened range begins. */
const MAX_NON_HARDENED_INDEX = 0x7fffffff;

export function deriveEvmAddressFromXpub(accountXpub: string, accountIndex: number): string {
  if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex > MAX_NON_HARDENED_INDEX) {
    throw new Error(
      `Invalid derivation index ${accountIndex}: must be an integer in [0, ${MAX_NON_HARDENED_INDEX}].`,
    );
  }

  const child = HDKey.fromExtendedKey(accountXpub)
    .deriveChild(EVM_RECEIVE_BRANCH)
    .deriveChild(accountIndex);

  if (!child.publicKey) {
    throw new Error('Derived HD node carries no public key.');
  }

  // viem's publicKeyToAddress expects the uncompressed (65-byte, 0x04-prefixed) form; BIP-32
  // nodes carry the compressed 33-byte form.
  const uncompressed = secp256k1.Point.fromBytes(child.publicKey).toBytes(false);
  return publicKeyToAddress(toHex(uncompressed));
}

/**
 * The form addresses are stored and compared in. On-chain data and user input arrive in
 * arbitrary case; comparing a checksummed address against a lowercase one from an RPC response
 * would silently fail to match a real deposit, so everything is normalized on the way in.
 */
export function normalizeEvmAddress(address: string): string {
  return address.toLowerCase();
}
