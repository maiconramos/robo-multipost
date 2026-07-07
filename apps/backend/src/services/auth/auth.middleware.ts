import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Role, User } from '@prisma/client';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';

export const removeAuth = (res: Response) => {
  res.cookie('auth', '', {
    domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    ...(!process.env.NOT_SECURED
      ? {
          secure: true,
          httpOnly: true,
          sameSite: 'none',
        }
      : {}),
    expires: new Date(0),
    maxAge: -1,
  });
  res.header('logout', 'true');
};

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private _organizationService: OrganizationService,
    private _userService: UsersService,
    private _profileService: ProfileService
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.auth || req.cookies.auth;
    if (!auth) {
      throw new HttpForbiddenException();
    }
    try {
      // Verify the JWT signature only. Never trust authorization-relevant
      // claims (id, isSuperAdmin, activated) from the token body — always
      // re-resolve the user from the database using the id.
      const payload = AuthService.verifyJWT(auth) as User | null;
      const orgHeader = req.cookies.showorg || req.headers.showorg;

      if (!payload?.id) {
        throw new HttpForbiddenException();
      }

      let user = (await this._userService.getUserById(
        payload.id
      )) as User | null;

      if (!user) {
        throw new HttpForbiddenException();
      }

      if (!user.activated) {
        throw new HttpForbiddenException();
      }

      const impersonate = req.cookies.impersonate || req.headers.impersonate;
      if (user?.isSuperAdmin && impersonate) {
        const loadImpersonate = await this._organizationService.getUserOrg(
          impersonate
        );

        if (loadImpersonate) {
          user = loadImpersonate.user;
          user.isSuperAdmin = true;
          delete user.password;

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          req.user = user;

          // @ts-ignore
          loadImpersonate.organization.users =
            loadImpersonate.organization.users.filter(
              (f) => f.userId === user.id
            );
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          req.org = loadImpersonate.organization;

          await this.resolveProfileContext(
            req,
            loadImpersonate.organization.id,
            user.id,
            loadImpersonate.organization.users[0]?.role
          );
          next();
          return;
        }
      }

      delete user.password;
      const organization = (
        await this._organizationService.getOrgsByUserId(user.id)
      ).filter((f) => !f.users[0].disabled);
      const setOrg =
        organization.find((org) => org.id === orgHeader) || organization[0];

      // Usuario sem nenhuma organizacao (estado invalido): nega de forma limpa
      // em vez de estourar TypeError ao acessar setOrg.apiKey abaixo. O array
      // e sempre truthy, entao a checagem antiga (`!organization`) nunca pegava.
      if (!setOrg) {
        throw new HttpForbiddenException();
      }

      if (!setOrg.apiKey) {
        await this._organizationService.updateApiKey(setOrg.id);
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      req.user = user;

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      req.org = setOrg;

      await this.resolveProfileContext(
        req,
        setOrg.id,
        user.id,
        setOrg.users[0]?.role
      );
    } catch (err) {
      throw new HttpForbiddenException();
    }
    next();
  }

  // Resolve o contexto de perfil da requisicao. Org ADMIN/SUPERADMIN tem
  // acesso implicito a todos os perfis da org (sem linhas de ProfileMember);
  // org USER so acessa perfis onde possui membership. Nunca nega aqui —
  // rotas como /user/self precisam responder mesmo sem perfil para o
  // frontend renderizar o estado "aguardando atribuicao".
  private async resolveProfileContext(
    req: Request,
    orgId: string,
    userId: string,
    orgRole?: Role
  ) {
    const request = req as Request & {
      profile: unknown;
      profileRole: string | null;
      profileAccess: 'implicit' | 'member' | 'none';
    };
    const profileHeader = req.cookies.showprofile || req.headers.showprofile;
    const isOrgAdmin = orgRole === 'ADMIN' || orgRole === 'SUPERADMIN';

    if (isOrgAdmin) {
      const profiles = await this._profileService.getProfilesByOrgId(orgId);
      const setProfile =
        (profileHeader && profiles.find((p) => p.id === profileHeader)) ||
        profiles.find((p) => p.isDefault) ||
        profiles[0] ||
        null;
      request.profile = setProfile;
      request.profileRole = setProfile ? 'OWNER' : null;
      request.profileAccess = 'implicit';
      return;
    }

    const memberships = await this._profileService.getUserProfileMemberships(
      userId,
      orgId
    );
    if (!memberships.length) {
      request.profile = null;
      request.profileRole = null;
      request.profileAccess = 'none';
      return;
    }

    const profiles = await this._profileService.getProfilesByOrgId(orgId);
    const accessibleProfiles = profiles.filter((p) =>
      memberships.some((m) => m.profileId === p.id)
    );
    const setProfile =
      (profileHeader &&
        accessibleProfiles.find((p) => p.id === profileHeader)) ||
      accessibleProfiles.find((p) => p.isDefault) ||
      accessibleProfiles[0] ||
      null;
    request.profile = setProfile;
    request.profileRole = setProfile
      ? memberships.find((m) => m.profileId === setProfile.id)?.role ?? null
      : null;
    request.profileAccess = setProfile ? 'member' : 'none';
  }
}
