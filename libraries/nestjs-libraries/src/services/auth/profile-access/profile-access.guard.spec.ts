import { ExecutionContext, HttpException } from '@nestjs/common';
import { ProfileAccessGuard } from './profile-access.guard';
import {
  NoProfileAssignedException,
  ProfileManageDeniedException,
  ProfileReadOnlyException,
} from './profile-access.exception';
import {
  ALLOW_VIEWER_KEY,
  PROFILE_MANAGE_KEY,
  SKIP_PROFILE_ACCESS_KEY,
} from './profile-access.decorators';

interface MakeContextOptions {
  path?: string;
  method?: string;
  org?: any;
  user?: any;
  profile?: any;
  profileRole?: string | null;
  params?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

const makeGuard = (
  metadata: Record<string, unknown> = {},
  profileService: any = {}
) => {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  };
  return new ProfileAccessGuard(reflector as any, profileService);
};

const makeContext = (options: MakeContextOptions = {}) => {
  const request = {
    path: options.path ?? '/posts',
    method: options.method ?? 'GET',
    org: options.org,
    user: options.user,
    profile: options.profile,
    profileRole: options.profileRole ?? null,
    params: options.params ?? {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
};

const orgWithRole = (role: string) => ({
  id: 'org-1',
  users: [{ role }],
});

const user = { id: 'user-1' };

describe('ProfileAccessGuard', () => {
  it('permite requisicao sem org e user (rota fora do AuthMiddleware)', async () => {
    const guard = makeGuard();
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('permite paths de bypass mesmo para user sem perfil', async () => {
    const guard = makeGuard();
    const context = makeContext({
      path: '/auth/login',
      org: orgWithRole('USER'),
      user,
      profile: null,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('NAO libera /oauth/authorize por substring — bloqueia USER sem perfil', async () => {
    const guard = makeGuard();
    const context = makeContext({
      path: '/oauth/authorize',
      method: 'POST',
      org: orgWithRole('USER'),
      user,
      profile: null,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NoProfileAssignedException
    );
  });

  it('permite handler marcado com SkipProfileAccess', async () => {
    const guard = makeGuard({ [SKIP_PROFILE_ACCESS_KEY]: true });
    const context = makeContext({
      org: orgWithRole('USER'),
      user,
      profile: null,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('permite org ADMIN mesmo sem perfil resolvido (org-wide legitimo)', async () => {
    const guard = makeGuard();
    const context = makeContext({
      org: orgWithRole('ADMIN'),
      user,
      profile: null,
      method: 'POST',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('bloqueia USER sem perfil com 403 NO_PROFILE_ASSIGNED', async () => {
    const guard = makeGuard();
    const context = makeContext({
      org: orgWithRole('USER'),
      user,
      profile: null,
    });

    try {
      await guard.canActivate(context);
      fail('deveria ter lancado');
    } catch (err) {
      expect(err).toBeInstanceOf(NoProfileAssignedException);
      expect((err as HttpException).getStatus()).toBe(403);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'NO_PROFILE_ASSIGNED',
      });
    }
  });

  it('bloqueia escrita de VIEWER com 403 PROFILE_READ_ONLY', async () => {
    const guard = makeGuard();
    const context = makeContext({
      org: orgWithRole('USER'),
      user,
      profile: { id: 'prof-1' },
      profileRole: 'VIEWER',
      method: 'POST',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ProfileReadOnlyException
    );
  });

  it('permite escrita de VIEWER quando a rota tem @AllowViewer (revisao)', async () => {
    const guard = makeGuard({ [ALLOW_VIEWER_KEY]: true });
    const context = makeContext({
      org: orgWithRole('USER'),
      user,
      profile: { id: 'prof-1' },
      profileRole: 'VIEWER',
      method: 'POST',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('permite leitura de VIEWER', async () => {
    const guard = makeGuard();
    const context = makeContext({
      org: orgWithRole('USER'),
      user,
      profile: { id: 'prof-1' },
      profileRole: 'VIEWER',
      method: 'GET',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('permite escrita de EDITOR', async () => {
    const guard = makeGuard();
    const context = makeContext({
      org: orgWithRole('USER'),
      user,
      profile: { id: 'prof-1' },
      profileRole: 'EDITOR',
      method: 'POST',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  describe('ProfileManage', () => {
    it('permite MANAGER do perfil alvo resolvido pelo param', async () => {
      const profileService = {
        getEffectiveProfileRole: jest.fn().mockResolvedValue('MANAGER'),
      };
      const guard = makeGuard(
        { [PROFILE_MANAGE_KEY]: { param: 'id' } },
        profileService
      );
      const context = makeContext({
        org: orgWithRole('USER'),
        user,
        profile: { id: 'prof-1' },
        profileRole: 'EDITOR',
        method: 'POST',
        params: { id: 'prof-alvo' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(profileService.getEffectiveProfileRole).toHaveBeenCalledWith(
        'org-1',
        'prof-alvo',
        'user-1',
        'USER'
      );
    });

    it('bloqueia EDITOR em rota de gestao com 403', async () => {
      const profileService = {
        getEffectiveProfileRole: jest.fn().mockResolvedValue('EDITOR'),
      };
      const guard = makeGuard(
        { [PROFILE_MANAGE_KEY]: { param: 'id' } },
        profileService
      );
      const context = makeContext({
        org: orgWithRole('USER'),
        user,
        profile: { id: 'prof-1' },
        profileRole: 'EDITOR',
        method: 'POST',
        params: { id: 'prof-alvo' },
      });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ProfileManageDeniedException
      );
    });

    it('usa o perfil ativo quando nao ha param configurado', async () => {
      const profileService = {
        getEffectiveProfileRole: jest.fn().mockResolvedValue('OWNER'),
      };
      const guard = makeGuard({ [PROFILE_MANAGE_KEY]: {} }, profileService);
      const context = makeContext({
        org: orgWithRole('USER'),
        user,
        profile: { id: 'prof-ativo' },
        profileRole: 'OWNER',
        method: 'PUT',
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(profileService.getEffectiveProfileRole).toHaveBeenCalledWith(
        'org-1',
        'prof-ativo',
        'user-1',
        'USER'
      );
    });

    it('permite ADMIN da org sem consultar membership', async () => {
      const profileService = {
        getEffectiveProfileRole: jest.fn(),
      };
      const guard = makeGuard(
        { [PROFILE_MANAGE_KEY]: { param: 'id' } },
        profileService
      );
      const context = makeContext({
        org: orgWithRole('ADMIN'),
        user,
        profile: { id: 'prof-1' },
        method: 'POST',
        params: { id: 'prof-alvo' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(profileService.getEffectiveProfileRole).not.toHaveBeenCalled();
    });
  });
});
