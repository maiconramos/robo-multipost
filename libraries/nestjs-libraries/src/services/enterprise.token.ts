import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { isPlaceholderJwtSecret } from '@gitroom/helpers/auth/jwt-secret.strength';

/**
 * Claims que identificam tokens de OUTRO proposito assinados com o mesmo
 * `JWT_SECRET`. `AuthService.verifyJWT` aceita todos eles, entao a assinatura
 * sozinha nao prova que o token foi emitido para o provisionamento enterprise:
 * um usuario comum conseguia usar o proprio token de login em
 * `POST /enterprise/create-user` e receber uma organizacao ULTIMATE vitalicia
 * com a apiKey (CVE-2026-94455).
 */
export const FOREIGN_TOKEN_CLAIMS = [
  'providerName', // login/ativacao: a linha inteira de User
  'orgId', // convite de equipe
  'timeLimit', // convite de equipe
  'expires', // redefinicao de senha
  'integrationId', // token da extensao Chrome
  'billing', // modify-subscription
  'password', // nostr
  'discount', // billing
  'order_id', // nowpayments
] as const;

export class InvalidEnterpriseTokenError extends Error {
  constructor() {
    super('Invalid enterprise token');
  }
}

export function verifyEnterpriseToken<T extends object>(
  params: unknown,
  verify: (token: string) => unknown = (token) => AuthService.verifyJWT(token),
  jwtSecret: string | undefined = process.env.JWT_SECRET
): T {
  if (typeof params !== 'string' || !params) {
    throw new InvalidEnterpriseTokenError();
  }

  // Com a chave de exemplo do repositorio, qualquer um assina este token e
  // ganha uma organizacao SUPERADMIN sem login: as rotas enterprise ficam
  // desligadas ate o JWT_SECRET ser trocado.
  if (isPlaceholderJwtSecret(jwtSecret)) {
    throw new InvalidEnterpriseTokenError();
  }

  const payload = verify(params);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InvalidEnterpriseTokenError();
  }

  if (FOREIGN_TOKEN_CLAIMS.some((claim) => claim in payload)) {
    throw new InvalidEnterpriseTokenError();
  }

  return payload as T;
}
