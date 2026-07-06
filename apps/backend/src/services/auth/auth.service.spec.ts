// NewsletterService.register roda no fluxo OAuth; mock evita chamada de rede.
jest.mock('@gitroom/nestjs-libraries/newsletter/newsletter.service', () => ({
  NewsletterService: { register: jest.fn().mockResolvedValue(undefined) },
}));

import { AuthService } from './auth.service';
import { AuthService as AuthChecker } from '@gitroom/helpers/auth/auth.service';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { Provider } from '@prisma/client';

const INVITE = {
  email: 'a@b.com',
  orgId: 'org-invited',
  role: 'USER' as const,
  id: 'inv-1',
  profileIds: ['prof-1'],
  profileRole: 'EDITOR' as const,
};

const makeDeps = () => ({
  userService: {
    getUserByEmail: jest.fn().mockResolvedValue(null),
    getUserByProvider: jest.fn().mockResolvedValue(null),
  },
  orgService: {
    getCount: jest.fn().mockResolvedValue(1),
    isInviteConsumed: jest.fn().mockResolvedValue(false),
    createOrgAndUser: jest.fn().mockResolvedValue({
      id: 'org-new',
      users: [{ user: { id: 'u-new', email: 'a@b.com' } }],
    }),
    addUserToOrg: jest.fn().mockResolvedValue({ organizationId: 'org-invited' }),
  },
  notificationService: {},
  emailService: { sendEmail: jest.fn().mockResolvedValue(undefined) },
  providerManager: { getProvider: jest.fn() },
});

const localBody = () =>
  Object.assign(new CreateOrgUserDto(), {
    email: 'a@b.com',
    password: 'secret',
    provider: Provider.LOCAL,
    company: 'ACME',
  });

describe('AuthService.routeAuth - registro com DISABLE_REGISTRATION', () => {
  let service: AuthService;
  let deps: ReturnType<typeof makeDeps>;
  let signSpy: jest.SpyInstance;
  const original = process.env.DISABLE_REGISTRATION;

  beforeEach(() => {
    deps = makeDeps();
    service = new AuthService(
      deps.userService as any,
      deps.orgService as any,
      deps.notificationService as any,
      deps.emailService as any,
      deps.providerManager as any
    );
    signSpy = jest.spyOn(AuthChecker, 'signJWT').mockReturnValue('signed-jwt');
    process.env.DISABLE_REGISTRATION = 'true';
  });

  afterEach(() => {
    signSpy.mockRestore();
    if (original === undefined) {
      delete process.env.DISABLE_REGISTRATION;
    } else {
      process.env.DISABLE_REGISTRATION = original;
    }
  });

  describe('provider LOCAL', () => {
    it('bloqueia registro sem convite quando registro publico desativado', async () => {
      await expect(
        service.routeAuth(Provider.LOCAL, localBody(), '127.0.0.1', 'agent', false)
      ).rejects.toThrow('Registration is disabled');
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('permite registro com convite valido e cria as memberships do convite', async () => {
      await service.routeAuth(
        Provider.LOCAL,
        localBody(),
        '127.0.0.1',
        'agent',
        INVITE
      );

      expect(deps.orgService.createOrgAndUser).toHaveBeenCalled();
      expect(deps.orgService.addUserToOrg).toHaveBeenCalledWith(
        'u-new',
        'inv-1',
        'org-invited',
        'USER',
        ['prof-1'],
        'EDITOR'
      );
    });

    it('nao consulta getCount quando ha convite valido (bypassa canRegister)', async () => {
      await service.routeAuth(
        Provider.LOCAL,
        localBody(),
        '127.0.0.1',
        'agent',
        INVITE
      );

      expect(deps.orgService.getCount).not.toHaveBeenCalled();
    });

    it('bloqueia quando o email do registrante nao bate com o convidado', async () => {
      const body = Object.assign(new CreateOrgUserDto(), {
        email: 'outro@x.com',
        password: 'secret',
        provider: Provider.LOCAL,
        company: 'ACME',
      });

      await expect(
        service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent', INVITE)
      ).rejects.toThrow('Registration is disabled');
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('bloqueia replay de convite ja consumido', async () => {
      deps.orgService.isInviteConsumed.mockResolvedValue(true);

      await expect(
        service.routeAuth(Provider.LOCAL, localBody(), '127.0.0.1', 'agent', INVITE)
      ).rejects.toThrow('Registration is disabled');
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('aceita convite com diferenca de caixa no email', async () => {
      const body = Object.assign(new CreateOrgUserDto(), {
        email: 'A@B.com',
        password: 'secret',
        provider: Provider.LOCAL,
        company: 'ACME',
      });

      await service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent', INVITE);

      expect(deps.orgService.createOrgAndUser).toHaveBeenCalled();
    });
  });

  describe('provider OAuth (GOOGLE)', () => {
    const oauthBody = () =>
      ({ company: 'ACME', providerToken: 'tok', provider: Provider.GOOGLE } as any);

    // Convite para a@gmail.com; a identidade Google confirmada precisa bater.
    const googleInvite = { ...INVITE, email: 'a@gmail.com' };

    beforeEach(() => {
      deps.providerManager.getProvider.mockReturnValue({
        getUser: jest.fn().mockResolvedValue({ id: 'g-1', email: 'a@gmail.com' }),
      });
    });

    it('bloqueia registro OAuth de usuario novo sem convite', async () => {
      await expect(
        service.routeAuth(Provider.GOOGLE, oauthBody(), '127.0.0.1', 'agent', false)
      ).rejects.toThrow('Registration is disabled');
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('permite registro OAuth com convite valido e email casando', async () => {
      await service.routeAuth(
        Provider.GOOGLE,
        oauthBody(),
        '127.0.0.1',
        'agent',
        googleInvite
      );

      expect(deps.orgService.createOrgAndUser).toHaveBeenCalled();
      expect(deps.orgService.addUserToOrg).toHaveBeenCalledWith(
        'u-new',
        'inv-1',
        'org-invited',
        'USER',
        ['prof-1'],
        'EDITOR'
      );
    });

    it('bloqueia registro OAuth quando o email Google nao bate com o convidado', async () => {
      await expect(
        service.routeAuth(Provider.GOOGLE, oauthBody(), '127.0.0.1', 'agent', {
          ...INVITE,
          email: 'diferente@gmail.com',
        })
      ).rejects.toThrow('Registration is disabled');
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('faz login de usuario OAuth existente mesmo sem convite (nao registra)', async () => {
      deps.userService.getUserByProvider.mockResolvedValue({
        id: 'u-existing',
        email: 'a@gmail.com',
      });

      const result = await service.routeAuth(
        Provider.GOOGLE,
        oauthBody(),
        '127.0.0.1',
        'agent',
        false
      );

      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
      expect((result as any).jwt).toBe('signed-jwt');
    });
  });
});
