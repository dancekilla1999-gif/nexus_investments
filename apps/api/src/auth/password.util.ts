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

// A fixed argon2id hash of an unguessable placeholder, computed once and reused for every
// "no such account" login attempt. Never reveals anything itself — it isn't derived from any
// real user's data — it exists purely so a non-existent account still pays the same argon2id
// verify cost as a real one. Lazily memoized: computing it eagerly at import time would push a
// ~20MB, timeCost=2 hash into every cold start (tests included) for a value nothing needs yet.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash('nexus-timing-defense-placeholder-9f3c2a', ARGON2_OPTIONS);
  return dummyHash;
}

/**
 * Same cost whether or not `hash` is real. Login must not let an attacker distinguish
 * "no such account" from "wrong password" by response latency — see CLAUDE.md §5 and
 * docs/05-security-architecture.md §1. A `null` hash still runs a full argon2id verify (against
 * the placeholder above) before unconditionally returning `false`, so both branches cost the
 * same ~argon2id verify time regardless of which one you're on.
 */
export async function verifyPasswordConstantTime(
  hash: string | null | undefined,
  plaintext: string,
): Promise<boolean> {
  if (hash == null) {
    await verifyPassword(await getDummyHash(), plaintext);
    return false;
  }
  return verifyPassword(hash, plaintext);
}
