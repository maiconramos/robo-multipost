import crypto from 'crypto';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const makeId = (length: number) => {
  let text = '';
  const possible = ALPHABET;

  for (let i = 0; i < length; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

/**
 * Gera um identificador aleatorio criptograficamente seguro (CSPRNG).
 *
 * Usar SEMPRE que o valor for um segredo/credencial (tokens de API, client
 * secrets, authorization codes, apiKeys) — `makeId` usa `Math.random()`, que
 * nao e seguro (o estado do PRNG e recuperavel a partir de poucas saidas).
 *
 * Usa rejection sampling sobre `crypto.randomBytes` para mapear no alfabeto
 * base62 sem vies de modulo (256 nao e multiplo de 62: descartamos bytes
 * >= 248 = 4*62).
 */
export const makeSecureId = (length: number): string => {
  if (length <= 0) {
    return '';
  }
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 248
  let out = '';
  while (out.length < length) {
    const bytes = crypto.randomBytes(length - out.length);
    for (let i = 0; i < bytes.length && out.length < length; i += 1) {
      const b = bytes[i];
      if (b < max) {
        out += ALPHABET.charAt(b % ALPHABET.length);
      }
    }
  }
  return out;
};
