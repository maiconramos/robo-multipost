import { HttpException } from '@nestjs/common';
import type { Organization } from '@prisma/client';
import { z } from 'zod';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { readRequestContext } from './tool.context.helper';
import { getContext } from '../async.storage';

export const agentProfileSelector = z
  .string()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Perfil/cliente escolhido nesta chamada: descubra o ID com getAccountContextTool e os canais com integrationList. Reutilize a mesma chave da organização; não solicite uma chave por cliente. profileId é um identificador, não uma credencial. Chave de organização pode selecionar apenas perfis da própria organização; chave de perfil só aceita o próprio. Não troca a sessão. Obrigatório para operações de um cliente quando a chave é da organização.'
  );

export function agentIdentity(options: unknown, requested?: string) {
  const context = readRequestContext(options);
  const authenticated = getContext();
  let organization: Organization;
  try {
    organization =
      authenticated?.auth ??
      JSON.parse(String(context.get('organization') || 'null'));
  } catch {
    throw new HttpException('ORGANIZATION_REQUIRED', 401);
  }
  if (typeof organization?.id !== 'string' || !organization.id)
    throw new HttpException('ORGANIZATION_REQUIRED', 401);
  const rawProfile = authenticated
    ? authenticated.profileId
    : context.get('profileId');
  if (rawProfile != null && (typeof rawProfile !== 'string' || !rawProfile))
    throw new HttpException('INVALID_PROFILE_CONTEXT', 403);
  if (
    requested !== undefined &&
    !agentProfileSelector.safeParse(requested).success
  )
    throw new HttpException('INVALID_PROFILE_SELECTION', 400);
  if (rawProfile && requested && rawProfile !== requested)
    throw new HttpException('PROFILE_KEY_MISMATCH', 403);
  return {
    organization,
    profileId: (rawProfile || requested || undefined) as string | undefined,
  };
}

export async function resolveAgentProfile(
  profiles: Pick<ProfileService, 'getProfileById'>,
  options: unknown,
  requested?: string,
  required = false
) {
  const scope = agentIdentity(options, requested);
  if (!scope.profileId && required)
    throw new HttpException('PROFILE_REQUIRED', 400);
  const profile = scope.profileId
    ? await profiles.getProfileById(scope.organization.id, scope.profileId)
    : null;
  if (scope.profileId && !profile)
    throw new HttpException('PROFILE_NOT_FOUND', 404);
  return {
    ...scope,
    profile: profile ? { id: profile.id, name: profile.name } : null,
  };
}
