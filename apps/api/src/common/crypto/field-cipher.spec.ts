// apps/api/src/common/crypto/field-cipher.spec.ts
import { FieldCipherService, createFieldCipherFromEnv } from './field-cipher';
import { randomBytes } from 'crypto';

describe('FieldCipherService', () => {
  const key = randomBytes(32);
  const cipher = new FieldCipherService(key);

  it('round-trips a plaintext value', () => {
    const enc = cipher.encryptField('22AAAAA0000A1Z5');
    expect(enc).not.toContain('22AAAAA0000A1Z5'); // ciphertext, not plaintext
    expect(enc.startsWith('v1:')).toBe(true);
    expect(cipher.decryptField(enc)).toBe('22AAAAA0000A1Z5');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    expect(cipher.encryptField('x')).not.toBe(cipher.encryptField('x'));
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const enc = cipher.encryptField('secret');
    const parts = enc.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => cipher.decryptField(parts.join(':'))).toThrow();
  });

  it('fails fast when the env key is missing', () => {
    expect(() => createFieldCipherFromEnv({})).toThrow(/KYC_ENC_KEY/);
  });

  it('fails fast when the env key is the wrong length', () => {
    expect(() =>
      createFieldCipherFromEnv({ KYC_ENC_KEY: Buffer.from('short').toString('base64') }),
    ).toThrow(/32 bytes/);
  });
});
