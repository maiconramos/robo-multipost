import { FOREIGN_TOKEN_CLAIMS } from '@gitroom/nestjs-libraries/services/enterprise.token';

/**
 * Todo JWT da instancia (login, convite, redefinicao de senha, extensao,
 * billing...) e assinado com o mesmo `JWT_SECRET`. A sessao e a linha inteira
 * de `User` (`providerName` e a marca dela); qualquer claim de outro formato
 * prova que o token NAO foi emitido como sessao. `password` aparece como
 * `null` no token de sessao de usuarios OAuth, por isso so conta com valor.
 */
export const NON_SESSION_CLAIMS = [
  ...FOREIGN_TOKEN_CLAIMS.filter((claim) => claim !== 'providerName'),
  'apiKey', // callback do webhookUrl / enterprise
] as const;

/** Mesmo prazo do cookie `auth` (1 ano): token mais velho que isso nao vale. */
export const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export interface SessionTokenPayload {
  id: string;
  iat: number;
}

export function asSessionPayload(payload: unknown): SessionTokenPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const claims = payload as Record<string, unknown>;
  if (typeof claims.id !== 'string' || !claims.id) return null;
  if (typeof claims.iat !== 'number') return null;
  if (
    NON_SESSION_CLAIMS.some(
      (claim) => claims[claim] !== undefined && claims[claim] !== null
    )
  ) {
    return null;
  }
  // link do e-mail de ativacao: assinado antes de ativar, nunca vira sessao
  if (claims.activated === false) return null;
  return claims as unknown as SessionTokenPayload;
}

/**
 * Sessao expirada (mais velha que o cookie) ou emitida antes da ultima
 * troca de senha (`User.sessionsValidAfter`).
 */
export function isSessionRevoked(
  payload: { iat: number },
  user: { sessionsValidAfter?: Date | null },
  now = Date.now()
): boolean {
  const issuedAtMs = payload.iat * 1000;
  if (now - issuedAtMs > SESSION_MAX_AGE_SECONDS * 1000) return true;
  return isIssuedBeforeCutoff(payload.iat, user.sessionsValidAfter);
}

/** Tokens com `iat` anterior ao corte foram invalidados (sessao ou reset). */
export function isIssuedBeforeCutoff(
  iat: unknown,
  cutoff?: Date | null
): boolean {
  if (!cutoff) return false;
  if (typeof iat !== 'number') return true;
  return iat * 1000 < cutoff.getTime();
}

/**
 * Corte gravado na troca de senha. `iat` tem resolucao de segundos, entao o
 * corte e arredondado para baixo: um login feito logo depois, no mesmo
 * segundo, continua valido.
 */
export function sessionsCutoffNow(now = Date.now()): Date {
  return new Date(Math.floor(now / 1000) * 1000);
}
