import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { getOrgRole } from '@gitroom/nestjs-libraries/user/org.role';
import { isAuthBypassPath } from '@gitroom/nestjs-libraries/services/auth/auth-bypass-paths';
import {
  NoProfileAssignedException,
  ProfileManageDeniedException,
  ProfileReadOnlyException,
} from './profile-access.exception';
import {
  PROFILE_MANAGE_KEY,
  ProfileManageOptions,
  SKIP_PROFILE_ACCESS_KEY,
} from './profile-access.decorators';

// Enforcement central do isolamento por perfil (fechado por padrao):
// - org ADMIN/SUPERADMIN: acesso implicito a todos os perfis, passa sempre;
// - org USER sem perfil resolvido: 403 NO_PROFILE_ASSIGNED;
// - org USER com role VIEWER no perfil: somente leitura (metodos != GET
//   recebem 403 PROFILE_READ_ONLY);
// - rotas com @ProfileManage: exigem OWNER/MANAGER no perfil alvo.
// Requisicoes sem req.org/req.user (rotas fora do AuthMiddleware, API
// publica, webhooks) passam — cada uma tem sua propria autenticacao.
@Injectable()
export class ProfileAccessGuard implements CanActivate {
  constructor(
    private _reflector: Reflector,
    private _profileService: ProfileService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest() as Request & {
      org?: { id: string; users?: Array<{ role?: string }> };
      user?: { id: string };
      profile?: { id: string } | null;
      profileRole?: string | null;
    };

    const { org, user } = request;
    if (!org || !user) {
      return true;
    }

    // Mesmos bypasses de path do PoliciesGuard (matching por segmento).
    if (isAuthBypassPath(request.path)) {
      return true;
    }

    const skip = this._reflector.getAllAndOverride<boolean>(
      SKIP_PROFILE_ACCESS_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (skip) {
      return true;
    }

    const orgRole = getOrgRole(org as never);
    if (orgRole === 'ADMIN' || orgRole === 'SUPERADMIN') {
      return true;
    }

    if (!request.profile) {
      throw new NoProfileAssignedException();
    }

    const manage = this._reflector.getAllAndOverride<ProfileManageOptions>(
      PROFILE_MANAGE_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (manage) {
      const paramValue = manage.param
        ? request.params?.[manage.param]
        : undefined;
      const targetProfileId =
        (typeof paramValue === 'string' && paramValue) || request.profile.id;
      const role = await this._profileService.getEffectiveProfileRole(
        org.id,
        targetProfileId,
        user.id,
        orgRole
      );
      if (role !== 'OWNER' && role !== 'MANAGER') {
        throw new ProfileManageDeniedException();
      }
      return true;
    }

    if (request.profileRole === 'VIEWER' && request.method !== 'GET') {
      throw new ProfileReadOnlyException();
    }

    return true;
  }
}
