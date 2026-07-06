import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';

// Prefixo auto-descritivo dos tokens de Integration criptografados em repouso
// (B1). A leitura decide "cifrado vs texto puro" SO por este prefixo — nunca
// pela flag Integration.tokenEncrypted (que pode ficar desatualizada quando o
// token e reatribuido em memoria pos-refresh) nem por "tentar decifrar e
// capturar erro" (EncryptionService.decrypt NAO lanca de forma confiavel em
// texto puro: o ramo legacy-hex pode devolver lixo). Nenhum token OAuth real
// comeca com este prefixo (Meta EAA..., Google ya29..., Zernio, etc.).
export const TOKEN_ENC_PREFIX = 'enc:v1:';

export const isEncryptedToken = (
  stored: string | null | undefined
): boolean => !!stored && stored.startsWith(TOKEN_ENC_PREFIX);

// Devolve o token pronto para uso (texto puro). No-op em valores sem prefixo —
// e por isso que a Etapa 1 (adicionar chamadas de leitura) e inerte enquanto
// nada foi cifrado ainda. Null-safe: serve tambem para refreshToken (String?).
export const decryptIntegrationToken = (
  enc: EncryptionService,
  stored: string | null | undefined
): string => {
  if (!stored) {
    return stored ?? '';
  }
  if (isEncryptedToken(stored)) {
    return enc.decrypt(stored.slice(TOKEN_ENC_PREFIX.length));
  }
  return stored;
};

// Devolve o valor para gravar em repouso. Idempotente: valor vazio ou ja
// prefixado volta inalterado (refresh/reconexao re-gravam tokens; o
// refreshToken default e '').
export const encryptIntegrationToken = (
  enc: EncryptionService,
  plain: string | null | undefined
): string => {
  if (!plain) {
    return plain ?? '';
  }
  if (isEncryptedToken(plain)) {
    return plain;
  }
  return TOKEN_ENC_PREFIX + enc.encrypt(plain);
};
