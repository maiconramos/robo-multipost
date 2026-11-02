/**
 * Escopo da memoria persistida do copilot (threads/mensagens/working memory
 * do Mastra). A chave do recurso inclui o perfil para que conversas de um
 * perfil (cliente) nao aparecam para membros de outro perfil da mesma org.
 * Threads antigas, gravadas so com o id da org, ficam visiveis apenas para
 * admins da org.
 */
export function copilotMemoryResourceId(
  orgId: string,
  profileId?: string | null
): string {
  return profileId ? `${orgId}:${profileId}` : orgId;
}

export function copilotReadableResourceIds(
  orgId: string,
  profileId: string | null | undefined,
  isOrgAdmin: boolean
): string[] {
  const own = copilotMemoryResourceId(orgId, profileId);
  return isOrgAdmin && own !== orgId ? [own, orgId] : [own];
}

/** threadId enviado pelo cliente no corpo do run (transporte de endpoint unico). */
export function copilotThreadIdFromBody(body: any): string | undefined {
  const candidate =
    body?.body?.threadId ?? body?.params?.threadId ?? body?.threadId;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : undefined;
}
