import { authenticator } from 'otplib';
import {
  generateBackupCodes,
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
} from './totp.util';

describe('totp.util', () => {
  it('generates a secret and accepts a code generated from that same secret', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it('rejects a code that does not match the secret', () => {
    const secret = generateTotpSecret();
    const wrongSecret = generateTotpSecret();
    const codeFromWrongSecret = authenticator.generate(wrongSecret);
    expect(verifyTotpCode(secret, codeFromWrongSecret)).toBe(false);
  });

  it('rejects a malformed code without throwing', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, 'not-a-code')).toBe(false);
  });

  it('builds a valid otpauth:// key URI with the issuer and email embedded', () => {
    const uri = totpKeyUri('trader@example.com', 'Nexus Investments', 'ABCDEFGHIJKLMNOP');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(decodeURIComponent(uri)).toContain('trader@example.com');
    expect(decodeURIComponent(uri)).toContain('Nexus Investments');
  });

  it('generates the requested number of unique, distinctly formatted backup codes', () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
    }
  });
});
