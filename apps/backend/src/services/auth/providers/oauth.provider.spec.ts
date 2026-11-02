import { OauthProvider } from './oauth.provider';

describe('OauthProvider.getUser (GENERIC)', () => {
  const originalFetch = global.fetch;
  const env = { ...process.env };

  beforeEach(() => {
    process.env.POSTIZ_OAUTH_USERINFO_URL = 'https://idp.exemplo.com/userinfo';
    process.env.POSTIZ_OAUTH_TOKEN_URL = 'https://idp.exemplo.com/token';
    process.env.POSTIZ_OAUTH_AUTH_URL = 'https://idp.exemplo.com/auth';
    process.env.POSTIZ_OAUTH_CLIENT_ID = 'cid';
    process.env.POSTIZ_OAUTH_CLIENT_SECRET = 'csecret';
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
    process.env = { ...env };
  });

  const userinfo = (json: unknown) =>
    ((global as any).fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => json, text: async () => '' }));

  it('devolve o sub como id', async () => {
    userinfo({ sub: 'abc-1', email: 'a@b.com' });
    await expect(new OauthProvider().getUser('tok')).resolves.toEqual({
      email: 'a@b.com',
      id: 'abc-1',
    });
  });

  it('resposta sem sub e recusada (nao vira login em outra conta GENERIC)', async () => {
    userinfo({ email: 'a@b.com', id: 7 });
    await expect(new OauthProvider().getUser('tok')).rejects.toThrow('sub');
  });
});
