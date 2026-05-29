import { PublicAuthMiddleware } from './public.auth.middleware';

const makeOrgService = () => ({ getOrgByApiKey: jest.fn() });
const makeOauthService = () => ({ getOrgByOAuthToken: jest.fn() });
const makeProfileService = () => ({ getProfileByApiKey: jest.fn() });

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('PublicAuthMiddleware', () => {
  let middleware: PublicAuthMiddleware;
  let orgService: ReturnType<typeof makeOrgService>;
  let oauthService: ReturnType<typeof makeOauthService>;
  let profileService: ReturnType<typeof makeProfileService>;

  const originalStripe = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    orgService = makeOrgService();
    oauthService = makeOauthService();
    profileService = makeProfileService();
    middleware = new PublicAuthMiddleware(orgService as any, oauthService as any, profileService as any);
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterEach(() => {
    if (originalStripe !== undefined) process.env.STRIPE_SECRET_KEY = originalStripe;
    else delete process.env.STRIPE_SECRET_KEY;
  });

  it('retorna 401 quando sem header authorization', async () => {
    const req: any = { headers: {} };
    const res = makeRes();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('chave de perfil valida: seta publicApiProfileId e req.org com org do perfil', async () => {
    const fakeOrg = { id: 'org-1', subscription: null as any };
    profileService.getProfileByApiKey.mockResolvedValue({
      id: 'prof-1',
      organization: fakeOrg,
    });
    const req: any = { headers: { authorization: 'prof-key-abc' } };
    const res = makeRes();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(req.publicApiProfileId).toBe('prof-1');
    expect(req.org.id).toBe('org-1');
    expect(next).toHaveBeenCalled();
    expect(orgService.getOrgByApiKey).not.toHaveBeenCalled();
  });

  it('chave de perfil valida mas subscription ausente com STRIPE: retorna 401', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    profileService.getProfileByApiKey.mockResolvedValue({
      id: 'prof-1',
      organization: { id: 'org-1', subscription: null },
    });
    const req: any = { headers: { authorization: 'prof-key-abc' } };
    const res = makeRes();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('chave de org valida: comportamento atual inalterado', async () => {
    profileService.getProfileByApiKey.mockResolvedValue(null);
    const fakeOrg = { id: 'org-1', subscription: null as any };
    orgService.getOrgByApiKey.mockResolvedValue(fakeOrg);
    const req: any = { headers: { authorization: 'org-key-xyz' } };
    const res = makeRes();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(req.org.id).toBe('org-1');
    expect(req.publicApiProfileId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('nenhuma chave valida: retorna 401', async () => {
    profileService.getProfileByApiKey.mockResolvedValue(null);
    orgService.getOrgByApiKey.mockResolvedValue(null);
    const req: any = { headers: { authorization: 'invalid-key' } };
    const res = makeRes();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
