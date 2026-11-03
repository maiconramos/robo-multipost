jest.mock('@gitroom/backend/services/auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));

import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';
import {
  ThrottlerFarcasterLoginGuard,
  ThrottlerLocalLoginGuard,
  ThrottlerRealIpGuard,
} from '@gitroom/nestjs-libraries/throttler/throttler.provider';

const REQUEST_ID = 'A'.repeat(32);

const response = () => {
  const res: any = {};
  res.cookie = jest.fn(() => res);
  res.clearCookie = jest.fn(() => res);
  res.header = jest.fn(() => res);
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
};

// Login com Farcaster (upstream #2078): signer amarrado ao navegador por cookie
// httpOnly, code (requestId opaco) de uso unico e gate/limite na troca do code.
describe('AuthController — login com Farcaster', () => {
  const setup = () => {
    const farcaster = {
      startLogin: jest.fn().mockResolvedValue({
        body: { requestId: REQUEST_ID, approvalUrl: 'https://x', qrCode: 'q' },
        nonce: 'nonce-1',
      }),
      loginStatus: jest.fn().mockResolvedValue({ status: 'pending_approval' }),
      claimLoginCode: jest.fn().mockResolvedValue(undefined),
      releaseLoginClaim: jest.fn().mockResolvedValue(undefined),
      consumeLogin: jest.fn().mockResolvedValue(undefined),
    };
    const authService = {
      checkExists: jest.fn(),
      consumeOAuthLoginNonce: jest.fn().mockResolvedValue(undefined),
      routeAuth: jest.fn().mockResolvedValue({ jwt: 'jwt', addedOrg: false }),
      getOrgFromCookie: jest.fn().mockReturnValue(undefined),
    };
    const emailService = { hasProvider: jest.fn().mockReturnValue(false) };
    const controller = new AuthController(
      authService as any,
      emailService as any,
      farcaster as any
    );
    return { controller, farcaster, authService };
  };

  it('POST /farcaster/signer grava o nonce num cookie httpOnly e devolve so o requestId', async () => {
    const { controller } = setup();
    const res = response();

    const body = await controller.farcasterSigner(res);

    expect(body).toEqual({
      requestId: REQUEST_ID,
      approvalUrl: 'https://x',
      qrCode: 'q',
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'farcaster_login',
      'nonce-1',
      expect.objectContaining({ httpOnly: true })
    );
  });

  it('sem nonce (falha ao criar) nao grava cookie', async () => {
    const { controller, farcaster } = setup();
    farcaster.startLogin.mockResolvedValue({ body: { error: 'failed' } });
    const res = response();

    await expect(controller.farcasterSigner(res)).resolves.toEqual({
      error: 'failed',
    });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('status repassa o requestId do corpo e o cookie', async () => {
    const { controller, farcaster } = setup();

    await controller.farcasterSignerStatus(
      { cookies: { farcaster_login: 'nonce-1' } } as any,
      { requestId: REQUEST_ID }
    );

    expect(farcaster.loginStatus).toHaveBeenCalledWith(REQUEST_ID, 'nonce-1');
  });

  it('gate do login desligado (404) vem do service e sobe', async () => {
    const { controller, farcaster } = setup();
    farcaster.startLogin.mockRejectedValue(new HttpException('disabled', 404));

    const error = await controller.farcasterSigner(response()).catch((e) => e);
    expect(error.getStatus()).toBe(404);
  });

  it('exists FARCASTER confere o vinculo antes do checkExists e consome no login', async () => {
    const { controller, farcaster, authService } = setup();
    authService.checkExists.mockResolvedValue({ jwt: 'jwt' });
    const res = response();

    await controller.oauthExists(
      { cookies: { farcaster_login: 'nonce-1' } } as any,
      REQUEST_ID,
      undefined as any,
      'FARCASTER',
      res
    );

    expect(farcaster.claimLoginCode).toHaveBeenCalledWith(REQUEST_ID, 'nonce-1');
    expect(farcaster.claimLoginCode.mock.invocationCallOrder[0]).toBeLessThan(
      authService.checkExists.mock.invocationCallOrder[0]
    );
    expect(farcaster.consumeLogin).toHaveBeenCalledWith(REQUEST_ID);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'farcaster_login',
      expect.any(Object)
    );
  });

  it('exists FARCASTER de conta nova devolve o token sem consumir (o cadastro consome)', async () => {
    const { controller, farcaster, authService } = setup();
    authService.checkExists.mockResolvedValue({ token: REQUEST_ID });
    const res = response();

    await controller.oauthExists(
      { cookies: { farcaster_login: 'nonce-1' } } as any,
      REQUEST_ID,
      undefined as any,
      'FARCASTER',
      res
    );

    expect(res.json).toHaveBeenCalledWith({ token: REQUEST_ID });
    expect(farcaster.releaseLoginClaim).toHaveBeenCalledWith(REQUEST_ID);
    expect(farcaster.consumeLogin).not.toHaveBeenCalled();
  });

  it('exists com code de outro navegador e recusado antes do checkExists', async () => {
    const { controller, farcaster, authService } = setup();
    farcaster.claimLoginCode.mockRejectedValue(new HttpException('x', 400));

    const error = await controller
      .oauthExists({ cookies: {} } as any, REQUEST_ID, undefined as any, 'FARCASTER', response())
      .catch((e) => e);

    expect(error.getStatus()).toBe(400);
    expect(authService.checkExists).not.toHaveBeenCalled();
  });

  it('exists de outros providers nao passa pelo Farcaster', async () => {
    const { controller, farcaster, authService } = setup();
    authService.checkExists.mockResolvedValue({ jwt: 'jwt' });

    await controller.oauthExists(
      { cookies: {} } as any,
      'code',
      undefined as any,
      'GOOGLE',
      response()
    );

    expect(farcaster.claimLoginCode).not.toHaveBeenCalled();
    expect(farcaster.consumeLogin).not.toHaveBeenCalled();
  });

  it.each(['register', 'login'] as const)(
    '/%s com FARCASTER confere o vinculo e consome o code',
    async (route) => {
      const { controller, farcaster, authService } = setup();
      const req = { cookies: { farcaster_login: 'nonce-1' } } as any;
      const body = { provider: 'FARCASTER', providerToken: REQUEST_ID } as any;
      const res = response();

      if (route === 'register') {
        await controller.register(req, body, res, 'ip', 'ua', 'pt');
      } else {
        await controller.login(req, body, res, 'ip', 'ua');
      }

      expect(farcaster.claimLoginCode).toHaveBeenCalledWith(REQUEST_ID, 'nonce-1');
      expect(authService.routeAuth).toHaveBeenCalled();
      expect(farcaster.claimLoginCode.mock.invocationCallOrder[0]).toBeLessThan(authService.routeAuth.mock.invocationCallOrder[0]);
      expect(farcaster.consumeLogin).toHaveBeenCalledWith(REQUEST_ID);
    }
  );

  it.each(['register', 'login'] as const)('/%s nao entrega sessao quando perde o consumo', async (route) => {
    const { controller, farcaster } = setup();
    farcaster.consumeLogin.mockRejectedValue(new HttpException('Invalid code', 400));
    const req = { cookies: { farcaster_login: 'nonce-1' } } as any;
    const body = { provider: 'FARCASTER', providerToken: REQUEST_ID } as any;
    const res = response();
    if (route === 'register') await controller.register(req, body, res, 'ip', 'ua', 'pt');
    else await controller.login(req, body, res, 'ip', 'ua');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.cookie).not.toHaveBeenCalledWith('auth', expect.anything(), expect.anything());
  });

  it('/register com code recusado responde 400 sem routeAuth', async () => {
    const { controller, farcaster, authService } = setup();
    farcaster.claimLoginCode.mockRejectedValue(
      new HttpException({ message: 'Invalid or expired Farcaster login' }, 400)
    );
    const res = response();

    await controller.register(
      { cookies: {} } as any,
      { provider: 'FARCASTER', providerToken: REQUEST_ID } as any,
      res,
      'ip',
      'ua',
      'pt'
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(authService.routeAuth).not.toHaveBeenCalled();
    expect(farcaster.consumeLogin).not.toHaveBeenCalled();
  });

  it('as rotas do Farcaster e as de troca do code tem os guards de limite', () => {
    const guards = (method: keyof AuthController) =>
      Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype[method]);

    expect(guards('farcasterSigner')).toEqual([ThrottlerRealIpGuard]);
    expect(guards('farcasterSignerStatus')).toEqual([ThrottlerRealIpGuard]);
    expect(guards('oauthExists')).toEqual([ThrottlerFarcasterLoginGuard]);
    expect(guards('register')).toEqual([ThrottlerFarcasterLoginGuard]);
    // login por senha tem o proprio limite por IP
    expect(guards('login')).toEqual([
      ThrottlerFarcasterLoginGuard,
      ThrottlerLocalLoginGuard,
    ]);
  });
});

describe('AuthController — login social preso ao navegador', () => {
  const setup = () => {
    const authService = {
      issueOAuthLoginNonce: jest.fn().mockResolvedValue('nonce-xyz'),
      consumeOAuthLoginNonce: jest.fn().mockResolvedValue(undefined),
      oauthLink: jest.fn().mockReturnValue('https://github.com/login/oauth/authorize?x'),
      checkExists: jest.fn().mockResolvedValue({ jwt: 'jwt' }),
    };
    const controller = new AuthController(
      authService as any,
      { hasProvider: jest.fn() } as any,
      {} as any
    );
    return { controller, authService };
  };

  it('GET /oauth/:provider grava o nonce em cookie httpOnly', async () => {
    const { controller } = setup();
    const res = response();

    const link = await controller.oauthLink('GITHUB', {}, res);

    expect(link).toContain('github.com');
    expect(res.cookie).toHaveBeenCalledWith(
      'oauth_login',
      'nonce-xyz',
      expect.objectContaining({ httpOnly: true })
    );
  });

  it('troca do code exige o cookie do mesmo navegador antes de chamar o provedor', async () => {
    const { controller, authService } = setup();
    authService.consumeOAuthLoginNonce.mockRejectedValue(
      new HttpException('Login expirado ou iniciado em outro navegador. Tente entrar de novo.', 400)
    );

    await expect(
      controller.oauthExists(
        { cookies: {} } as any,
        'code-do-atacante',
        '',
        'GITHUB',
        response()
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(authService.consumeOAuthLoginNonce).toHaveBeenCalledWith('GITHUB', undefined);
    expect(authService.checkExists).not.toHaveBeenCalled();
  });
});
