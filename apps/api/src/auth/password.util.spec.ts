import { hashPassword, verifyPassword } from './password.util';

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
