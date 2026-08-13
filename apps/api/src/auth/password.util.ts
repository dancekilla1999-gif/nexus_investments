import * as argon2 from 'argon2';

/**
 * argon2id — memory-hard, resistant to GPU cracking. Cost parameters are conservative
 * defaults suitable for an interactive login path; tune via load testing in MVP10, not by
 * guessing (docs/05-security-architecture.md §1).
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, OWASP-recommended minimum for argon2id
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}
