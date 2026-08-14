import { HDKey, publicKeyToAddress } from 'viem/accounts';
import { deriveEvmAddressFromXpub, normalizeEvmAddress } from './hd-derivation';

/**
 * Ground truth: the canonical BIP-39 test mnemonic
 * ("abandon abandon ... abandon about"), whose `m/44'/60'/0'` account xpub and resulting
 * addresses are published and reproducible in any conforming wallet. Checking against an
 * external reference is the entire value of this test — asserting on our own output would be
 * circular.
 *
 * The xpub is hardcoded rather than re-derived from the mnemonic on purpose: it makes the test
 * exercise exactly the function under test (xpub → address) instead of also re-testing a
 * third-party seed derivation, and an extended *public* key can hold nothing and sign nothing.
 */
const TEST_ACCOUNT_XPUB =
  'xpub6DCoCpSuQZB2jawqnGMEPS63ePKWkwWPH4TU45Q7LPXWuNd8TMtVxRrgjtEshuqpK3mdhaWHPFsBngh5GFZaM6si3yZdUsT8ddYM3PwnATt';

const EXPECTED_ADDRESSES = [
  '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
  '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0',
  '0xb6716976A3ebe8D39aCEB04372f22Ff8e6802D7A',
];

function accountXpub(): string {
  return TEST_ACCOUNT_XPUB;
}

describe('deriveEvmAddressFromXpub', () => {
  it('matches the published BIP-44 addresses for the canonical test mnemonic', () => {
    const xpub = accountXpub();
    EXPECTED_ADDRESSES.forEach((expected, index) => {
      expect(deriveEvmAddressFromXpub(xpub, index)).toBe(expected);
    });
  });

  it('returns EIP-55 checksummed addresses, not all-lowercase', () => {
    const address = deriveEvmAddressFromXpub(accountXpub(), 0);
    expect(address).not.toBe(address.toLowerCase());
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('is deterministic — the same index always yields the same address', () => {
    const xpub = accountXpub();
    expect(deriveEvmAddressFromXpub(xpub, 7)).toBe(deriveEvmAddressFromXpub(xpub, 7));
  });

  it('gives every index a distinct address', () => {
    const xpub = accountXpub();
    const addresses = Array.from({ length: 50 }, (_, i) => deriveEvmAddressFromXpub(xpub, i));
    expect(new Set(addresses).size).toBe(50);
  });

  it('derives from a public key alone — no private key is present or reachable', () => {
    const xpub = accountXpub();
    const node = HDKey.fromExtendedKey(xpub);
    // The whole security argument for watch-only derivation: this node cannot sign.
    expect(node.privateKey).toBeNull();
    expect(() => deriveEvmAddressFromXpub(xpub, 0)).not.toThrow();
  });

  it('rejects indices outside the non-hardened range instead of deriving something wrong', () => {
    const xpub = accountXpub();
    for (const bad of [-1, 1.5, 0x80000000, Number.NaN]) {
      expect(() => deriveEvmAddressFromXpub(xpub, bad)).toThrow(/Invalid derivation index/);
    }
  });

  it('rejects a malformed extended key rather than producing a plausible-looking address', () => {
    expect(() => deriveEvmAddressFromXpub('not-an-xpub', 0)).toThrow();
  });

  it('decompresses the public key before hashing — the compressed form silently yields a WRONG address', () => {
    // Regression guard for a genuinely dangerous failure mode found while building this:
    // viem's publicKeyToAddress accepts a 33-byte compressed key without complaint and returns
    // a well-formed, checksummed, completely incorrect address. Shipping that would have sent
    // every user's deposit to an address the platform holds no key for — unrecoverable.
    // BIP-32 nodes carry compressed keys, so this is the natural mistake to make.
    const child = HDKey.fromExtendedKey(TEST_ACCOUNT_XPUB).deriveChild(0).deriveChild(0);
    const compressedHex = `0x${Buffer.from(child.publicKey!).toString('hex')}` as `0x${string}`;

    expect(compressedHex).toHaveLength(2 + 66); // 33 bytes
    expect(publicKeyToAddress(compressedHex)).not.toBe(EXPECTED_ADDRESSES[0]);
    expect(deriveEvmAddressFromXpub(TEST_ACCOUNT_XPUB, 0)).toBe(EXPECTED_ADDRESSES[0]);
  });
});

describe('normalizeEvmAddress', () => {
  it('lowercases so a checksummed address matches the same address from an RPC response', () => {
    expect(normalizeEvmAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(
      '0x9858effd232b4033e47d90003d41ec34ecaeda94',
    );
    expect(normalizeEvmAddress('0x9858effd232b4033e47d90003d41ec34ecaeda94')).toBe(
      normalizeEvmAddress('0x9858EFFD232B4033E47D90003D41EC34ECAEDA94'),
    );
  });
});
