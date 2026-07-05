// MastraService e importado pelo middleware (nao usado em use()) e carrega a
// stack do mastra/pgvector; mockamos para o jest nao tentar resolve-la.
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class MastraServiceMock {},
}));

import { AuthMiddleware } from './auth.middleware';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';

const makeReqRes = () => {
  const req: any = { headers: { auth: 'signed.jwt.token' }, cookies: {} };
  const res: any = { cookie: jest.fn(), header: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
};

describe('AuthMiddleware - resolucao de perfil', () => {
  let middleware: AuthMiddleware;
  let users: ReturnType<typeof createMock<UsersService>>;
  let orgs: ReturnType<typeof createMock<OrganizationService>>;
  let profiles: ReturnType<typeof createMock<ProfileService>>;
  let verifySpy: jest.SpyInstance;

  const makeOrg = (role: 'USER' | 'ADMIN' | 'SUPERADMIN') => ({
    id: 'org-1',
    createdAt: new Date(),
    apiKey: 'org-key',
    users: [{ role, disabled: false }],
  });

  const orgProfiles = [
    { id: 'prof-default', isDefault: true },
    { id: 'prof-client-1', isDefault: false },
    { id: 'prof-client-2', isDefault: false },
  ];

  beforeEach(() => {
    users = createMock<UsersService>();
    orgs = createMock<OrganizationService>();
    profiles = createMock<ProfileService>();
    middleware = new AuthMiddleware(orgs as any, users as any, profiles as any);
    verifySpy = jest.spyOn(AuthService, 'verifyJWT');
    verifySpy.mockReturnValue({ id: 'user-1' } as any);
    users.getUserById.mockResolvedValue({
      id: 'user-1',
      activated: true,
      password: 'hash',
    } as any);
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  it('admin recebe acesso implicito a todos os perfis e cai no default', async () => {
    orgs.getOrgsByUserId.mockResolvedValue([makeOrg('ADMIN')] as any);
    profiles.getProfilesByOrgId.mockResolvedValue(orgProfiles as any);
    const { req, res, next } = makeReqRes();

    await middleware.use(req, res, next);

    expect(req.profile).toEqual(orgProfiles[0]);
    expect(req.profileRole).toBe('OWNER');
    expect(req.profileAccess).toBe('implicit');
    expect(profiles.getUserProfileMemberships).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('admin com cookie showprofile de perfil da org ativa esse perfil', async () => {
    orgs.getOrgsByUserId.mockResolvedValue([makeOrg('SUPERADMIN')] as any);
    profiles.getProfilesByOrgId.mockResolvedValue(orgProfiles as any);
    const { req, res, next } = makeReqRes();
    req.cookies.showprofile = 'prof-client-2';

    await middleware.use(req, res, next);

    expect(req.profile).toEqual(orgProfiles[2]);
    expect(req.profileRole).toBe('OWNER');
    expect(req.profileAccess).toBe('implicit');
    expect(next).toHaveBeenCalled();
  });

  it('admin de org sem perfis recebe profile null com acesso implicito', async () => {
    orgs.getOrgsByUserId.mockResolvedValue([makeOrg('ADMIN')] as any);
    profiles.getProfilesByOrgId.mockResolvedValue([] as any);
    const { req, res, next } = makeReqRes();

    await middleware.use(req, res, next);

    expect(req.profile).toBeNull();
    expect(req.profileRole).toBeNull();
    expect(req.profileAccess).toBe('implicit');
    expect(next).toHaveBeenCalled();
  });

  it('user com membership resolve perfil e role da membership', async () => {
    orgs.getOrgsByUserId.mockResolvedValue([makeOrg('USER')] as any);
    profiles.getProfilesByOrgId.mockResolvedValue(orgProfiles as any);
    profiles.getUserProfileMemberships.mockResolvedValue([
      { profileId: 'prof-client-1', role: 'VIEWER' },
    ] as any);
    const { req, res, next } = makeReqRes();

    await middleware.use(req, res, next);

    expect(req.profile).toEqual(orgProfiles[1]);
    expect(req.profileRole).toBe('VIEWER');
    expect(req.profileAccess).toBe('member');
    expect(next).toHaveBeenCalled();
  });

  it('user com cookie de perfil sem membership cai no primeiro perfil acessivel', async () => {
    orgs.getOrgsByUserId.mockResolvedValue([makeOrg('USER')] as any);
    profiles.getProfilesByOrgId.mockResolvedValue(orgProfiles as any);
    profiles.getUserProfileMemberships.mockResolvedValue([
      { profileId: 'prof-client-1', role: 'EDITOR' },
    ] as any);
    const { req, res, next } = makeReqRes();
    req.cookies.showprofile = 'prof-client-2';

    await middleware.use(req, res, next);

    expect(req.profile).toEqual(orgProfiles[1]);
    expect(req.profileRole).toBe('EDITOR');
    expect(req.profileAccess).toBe('member');
    expect(next).toHaveBeenCalled();
  });

  it('user sem membership recebe profile null e acesso none sem lancar', async () => {
    orgs.getOrgsByUserId.mockResolvedValue([makeOrg('USER')] as any);
    profiles.getUserProfileMemberships.mockResolvedValue([] as any);
    const { req, res, next } = makeReqRes();

    await middleware.use(req, res, next);

    expect(req.profile).toBeNull();
    expect(req.profileRole).toBeNull();
    expect(req.profileAccess).toBe('none');
    expect(next).toHaveBeenCalled();
  });
});

describe('AuthMiddleware - re-resolucao de usuario do banco', () => {
  let middleware: AuthMiddleware;
  let users: ReturnType<typeof createMock<UsersService>>;
  let verifySpy: jest.SpyInstance;

  beforeEach(() => {
    users = createMock<UsersService>();
    middleware = new AuthMiddleware(
      createMock<OrganizationService>() as any,
      users as any,
      createMock<ProfileService>() as any
    );
    verifySpy = jest.spyOn(AuthService, 'verifyJWT');
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  it('rejeita quando o token nao tem id, sem consultar o banco', async () => {
    verifySpy.mockReturnValue({} as any);
    const { req, res, next } = makeReqRes();

    await expect(middleware.use(req, res, next)).rejects.toBeDefined();
    expect(users.getUserById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('re-resolve o usuario pelo id do token e rejeita se nao existe no banco', async () => {
    verifySpy.mockReturnValue({ id: 'user-1', isSuperAdmin: true } as any);
    users.getUserById.mockResolvedValue(null as any);
    const { req, res, next } = makeReqRes();

    await expect(middleware.use(req, res, next)).rejects.toBeDefined();
    // prova que NAO confia no token: vai ao banco pelo id
    expect(users.getUserById).toHaveBeenCalledWith('user-1');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita usuario nao ativado mesmo com token valido (activated vem do banco)', async () => {
    verifySpy.mockReturnValue({ id: 'user-1', activated: true } as any);
    users.getUserById.mockResolvedValue({
      id: 'user-1',
      activated: false,
    } as any);
    const { req, res, next } = makeReqRes();

    await expect(middleware.use(req, res, next)).rejects.toBeDefined();
    expect(users.getUserById).toHaveBeenCalledWith('user-1');
    expect(next).not.toHaveBeenCalled();
  });
});
