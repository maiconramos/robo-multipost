import { Injectable } from '@nestjs/common';
import crypto from 'crypto';

const GCM_ALGORITHM = 'aes-256-gcm';
const GCM_NONCE_LENGTH = 12;
const GCM_TAG_LENGTH = 16;
const VERSION = 1;

@Injectable()
export class EncryptionService {
  private getMasterKey(): Buffer {
    const keySource =
      process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '';
    return crypto.createHash('sha256').update(keySource).digest();
  }

  encrypt(plaintext: string): string {
    const key = this.getMasterKey();
    const nonce = crypto.randomBytes(GCM_NONCE_LENGTH);
    const cipher = crypto.createCipheriv(GCM_ALGORITHM, key, nonce, {
      authTagLength: GCM_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([
      Buffer.from([VERSION]),
      nonce,
      tag,
      encrypted,
    ]);
    return payload.toString('base64');
  }

  decrypt(ciphertext: string): string {
    if (this.isLegacyFormat(ciphertext)) {
      return this.decryptLegacy(ciphertext);
    }
    const payload = Buffer.from(ciphertext, 'base64');
    const version = payload[0];
    if (version !== VERSION) {
      throw new Error(`Unsupported encryption version: ${version}`);
    }
    const nonce = payload.subarray(1, 1 + GCM_NONCE_LENGTH);
    const tag = payload.subarray(
      1 + GCM_NONCE_LENGTH,
      1 + GCM_NONCE_LENGTH + GCM_TAG_LENGTH
    );
    const encrypted = payload.subarray(1 + GCM_NONCE_LENGTH + GCM_TAG_LENGTH);
    const key = this.getMasterKey();
    const decipher = crypto.createDecipheriv(GCM_ALGORITHM, key, nonce, {
      authTagLength: GCM_TAG_LENGTH,
    });
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  encryptJson(obj: Record<string, any>): string {
    return this.encrypt(JSON.stringify(obj));
  }

  decryptJson(ciphertext: string): Record<string, any> {
    return JSON.parse(this.decrypt(ciphertext));
  }

  private isLegacyFormat(ciphertext: string): boolean {
    return /^[0-9a-f]+$/i.test(ciphertext) && ciphertext.length % 2 === 0;
  }

  private decryptLegacy(hexCiphertext: string): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const EVP_BytesToKey = require('evp_bytestokey');
    const algorithm = 'aes-256-cbc';
    const { keyLength, ivLength } = crypto.getCipherInfo(algorithm)!;
    const pass = Buffer.from(process.env.JWT_SECRET ?? '', 'utf8');
    const { key, iv } = EVP_BytesToKey(
      pass,
      null,
      keyLength! * 8,
      ivLength!,
      'md5'
    );
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    const out = Buffer.concat([
      decipher.update(hexCiphertext, 'hex'),
      decipher.final(),
    ]);
    return out.toString('utf8');
  }
}
