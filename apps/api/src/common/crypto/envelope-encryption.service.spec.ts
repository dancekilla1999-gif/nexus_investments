import { EnvelopeEncryptionService } from './envelope-encryption.service';
import { AppConfigService } from '../../config/app-config.service';

function fakeConfig(key: string): AppConfigService {
  return { appEncryptionKey: key } as unknown as AppConfigService;
}

describe('EnvelopeEncryptionService', () => {
  it('round-trips a plaintext secret through encrypt/decrypt', () => {
    const svc = new EnvelopeEncryptionService(fakeConfig('test-key-1'));
    const ciphertext = svc.encrypt('JBSWY3DPEHPK3PXP');
    expect(ciphertext).not.toContain('JBSWY3DPEHPK3PXP');
    expect(svc.decrypt(ciphertext)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces different ciphertext for the same plaintext each call (random IV)', () => {
    const svc = new EnvelopeEncryptionService(fakeConfig('test-key-1'));
    const a = svc.encrypt('same-secret');
    const b = svc.encrypt('same-secret');
    expect(a).not.toEqual(b);
  });

  it('fails to decrypt with the wrong key (authenticity check)', () => {
    const svcA = new EnvelopeEncryptionService(fakeConfig('key-a'));
    const svcB = new EnvelopeEncryptionService(fakeConfig('key-b'));
    const ciphertext = svcA.encrypt('top-secret-totp-seed');
    expect(() => svcB.decrypt(ciphertext)).toThrow();
  });

  it('fails to decrypt tampered ciphertext (GCM auth tag check)', () => {
    const svc = new EnvelopeEncryptionService(fakeConfig('test-key-1'));
    const ciphertext = svc.encrypt('top-secret-totp-seed');
    const tampered = ciphertext.slice(0, -4) + (ciphertext.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    expect(() => svc.decrypt(tampered)).toThrow();
  });
});
