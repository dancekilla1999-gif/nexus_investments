import { authenticator } from 'otplib';
import * as crypto from 'node:crypto';

authenticator.options = { window: 1 }; // ±30s clock drift tolerance

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, issuer: string, secret: string): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

/** Generates N single-use backup codes (plaintext, shown to the user exactly once). */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-'),
  );
}
