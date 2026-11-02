/**
 * Defesa CSRF para o cookie de sessao. O cookie `auth` e SameSite=None (a
 * app suporta frontend e backend em subdominios diferentes), entao um
 * formulario de outro site que faz POST para a API leva o cookie junto, e o
 * CORS nao impede a requisicao "simples" de executar — so de ser lida.
 *
 * Regra: requisicao que muda estado (POST/PUT/PATCH/DELETE) autenticada pelo
 * cookie precisa vir de uma origem da propria instancia (as mesmas do CORS).
 * Requisicoes com o header `auth` (API/CLI, modo NOT_SECURED) nao sao CSRF:
 * um site de terceiro nao consegue mandar header customizado sem preflight.
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const originOf = (value?: string): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const allowedRequestOrigins = (
  env: Record<string, string | undefined> = process.env
): Set<string> =>
  new Set(
    [
      env.FRONTEND_URL,
      env.MAIN_URL,
      env.NEXT_PUBLIC_BACKEND_URL,
      'http://localhost:6274', // MCP inspector (mesmo allowlist do CORS)
    ]
      .map(originOf)
      .filter((origin): origin is string => !!origin)
  );

interface CsrfRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
}

const header = (req: CsrfRequestLike, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Requisicao vinda de outro site (qualquer metodo): Origin fora da instancia
 * ou, sem Origin, Sec-Fetch-Site cross-site. Para GET com efeito colateral
 * (o cookie SameSite=None vai junto num <img> ou link de outro site).
 */
export function isCrossSiteRequest(
  req: CsrfRequestLike,
  allowed: Set<string> = allowedRequestOrigins()
): boolean {
  const origin = header(req, 'origin');
  if (origin) {
    return !allowed.has(origin);
  }
  return header(req, 'sec-fetch-site') === 'cross-site';
}

export function isCrossSiteCookieMutation(
  req: CsrfRequestLike,
  allowed: Set<string> = allowedRequestOrigins()
): boolean {
  if (!MUTATING_METHODS.has(String(req.method || '').toUpperCase())) {
    return false;
  }
  // autenticado por header, nao pelo cookie: nao e o cenario de CSRF
  if (header(req, 'auth')) return false;
  if (!req.cookies?.auth) return false;

  // sem Origin (navegador antigo / cliente nao-navegador) vale o Fetch
  // Metadata quando houver
  return isCrossSiteRequest(req, allowed);
}
