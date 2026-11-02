import 'reflect-metadata';
import { InstagramMessagingService } from './instagram-messaging.service';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { resolveIgRoute } from './instagram-route.resolver';

const VALID_TOKEN = 'EAA' + 'x'.repeat(60);

describe('refresh concorrente do token Instagram', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  it('interrompe o resolver sem fallback ou envio quando a autorizacao mudou', async () => {
    const credentials = createMock<CredentialService>();
    const entry = { igUserId: '123', token: VALID_TOKEN, refreshedAt: new Date(Date.now() - 2 * 86400000).toISOString() };
    credentials.getRaw.mockResolvedValue({ instagramTokens: JSON.stringify([entry]) });
    credentials.replaceInstagramTokenAfterRefresh.mockResolvedValue(false);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'REFRESHED' }) });
    await expect(resolveIgRoute({ organizationId: 'org', profileId: 'p', internalId: '123', token: 'PAGE-FALLBACK', providerIdentifier: 'instagram' }, new InstagramMessagingService(credentials))).rejects.toThrow('AUTHORIZATION_CHANGED');
    expect(credentials.updateMessagingTokens).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('InstagramMessagingService.loadState - canal sem perfil', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('canal sem perfil le a credencial da org, nunca de um perfil qualquer', async () => {
    const credentials = createMock<CredentialService>();
    credentials.getRawForOrgWide.mockResolvedValue({
      data: { metaSystemUserToken: 'SU-DEFAULT' },
      profileId: 'prof-default',
    });

    const state = await new InstagramMessagingService(credentials).loadState('org', null);

    expect(credentials.getRawForOrgWide).toHaveBeenCalledWith('org', 'facebook');
    expect(credentials.getRaw).not.toHaveBeenCalled();
    expect(state.metaSystemUserToken).toBe('SU-DEFAULT');
    expect(state.credentialProfileId).toBe('prof-default');
  });

  it('canal com perfil le so a credencial daquele perfil', async () => {
    const credentials = createMock<CredentialService>();
    credentials.getRaw.mockResolvedValue({ metaSystemUserToken: 'SU-P' });

    const state = await new InstagramMessagingService(credentials).loadState('org', 'p');

    expect(credentials.getRaw).toHaveBeenCalledWith('org', 'facebook', 'p');
    expect(credentials.getRawForOrgWide).not.toHaveBeenCalled();
    expect(state.credentialProfileId).toBe('p');
  });

  it('renovacao do token grava na mesma linha de onde a credencial foi lida', async () => {
    const credentials = createMock<CredentialService>();
    const entry = { igUserId: '123', token: VALID_TOKEN, refreshedAt: new Date(Date.now() - 2 * 86400000).toISOString() };
    credentials.getRawForOrgWide.mockResolvedValue({
      data: { instagramTokens: JSON.stringify([entry]) },
      profileId: 'prof-default',
    });
    credentials.replaceInstagramTokenAfterRefresh.mockResolvedValue(true);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'REFRESHED' }) });

    const token = await new InstagramMessagingService(credentials).resolveIgUserToken('org', null, '123');

    expect(token).toBe('REFRESHED');
    expect(credentials.replaceInstagramTokenAfterRefresh).toHaveBeenCalledWith(
      'org', 'prof-default', entry, 'REFRESHED'
    );
  });
});

// Roteia por substring da URL para nao depender da ordem das chamadas.
function routeFetch(routes: Array<[string, any]>) {
  return jest.fn().mockImplementation((url: string) => {
    const hit = routes.find(([fragment]) => url.includes(fragment));
    if (!hit) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: `sem rota para ${url}` } }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => hit[1] });
  });
}

describe('InstagramMessagingService.validateSystemUserToken', () => {
  let service: InstagramMessagingService;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    service = new InstagramMessagingService(createMock<CredentialService>());
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('nao deve pedir o campo business em /me (Graph #100 nonexisting field)', async () => {
    const fetchMock = routeFetch([
      ['/me?', { id: 'su-1', name: 'dashboard_user' }],
      ['/me/businesses', { data: [] }],
      ['/me/assigned_pages', { data: [] }],
      ['/me/accounts', { data: [] }],
    ]);
    global.fetch = fetchMock as any;

    await service.validateSystemUserToken(VALID_TOKEN);

    const meUrl = (fetchMock.mock.calls as any[]).find((c) =>
      String(c[0]).includes('/me?')
    )?.[0] as string;
    expect(meUrl).toContain('fields=id,name');
    expect(meUrl).not.toContain('business');
  });

  it('deve buscar contas em assigned_pages (edge do node System User)', async () => {
    global.fetch = routeFetch([
      ['/me?', { id: 'su-1', name: 'dashboard_user' }],
      ['/me/businesses', { data: [] }],
      [
        '/me/assigned_pages',
        {
          data: [
            {
              id: 'page-1',
              name: 'Pagina 1',
              instagram_business_account: { id: 'ig-1', username: 'conta1' },
            },
          ],
        },
      ],
      ['/me/accounts', { data: [] }],
    ]) as any;

    const result = await service.validateSystemUserToken(VALID_TOKEN);

    expect(result.ok).toBe(true);
    expect(result.pages).toEqual([
      { id: 'page-1', name: 'Pagina 1', igUserId: 'ig-1', username: 'conta1' },
    ]);
  });

  it('deve reprovar o token quando /me retorna erro do Graph', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Invalid OAuth access token.' },
      }),
    }) as any;

    const result = await service.validateSystemUserToken(VALID_TOKEN);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid OAuth access token.');
  });

  it('deve reprovar token vazio ou curto sem chamar a Graph', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    expect((await service.validateSystemUserToken('')).ok).toBe(false);
    expect((await service.validateSystemUserToken('curto')).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deve resolver businessId/businessName por /me/businesses', async () => {
    global.fetch = routeFetch([
      ['/me?', { id: 'su-1', name: 'dashboard_user' }],
      ['/me/businesses', { data: [{ id: 'biz-1', name: 'Solomo Media' }] }],
      ['/me/assigned_pages', { data: [] }],
      ['/me/accounts', { data: [] }],
      ['owned_pages', { data: [] }],
      ['client_pages', { data: [] }],
    ]) as any;

    const result = await service.validateSystemUserToken(VALID_TOKEN);

    expect(result.ok).toBe(true);
    expect(result.businessId).toBe('biz-1');
    expect(result.businessName).toBe('Solomo Media');
  });

  it('deve usar o nome do System User quando nao ha business acessivel', async () => {
    global.fetch = routeFetch([
      ['/me?', { id: 'su-1', name: 'dashboard_user' }],
      ['/me/businesses', { data: [] }],
      ['/me/assigned_pages', { data: [] }],
      ['/me/accounts', { data: [] }],
    ]) as any;

    const result = await service.validateSystemUserToken(VALID_TOKEN);

    expect(result.ok).toBe(true);
    expect(result.businessName).toBe('dashboard_user');
    expect(result.businessId).toBeUndefined();
  });

  it('deve descobrir contas IG via owned_pages quando /me/accounts vem vazio', async () => {
    global.fetch = routeFetch([
      ['/me?', { id: 'su-1', name: 'dashboard_user' }],
      ['/me/businesses', { data: [{ id: 'biz-1', name: 'Solomo Media' }] }],
      ['/me/assigned_pages', { data: [] }],
      ['/me/accounts', { data: [] }],
      [
        'owned_pages',
        {
          data: [
            {
              id: 'page-1',
              name: 'Pagina 1',
              instagram_business_account: { id: 'ig-1', username: 'conta1' },
            },
          ],
        },
      ],
      ['client_pages', { data: [] }],
    ]) as any;

    const result = await service.validateSystemUserToken(VALID_TOKEN);

    expect(result.ok).toBe(true);
    expect(result.pages).toEqual([
      {
        id: 'page-1',
        name: 'Pagina 1',
        igUserId: 'ig-1',
        username: 'conta1',
      },
    ]);
  });

  it('deve deduplicar pages repetidas entre /me/accounts e os assets do BM', async () => {
    const page = {
      id: 'page-1',
      name: 'Pagina 1',
      instagram_business_account: { id: 'ig-1', username: 'conta1' },
    };
    global.fetch = routeFetch([
      ['/me?', { id: 'su-1', name: 'dashboard_user' }],
      ['/me/businesses', { data: [{ id: 'biz-1', name: 'Solomo Media' }] }],
      ['/me/assigned_pages', { data: [] }],
      ['/me/accounts', { data: [page] }],
      ['owned_pages', { data: [page] }],
      ['client_pages', { data: [{ ...page, id: 'page-2', name: 'Pagina 2' }] }],
    ]) as any;

    const result = await service.validateSystemUserToken(VALID_TOKEN);

    expect(result.pages?.map((p) => p.id)).toEqual(['page-1', 'page-2']);
  });

  it('deve aprovar o token mesmo quando as edges opcionais falham', async () => {
    global.fetch = jest
      .fn()
      .mockImplementation((url: string) =>
        url.includes('/me?')
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ id: 'su-1', name: 'dashboard_user' }),
            })
          : Promise.reject(new Error('network down'))
      ) as any;

    const result = await service.validateSystemUserToken(VALID_TOKEN);

    expect(result.ok).toBe(true);
    expect(result.pages).toEqual([]);
  });
});
