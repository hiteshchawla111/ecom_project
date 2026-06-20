// apps/api/src/common/crypto/field-cipher.ts
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

@Injectable()
export class FieldCipherService {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error('FieldCipherService requires a 32-byte key');
    }
  }

  encryptField(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
  }

  decryptField(stored: string): string {
    const [version, ivB64, tagB64, ctB64] = stored.split(':');
    if (version !== VERSION) throw new Error(`Unsupported cipher version: ${version}`);
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  }
}

export function createFieldCipherFromEnv(env: { KYC_ENC_KEY?: string }): FieldCipherService {
  if (!env.KYC_ENC_KEY) throw new Error('KYC_ENC_KEY is required');
  const key = Buffer.from(env.KYC_ENC_KEY, 'base64');
  if (key.length !== 32) throw new Error('KYC_ENC_KEY must decode to 32 bytes (openssl rand -base64 32)');
  return new FieldCipherService(key);
}
