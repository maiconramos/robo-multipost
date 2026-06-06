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
