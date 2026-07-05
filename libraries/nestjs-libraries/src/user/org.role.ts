import { Organization, Role } from '@prisma/client';

// A org resolvida pelo AuthMiddleware carrega apenas o vinculo do usuario
// autenticado em users[0] (mesma fonte usada pelo PoliciesGuard). Sem
// vinculo resolvivel, assume USER (fail-closed).
export const getOrgRole = (
  org: Organization & { users?: Array<{ role?: Role }> }
): Role => org?.users?.[0]?.role ?? Role.USER;
