import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Envelope-encrypts small secrets at rest (currently: TOTP secrets — see
 * docs/05-security-architecture.md §4). The data-encryption key here is derived from
 * APP_ENCRYPTION_KEY; in a production deployment that key is itself issued and rotated by a
 * real KMS (AWS KMS / GCP KMS / Vault transit), never a static env var — this service's
 * *interface* (encrypt/decrypt small payloads) does not change either way, only where the key
 * comes from does.
 */
@Injectable()
export class EnvelopeEncryptionService {
  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    this.key = crypto.createHash('sha256').update(config.appEncryptionKey).digest();
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = raw.subarray(IV_LENGTH + 16);
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
