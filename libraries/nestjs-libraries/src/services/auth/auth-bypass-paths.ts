// Rotas que dispensam as checagens de policy/perfil (fluxo de auth e handshake
// de conexao de canal, que rodam antes de haver contexto de org/perfil).
// Matching por SEGMENTO — nunca substring: `indexOf('/auth')` casaria com
// `/oauth/authorize` (que emite token org-wide) e o deixaria sem guarda.
const BYPASS_PREFIXES = [
  '/auth',
  '/integrations/social-connect',
  '/integrations/provider',
];

export const isAuthBypassPath = (path: string): boolean =>
  BYPASS_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
