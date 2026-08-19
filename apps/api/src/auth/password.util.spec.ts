import { hashPassword, verifyPassword, verifyPasswordConstantTime } from './password.util';

describe('password.util', () => {
  it('hashes a password and verifies the correct plaintext against it', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd#2026');
    expect(hash).not.toEqual('Str0ng!Passw0rd#2026');
    await expect(verifyPassword(hash, 'Str0ng!Passw0rd#2026')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd#2026');
    await expect(verifyPassword(hash, 'WrongPassword123')).resolves.toBe(false);
  });

  it('produces a different hash for the same password each time (random salt)', async () => {
    const hashA = await hashPassword('Str0ng!Passw0rd#2026');
    const hashB = await hashPassword('Str0ng!Passw0rd#2026');
    expect(hashA).not.toEqual(hashB);
  });

  it('never crashes verifyPassword on a malformed hash — returns false', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false);
  });
});

describe('verifyPasswordConstantTime', () => {
  it('resolves true for the correct password against a real hash', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd#2026');
    await expect(verifyPasswordConstantTime(hash, 'Str0ng!Passw0rd#2026')).resolves.toBe(true);
  });

  it('resolves false for the wrong password against a real hash', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd#2026');
    await expect(verifyPasswordConstantTime(hash, 'WrongPassword123')).resolves.toBe(false);
  });

  it('resolves false when there is no hash at all (no such account) regardless of input', async () => {
    await expect(verifyPasswordConstantTime(null, 'anything')).resolves.toBe(false);
    await expect(verifyPasswordConstantTime(undefined, 'anything')).resolves.toBe(false);
  });

  it('pays the same argon2id cost whether the account exists or not', async () => {
    // The bug this guards against: a single call's timing is noisy (GC, scheduler jitter), but
    // the *mean* cost of a real argon2id verify vs. the no-account path should land in the same
    // ballpark. Before the fix, the no-account path returned in microseconds while a real verify
    // costs tens of milliseconds (memoryCost=19MB, timeCost=2) — a >100x gap that let an
    // attacker enumerate registered emails by timing POST /auth/login. A 3x tolerance is loose
    // enough not to flake on a noisy CI box while still failing hard if the cheap early-return
    // regresses back in.
    const hash = await hashPassword('Str0ng!Passw0rd#2026');
    const ITERATIONS = 8;

    const timeOf = async (fn: () => Promise<unknown>): Promise<number> => {
      const start = process.hrtime.bigint();
      await fn();
      return Number(process.hrtime.bigint() - start) / 1e6; // milliseconds
    };

    let realAccountTotalMs = 0;
    let noAccountTotalMs = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      realAccountTotalMs += await timeOf(() => verifyPasswordConstantTime(hash, 'WrongPassword123'));
      noAccountTotalMs += await timeOf(() => verifyPasswordConstantTime(null, 'WrongPassword123'));
    }
    const realAccountMeanMs = realAccountTotalMs / ITERATIONS;
    const noAccountMeanMs = noAccountTotalMs / ITERATIONS;

    expect(noAccountMeanMs).toBeGreaterThan(realAccountMeanMs / 3);
    expect(noAccountMeanMs).toBeLessThan(realAccountMeanMs * 3);
  });
});
