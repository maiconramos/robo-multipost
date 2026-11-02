/**
 * Valores de exemplo de `JWT_SECRET` publicados no repositorio (compose,
 * .env.example, docs). Quem roda com um deles tem a chave conhecida por
 * qualquer um: da para assinar sessao, convite e o provisionamento
 * enterprise (organizacao SUPERADMIN com apiKey) sem login.
 */
export const KNOWN_PLACEHOLDER_JWT_SECRETS = [
  'random string that is unique to every install - just type random characters here!',
  'random string for your JWT secret, make it long',
  'coloque-uma-string-aleatoria-longa-aqui',
  'sua-secret-aqui',
  'gere-uma-string-aleatoria-longa',
  'GERAR_VALOR_LOCAL',
] as const;

export const MIN_JWT_SECRET_LENGTH = 32;

export function isPlaceholderJwtSecret(secret?: string | null): boolean {
  const value = (secret ?? '').trim();
  return (KNOWN_PLACEHOLDER_JWT_SECRETS as readonly string[]).includes(value);
}

export function isShortJwtSecret(secret?: string | null): boolean {
  return (secret ?? '').trim().length < MIN_JWT_SECRET_LENGTH;
}
