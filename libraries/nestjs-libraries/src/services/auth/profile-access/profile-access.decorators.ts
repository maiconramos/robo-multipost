import { SetMetadata } from '@nestjs/common';

export const SKIP_PROFILE_ACCESS_KEY = 'skip_profile_access';
export const PROFILE_MANAGE_KEY = 'profile_manage';
export const ALLOW_VIEWER_KEY = 'allow_viewer';

// Isenta um handler ou controller inteiro do ProfileAccessGuard. Usar apenas
// em rotas que precisam responder para org USER sem perfil atribuido
// (ex.: /user/self, logout, join-org) ou que nao carregam dados de perfil.
export const SkipProfileAccess = () =>
  SetMetadata(SKIP_PROFILE_ACCESS_KEY, true);

export interface ProfileManageOptions {
  // Nome do route param que carrega o profileId alvo (ex.: 'id' em
  // /profiles/:id/members). Sem param, o alvo e o perfil ativo da requisicao.
  param?: string;
}

// Exige role OWNER ou MANAGER no perfil alvo para org USER; org
// ADMIN/SUPERADMIN passam sem consulta de membership.
export const ProfileManage = (options: ProfileManageOptions = {}) =>
  SetMetadata(PROFILE_MANAGE_KEY, options);

// Libera a rota (nao-GET) para VIEWER, apesar do bloqueio geral de escrita.
// Usado em acoes de REVISAO do cliente (aprovar/pedir alteracao/comentar) —
// o VIEWER continua exigindo perfil atribuido (nao burla NO_PROFILE_ASSIGNED).
export const AllowViewer = () => SetMetadata(ALLOW_VIEWER_KEY, true);
