import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MockProxy } from 'jest-mock-extended';
import {
  TOKEN_ENC_PREFIX,
  isEncryptedToken,
  decryptIntegrationToken,
  encryptIntegrationToken,
} from './integration-token.helper';

describe('integration-token.helper', () => {
  let enc: MockProxy<EncryptionService> & EncryptionService;

  beforeEach(() => {
    enc = createMock<EncryptionService>();
    enc.encrypt.mockImplementation((plain: string) => `CIPHER(${plain})`);
    enc.decrypt.mockImplementation((cipher: string) =>
      cipher.replace(/^CIPHER\((.*)\)$/, '$1')
    );
  });

  describe('isEncryptedToken', () => {
    it('reconhece valores com o prefixo', () => {
      expect(isEncryptedToken(`${TOKEN_ENC_PREFIX}abc`)).toBe(true);
    });

    it('trata texto puro, null e undefined como nao cifrados', () => {
      expect(isEncryptedToken('EAAtoken')).toBe(false);
      expect(isEncryptedToken('')).toBe(false);
      expect(isEncryptedToken(null)).toBe(false);
      expect(isEncryptedToken(undefined)).toBe(false);
    });
  });

  describe('encryptIntegrationToken', () => {
    it('prefixa e cifra um token em texto puro', () => {
      const result = encryptIntegrationToken(enc, 'EAAtoken');
      expect(result).toBe(`${TOKEN_ENC_PREFIX}CIPHER(EAAtoken)`);
      expect(enc.encrypt).toHaveBeenCalledWith('EAAtoken');
    });

    it('e idempotente: valor ja prefixado volta inalterado', () => {
      const already = `${TOKEN_ENC_PREFIX}CIPHER(x)`;
      expect(encryptIntegrationToken(enc, already)).toBe(already);
      expect(enc.encrypt).not.toHaveBeenCalled();
    });

    it('nao cifra valor vazio/null/undefined', () => {
      expect(encryptIntegrationToken(enc, '')).toBe('');
      expect(encryptIntegrationToken(enc, null)).toBe('');
      expect(encryptIntegrationToken(enc, undefined)).toBe('');
      expect(enc.encrypt).not.toHaveBeenCalled();
    });
  });

  describe('decryptIntegrationToken', () => {
    it('decifra apenas valores prefixados', () => {
      const result = decryptIntegrationToken(
        enc,
        `${TOKEN_ENC_PREFIX}CIPHER(EAAtoken)`
      );
      expect(result).toBe('EAAtoken');
      expect(enc.decrypt).toHaveBeenCalledWith('CIPHER(EAAtoken)');
    });

    it('e no-op em texto puro (nunca chama decrypt)', () => {
      expect(decryptIntegrationToken(enc, 'EAAtoken')).toBe('EAAtoken');
      expect(enc.decrypt).not.toHaveBeenCalled();
    });

    it('null/undefined/vazio viram string vazia sem chamar decrypt', () => {
      expect(decryptIntegrationToken(enc, null)).toBe('');
      expect(decryptIntegrationToken(enc, undefined)).toBe('');
      expect(decryptIntegrationToken(enc, '')).toBe('');
      expect(enc.decrypt).not.toHaveBeenCalled();
    });
  });

  describe('round-trip com EncryptionService real', () => {
    const original = process.env.ENCRYPTION_KEY;
    beforeAll(() => {
      process.env.ENCRYPTION_KEY = 'chave-de-teste-b1-integration-token';
    });
    afterAll(() => {
      if (original === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = original;
    });

    it('encrypt seguido de decrypt recupera o token original', () => {
      const real = new EncryptionService();
      const token = 'EAAG1234567890tokenreal';
      const stored = encryptIntegrationToken(real, token);

      expect(stored.startsWith(TOKEN_ENC_PREFIX)).toBe(true);
      expect(stored).not.toContain(token);
      expect(decryptIntegrationToken(real, stored)).toBe(token);
    });

    it('decrypt de um token em texto puro (nao prefixado) devolve ele mesmo', () => {
      const real = new EncryptionService();
      expect(decryptIntegrationToken(real, 'EAAtokenpuro')).toBe('EAAtokenpuro');
    });
  });
});
