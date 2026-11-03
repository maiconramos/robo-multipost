// NewsletterService.register roda no fluxo OAuth; mock evita chamada de rede.
jest.mock('@gitroom/nestjs-libraries/newsletter/newsletter.service', () => ({
  NewsletterService: { register: jest.fn().mockResolvedValue(undefined) },
}));

import { AuthService, boundProviderTokenKey } from './auth.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
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
      users: [{ user: { id: 'u-self', email: 'a@b.com' } }],
    }),
    createUserForInvite: jest
      .fn()
      .mockResolvedValue({ id: 'u-new', email: 'a@b.com' }),
    createOrgForUser: jest.fn().mockResolvedValue({ id: 'org-fallback' }),
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

    it('registro via convite NAO cria workspace pessoal, so entra no convidado', async () => {
      await service.routeAuth(
        Provider.LOCAL,
        localBody(),
        '127.0.0.1',
        'agent',
        INVITE
      );

      expect(deps.orgService.createUserForInvite).toHaveBeenCalled();
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
      expect(deps.orgService.addUserToOrg).toHaveBeenCalledWith(
        'u-new',
        'inv-1',
        'org-invited',
        'USER',
        ['prof-1'],
        'EDITOR'
      );
    });

    it('cria workspace pessoal de fallback quando a entrada no convite falha', async () => {
      // addUserToOrg falha (ex.: tier sem team / convite consumido / corrida)
      deps.orgService.addUserToOrg.mockResolvedValue(false);

      await service.routeAuth(
        Provider.LOCAL,
        localBody(),
        '127.0.0.1',
        'agent',
        INVITE
      );

      expect(deps.orgService.createUserForInvite).toHaveBeenCalled();
      expect(deps.orgService.createOrgForUser).toHaveBeenCalledWith(
        'u-new',
        'ACME',
        undefined
      );
    });

    it('auto-cadastro (sem convite) cria workspace pessoal', async () => {
      // registro publico permitido
      process.env.DISABLE_REGISTRATION = 'false';

      await service.routeAuth(
        Provider.LOCAL,
        localBody(),
        '127.0.0.1',
        'agent',
        false
      );

      expect(deps.orgService.createOrgAndUser).toHaveBeenCalled();
      expect(deps.orgService.createUserForInvite).not.toHaveBeenCalled();
      expect(deps.orgService.addUserToOrg).not.toHaveBeenCalled();
    });

    it('normaliza email de novo cadastro local antes de buscar e persistir', async () => {
      process.env.DISABLE_REGISTRATION = 'false';
      const body = localBody();
      body.email = 'New.User@Example.COM';

      await service.routeAuth(
        Provider.LOCAL,
        body,
        '127.0.0.1',
        'agent',
        false
      );

      expect(deps.userService.getUserByEmail).toHaveBeenCalledWith(
        'new.user@example.com'
      );
      expect(deps.orgService.createOrgAndUser.mock.calls[0][0].email).toBe(
        'new.user@example.com'
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

      expect(deps.orgService.createUserForInvite).toHaveBeenCalled();
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
    });
  });

  describe('provider OAuth (GOOGLE)', () => {
    const oauthBody = () =>
      ({ company: 'ACME', providerToken: 'tok', provider: Provider.GOOGLE } as any);

    // Convite para a@gmail.com; a identidade Google confirmada precisa bater.
    const googleInvite = { ...INVITE, email: 'a@gmail.com' };

    beforeEach(async () => {
      deps.providerManager.getProvider.mockReturnValue({
        getUser: jest.fn().mockResolvedValue({ id: 'g-1', email: 'a@gmail.com' }),
      });
      // token saido da nossa troca de code (checkExists)
      await ioRedis.set(boundProviderTokenKey('GOOGLE', 'tok')!, '1', 'EX', 60);
    });

    it('recusa access token que nao saiu da troca de code desta instancia', async () => {
      await ioRedis.del(boundProviderTokenKey('GOOGLE', 'tok')!);
      deps.userService.getUserByProvider.mockResolvedValue({
        id: 'u-vitima',
        email: 'a@gmail.com',
      });

      await expect(
        service.routeAuth(Provider.GOOGLE, oauthBody(), '127.0.0.1', 'agent', false)
      ).rejects.toThrow('Invalid provider token');
      expect(deps.providerManager.getProvider().getUser).not.toHaveBeenCalled();
    });

    it('token da troca de code vale uma vez so', async () => {
      process.env.DISABLE_REGISTRATION = 'false';
      await service.routeAuth(Provider.GOOGLE, oauthBody(), '127.0.0.1', 'agent', false);

      await expect(
        service.routeAuth(Provider.GOOGLE, oauthBody(), '127.0.0.1', 'agent', false)
      ).rejects.toThrow('Invalid provider token');
    });

    it('bloqueia registro OAuth de usuario novo sem convite', async () => {
      await expect(
        service.routeAuth(Provider.GOOGLE, oauthBody(), '127.0.0.1', 'agent', false)
      ).rejects.toThrow('Registration is disabled');
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('registro OAuth via convite NAO cria workspace pessoal', async () => {
      await service.routeAuth(
        Provider.GOOGLE,
        oauthBody(),
        '127.0.0.1',
        'agent',
        googleInvite
      );

      expect(deps.orgService.createUserForInvite).toHaveBeenCalled();
      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
      expect(deps.orgService.addUserToOrg).toHaveBeenCalledWith(
        'u-new',
        'inv-1',
        'org-invited',
        'USER',
        ['prof-1'],
        'EDITOR'
      );
    });

    it('auto-cadastro OAuth (sem convite) cria workspace pessoal', async () => {
      process.env.DISABLE_REGISTRATION = 'false';

      await service.routeAuth(
        Provider.GOOGLE,
        oauthBody(),
        '127.0.0.1',
        'agent',
        false
      );

      expect(deps.orgService.createOrgAndUser).toHaveBeenCalled();
      expect(deps.orgService.createUserForInvite).not.toHaveBeenCalled();
    });

    it('usuario OAuth existente com convite entra no workspace convidado', async () => {
      deps.userService.getUserByProvider.mockResolvedValue({
        id: 'u-existing',
        email: 'a@gmail.com',
      });

      await service.routeAuth(
        Provider.GOOGLE,
        oauthBody(),
        '127.0.0.1',
        'agent',
        googleInvite
      );

      expect(deps.orgService.createOrgAndUser).not.toHaveBeenCalled();
      expect(deps.orgService.createUserForInvite).not.toHaveBeenCalled();
      expect(deps.orgService.addUserToOrg).toHaveBeenCalledWith(
        'u-existing',
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

describe('AuthService.forgotReturn - link de redefinicao de uso unico', () => {
  let service: AuthService;
  let deps: ReturnType<typeof makeDeps> & {
    userService: { getUserById: jest.Mock; updatePassword: jest.Mock };
  };
  let verifySpy: jest.SpyInstance;
  const nowIat = () => Math.floor(Date.now() / 1000);
  const future = () => new Date(Date.now() + 10 * 60_000).toISOString();
  const body = { token: 'reset-jwt', password: 'nova', repeatPassword: 'nova' } as any;

  beforeEach(() => {
    const base = makeDeps();
    deps = {
      ...base,
      userService: {
        ...base.userService,
        getUserById: jest.fn(),
        updatePassword: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
    } as any;
    service = new AuthService(
      deps.userService as any,
      deps.orgService as any,
      deps.notificationService as any,
      deps.emailService as any,
      deps.providerManager as any
    );
    verifySpy = jest.spyOn(AuthChecker, 'verifyJWT');
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  it('troca a senha com link valido ainda nao usado', async () => {
    verifySpy.mockReturnValue({ id: 'user-1', expires: future(), iat: nowIat() - 60 });
    deps.userService.getUserById.mockResolvedValue({
      id: 'user-1',
      providerName: Provider.LOCAL,
      sessionsValidAfter: null,
    });

    await expect(service.forgotReturn(body)).resolves.toBeTruthy();
    expect(deps.userService.updatePassword).toHaveBeenCalledWith('user-1', 'nova');
  });

  it('recusa reusar o link depois da troca de senha', async () => {
    verifySpy.mockReturnValue({ id: 'user-1', expires: future(), iat: nowIat() - 120 });
    deps.userService.getUserById.mockResolvedValue({
      id: 'user-1',
      providerName: Provider.LOCAL,
      sessionsValidAfter: new Date(Date.now() - 30_000),
    });

    await expect(service.forgotReturn(body)).resolves.toBe(false);
    expect(deps.userService.updatePassword).not.toHaveBeenCalled();
  });

  it('recusa link expirado sem consultar o banco', async () => {
    verifySpy.mockReturnValue({
      id: 'user-1',
      expires: new Date(Date.now() - 60_000).toISOString(),
      iat: nowIat() - 1800,
    });

    await expect(service.forgotReturn(body)).resolves.toBe(false);
    expect(deps.userService.getUserById).not.toHaveBeenCalled();
  });
});

describe('AuthService.getInviteForUser - convite preso ao e-mail (join-org)', () => {
  let service: AuthService;
  let verifySpy: jest.SpyInstance;
  const invite = (email?: string) => ({
    ...(email ? { email } : {}),
    orgId: 'org-1',
    id: 'inv-1',
    role: 'ADMIN',
    timeLimit: new Date(Date.now() + 3600_000).toISOString(),
  });

  beforeEach(() => {
    const deps = makeDeps();
    service = new AuthService(
      deps.userService as any,
      deps.orgService as any,
      deps.notificationService as any,
      deps.emailService as any,
      deps.providerManager as any
    );
    verifySpy = jest.spyOn(AuthChecker, 'verifyJWT');
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  it('convite para outro e-mail e recusado para a conta logada', () => {
    verifySpy.mockReturnValue(invite('convidado@empresa.com'));

    expect(service.getInviteForUser('jwt', 'outra@pessoa.com')).toBe(false);
  });

  it('convite para o mesmo e-mail (sem diferenciar maiusculas) e aceito', () => {
    verifySpy.mockReturnValue(invite('Convidado@Empresa.com'));

    expect(service.getInviteForUser('jwt', 'convidado@empresa.com ')).toMatchObject({ orgId: 'org-1' });
  });

  it('convite so com link (sem e-mail) continua valendo para quem tem o link', () => {
    verifySpy.mockReturnValue(invite());

    expect(service.getInviteForUser('jwt', 'qualquer@pessoa.com')).toMatchObject({ orgId: 'org-1' });
  });
});


describe('AuthService.checkExists - token de conta nova fica preso a esta instancia', () => {
  it('marca o token devolvido para o registro', async () => {
    const deps = makeDeps();
    deps.providerManager.getProvider.mockReturnValue({
      getToken: jest.fn().mockResolvedValue('novo-token'),
      getUser: jest.fn().mockResolvedValue({ id: 'gh-9', email: 'n@b.com' }),
    });
    const service = new AuthService(
      deps.userService as any,
      deps.orgService as any,
      deps.notificationService as any,
      deps.emailService as any,
      deps.providerManager as any
    );

    await expect(service.checkExists('GITHUB', 'code-1')).resolves.toEqual({ token: 'novo-token' });
    expect(await ioRedis.get(boundProviderTokenKey('GITHUB', 'novo-token')!)).toBe('1');
  });
});

describe('AuthService - nonce do login social', () => {
  const build = () => {
    const deps = makeDeps();
    return new AuthService(
      deps.userService as any,
      deps.orgService as any,
      deps.notificationService as any,
      deps.emailService as any,
      deps.providerManager as any
    );
  };

  it('nonce emitido vale uma vez para o mesmo provedor', async () => {
    const service = build();
    const nonce = await service.issueOAuthLoginNonce('github');
    expect(nonce).toEqual(expect.any(String));

    await expect(service.consumeOAuthLoginNonce('GITHUB', nonce)).resolves.toBeUndefined();
    await expect(service.consumeOAuthLoginNonce('GITHUB', nonce)).rejects.toMatchObject({ status: 400 });
  });

  it('celular e notebook entrando ao mesmo tempo: cada um usa o seu, nenhum derruba o outro', async () => {
    const service = build();
    const celular = await service.issueOAuthLoginNonce('GOOGLE');
    const notebook = await service.issueOAuthLoginNonce('GOOGLE');
    expect(celular).not.toBe(notebook);

    await expect(service.consumeOAuthLoginNonce('GOOGLE', notebook)).resolves.toBeUndefined();
    await expect(service.consumeOAuthLoginNonce('GOOGLE', celular)).resolves.toBeUndefined();
  });

  it('sem cookie, ou cookie de outro provedor, recusa', async () => {
    const service = build();
    const nonce = await service.issueOAuthLoginNonce('GOOGLE');

    await expect(service.consumeOAuthLoginNonce('GITHUB', nonce)).rejects.toMatchObject({ status: 400 });
    await expect(service.consumeOAuthLoginNonce('GOOGLE', undefined)).rejects.toMatchObject({ status: 400 });
  });

  it('login por senha, Farcaster e carteira nao usam o nonce', async () => {
    const service = build();
    await expect(service.issueOAuthLoginNonce('LOCAL')).resolves.toBeNull();
    await expect(service.consumeOAuthLoginNonce('FARCASTER', undefined)).resolves.toBeUndefined();
    await expect(service.consumeOAuthLoginNonce('WALLET', undefined)).resolves.toBeUndefined();
  });
});
