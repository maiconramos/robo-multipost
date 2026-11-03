import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { FacebookAutomationSetupService } from './facebook-automation-setup.service';
import { FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS } from './facebook-comment-automation.adapter';

describe('FacebookAutomationSetupService', () => {
  const context = {
    organizationId: 'org',
    profileId: 'profile',
    userId: 'user',
  };
  const page = {
    id: 'integration',
    internalId: '123',
    name: 'Pagina',
    organizationId: 'org',
    profileId: 'profile',
  };
  const credentials = { clientId: '456', clientSecret: 'SECRET' };
  const connection = {
    integrationId: 'integration',
    pageId: '123',
    appId: '456',
    appSecret: 'SECRET',
    pageToken: 'PAGE',
    organizationId: 'org',
    profileId: 'profile',
  };
  let service: FacebookAutomationSetupService;
  let repo: any;
  let creds: any;
  let provider: any;
  let graph: any;
  let state: string;
  let savedState: any;
  let ownFields: string[];
  let callback: string;
  let debug: any;
  let systemUser: any;

  it('consome orcamento de consulta somente depois de validar a autorizacao da Pagina', async () => {
    repo.consumePostLookupBudget = jest.fn().mockResolvedValue(undefined);
    expect(await service.authorizedPostLookup(context, 'integration')).toEqual(
      connection
    );
    expect(repo.consumePostLookupBudget).toHaveBeenCalledWith(connection);
    repo.getConnection.mockResolvedValue(null);
    repo.consumePostLookupBudget.mockClear();
    await expect(
      service.authorizedPostLookup(context, 'integration')
    ).rejects.toThrow('AUTHORIZATION_REQUIRED');
    expect(repo.consumePostLookupBudget).not.toHaveBeenCalled();
  });

  describe('webhook compartilhado do aplicativo no perfil', () => {
    it('retorna o mesmo callback e token sem depender da pagina ou consultar a Meta', async () => {
      const first = await service.viewWebhook(context);
      repo.listPages.mockResolvedValue([
        { ...page, id: 'second', internalId: '999' },
      ]);
      repo.getConnection.mockResolvedValue({
        ...connection,
        integrationId: 'second',
        pageId: '999',
      });
      expect(await service.viewWebhook(context)).toEqual(first);
      expect(first).toEqual({
        appId: '456',
        callbackUrl: callback,
        verifyToken: createHmac('sha256', 'SECRET')
          .update(`multipost-facebook-webhook-v1:${callback}`)
          .digest('hex'),
        authorizationRequired: false,
      });
      expect(repo.getConnection).toHaveBeenCalledWith(context, '456', '999');
      expect(repo.findConnections).not.toHaveBeenCalled();
      expect(graph.read).not.toHaveBeenCalled();
      expect(graph.subscribePage).not.toHaveBeenCalled();
      expect(repo.saveConnection).not.toHaveBeenCalled();
    });
    it('sem paginas locais pede autorizacao sem procurar em outros perfis', async () => {
      repo.listPages.mockResolvedValue([]);
      expect(await service.viewWebhook(context)).toEqual({
        appId: '456',
        callbackUrl: callback,
        verifyToken: null,
        authorizationRequired: true,
      });
      expect(repo.getConnection).not.toHaveBeenCalled();
      expect(repo.findConnections).not.toHaveBeenCalled();
    });
    it.each([
      'organizationId',
      'profileId',
      'integrationId',
      'pageId',
      'appId',
      'appSecret',
    ])('nao usa uma conexao com %s divergente', async (key) => {
      repo.getConnection.mockResolvedValue({
        ...connection,
        [key]: 'different',
      });
      expect(await service.viewWebhook(context)).toMatchObject({
        verifyToken: null,
        authorizationRequired: true,
      });
    });
    it('exige contexto e credenciais validos', async () => {
      await expect(
        service.viewWebhook({ ...context, profileId: '' })
      ).rejects.toMatchObject({ status: 403 });
      creds.getRawShared.mockResolvedValue({
        clientId: 'invalid',
        clientSecret: 'SECRET',
      });
      await expect(service.viewWebhook(context)).rejects.toMatchObject({
        status: 412,
      });
    });
  });
  it('Messenger exige messages no app e preserva feed ao ativar explicitamente a Pagina', async () => {
    debug.scopes = ['pages_messaging', 'pages_manage_metadata'];
    ownFields = ['feed', 'message_reads'];
    expect(
      await service.inspectMessengerAccount(context, 'integration', true)
    ).toMatchObject({
      stage: 'CALLBACK_REQUIRED',
      reasons: ['MESSENGER_APP_SUBSCRIPTION_REQUIRED'],
    });
    expect(graph.subscribePage).not.toHaveBeenCalled();
    const original = graph.read.getMockImplementation();
    graph.read.mockImplementation(async (...args: any[]) =>
      args[0] === '456/subscriptions'
        ? {
            data: [
              {
                object: 'page',
                callback_url: callback,
                active: true,
                fields: [{ name: 'messages' }],
              },
            ],
          }
        : original(...args)
    );
    expect(
      await service.inspectMessengerAccount(context, 'integration')
    ).toMatchObject({
      stage: 'CHECK_REQUIRED',
      reasons: ['MESSENGER_PAGE_SUBSCRIPTION_REQUIRED'],
    });
    expect(graph.subscribePage).not.toHaveBeenCalled();
    expect(
      await service.inspectMessengerAccount(context, 'integration', true)
    ).toMatchObject({ stage: 'RECEIVING_READY' });
    expect(graph.subscribePage).toHaveBeenCalledWith('123', 'PAGE', [
      'feed',
      'message_reads',
      'messages',
    ]);
    expect(repo.saveStatus).not.toHaveBeenCalled();
  });
  it('mantem resultado incerto quando POST da inscricao nao e confirmado pelo GET', async () => {
    ownFields = ['feed'];
    const original = graph.read.getMockImplementation();
    graph.read.mockImplementation(async (...args: any[]) =>
      args[0] === '456/subscriptions'
        ? {
            data: [
              {
                object: 'page',
                callback_url: callback,
                active: true,
                fields: [{ name: 'messages' }],
              },
            ],
          }
        : original(...args)
    );
    graph.subscribePage.mockResolvedValue(undefined);
    await expect(
      service.inspectMessengerAccount(context, 'integration', true)
    ).rejects.toThrow('OUTCOME_UNKNOWN');
    expect(graph.subscribePage).toHaveBeenCalledTimes(1);
  });
  it('roteia DM assinado sem captura e propaga falha de persistencia para repeticao segura', async () => {
    const before = process.env.SHARED_AUTOMATIONS_ENABLED;
    process.env.SHARED_AUTOMATIONS_ENABLED = 'true';
    try {
      const events = { receive: jest.fn().mockResolvedValue([]) };
      const receiver = new FacebookAutomationSetupService(
        repo,
        creds,
        provider,
        graph,
        systemUser,
        events as any
      );
      const body = JSON.parse(payload().toString());
      body.entry[0].messaging = [
        {
          sender: { id: '987' },
          recipient: { id: '123' },
          timestamp: Date.now(),
          message: { mid: 'm_unique:123', text: 'link' },
        },
      ];
      const raw = Buffer.from(JSON.stringify(body));
      const sig =
        'sha256=' + createHmac('sha256', 'SECRET').update(raw).digest('hex');
      await receiver.receive('456', raw, sig);
      expect(events.receive).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'messenger_message',
          integrationId: 'integration',
          organizationId: 'org',
          profileId: 'profile',
          externalActorId: '987',
          externalPostId: '',
        })
      );
      expect(events.receive).toHaveBeenCalledWith(
        expect.objectContaining({
          externalPostId: expect.stringMatching(/^123_/),
        })
      );
      events.receive.mockImplementation(async (event: any) => {
        if (event.eventType === 'messenger_message')
          throw new Error('DB_UNAVAILABLE');
        return [];
      });
      await expect(receiver.receive('456', raw, sig)).rejects.toThrow(
        'DB_UNAVAILABLE'
      );
      expect(graph.subscribePage).not.toHaveBeenCalled();
    } finally {
      if (before === undefined) delete process.env.SHARED_AUTOMATIONS_ENABLED;
      else process.env.SHARED_AUTOMATIONS_ENABLED = before;
    }
  });
  it('separa prazo dos dados do token sem vencimento programado', async () => {
    debug.data_access_expires_at = Math.floor(Date.now() / 1000) + 86400;
    ownFields = ['feed'];
    const status = await service.inspectAccount(context, 'integration');
    expect(status.stage).toBe('RECEIVING_READY');
    expect(status.noScheduledExpiry).toBe(true);
    expect(status.tokenExpiresAt).toBeNull();
    expect(status.dataAccessExpiresAt).toBe(
      new Date(debug.data_access_expires_at * 1000).toISOString()
    );
  });
  it('verifica sem inscrever a pagina e preserva o escopo', async () => {
    const status = await service.check(context, 'integration');
    expect(status.stage).toBe('CHECK_REQUIRED');
    expect(graph.subscribePage).not.toHaveBeenCalled();
    expect(repo.saveStatus).toHaveBeenCalledWith(
      context,
      'integration',
      status,
      expect.any(String)
    );
    ownFields = ['feed'];
    expect((await service.check(context, 'integration')).stage).toBe(
      'RECEIVING_READY'
    );
    repo.getPage.mockResolvedValue(null);
    await expect(service.check(context, 'foreign')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('vincula o diagnostico ao token atual sem expor o token', async () => {
    await service.view(context, 'integration');
    const first = repo.getStatus.mock.lastCall[2];
    repo.getConnection.mockResolvedValue({
      ...connection,
      pageToken: 'NEW_PAGE',
    });
    await service.view(context, 'integration');
    expect(repo.getStatus.mock.lastCall[2]).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
  beforeEach(() => {
    process.env.WEBHOOK_BASE_URL = 'https://api.example.com';
    process.env.FRONTEND_URL = 'https://app.example.com';
    callback = 'https://api.example.com/public/facebook-automations/456';
    ownFields = ['messages'];
    debug = {
      is_valid: true,
      app_id: '456',
      type: 'PAGE',
      profile_id: '123',
      expires_at: 0,
      data_access_expires_at: 0,
      scopes: [...FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS],
    };
    repo = {
      listPages: jest.fn().mockResolvedValue([page]),
      getPage: jest.fn().mockResolvedValue(page),
      getConnection: jest.fn().mockResolvedValue(connection),
      saveConnection: jest.fn().mockResolvedValue(undefined),
      saveState: jest.fn().mockImplementation(async (key, value) => {
        state = key;
        savedState = value;
      }),
      takeState: jest.fn().mockImplementation(async () => {
        const value = savedState;
        savedState = null;
        return value;
      }),
      saveStatus: jest.fn(),
      getStatus: jest.fn().mockResolvedValue(null),
      getReceipt: jest.fn().mockResolvedValue(null),
      saveReceipt: jest.fn(),
      getMessengerProbe: jest.fn().mockResolvedValue(null),
      saveMessengerObservation: jest.fn(),
      saveMessengerFullCapture: jest.fn(),
      findConnections: jest.fn().mockResolvedValue([connection]),
      allowWebhook: jest.fn().mockResolvedValue(true),
      withPageSubscriptionLock: jest.fn(async (_connection, action) =>
        action(async (): Promise<void> => {})
      ),
    };
    creds = { getRawShared: jest.fn().mockResolvedValue(credentials) };
    provider = {
      generateAuthUrl: jest.fn().mockResolvedValue({
        url: 'https://www.facebook.com/v25.0/dialog/oauth?state=old',
        state: 'old',
        codeVerifier: 'verifier',
      }),
      authenticate: jest.fn().mockResolvedValue({ accessToken: 'USER' }),
    };
    graph = {
      read: jest.fn().mockImplementation(async (path: string) => {
        if (path === '123') return { id: '123', access_token: 'PAGE' };
        if (path === 'debug_token') return { data: debug };
        if (path === 'me') return { id: '123' };
        if (path === '456/subscriptions')
          return {
            data: [
              {
                object: 'page',
                callback_url: callback,
                active: true,
                fields: [{ name: 'feed' }],
              },
            ],
          };
        if (path === '123/subscribed_apps')
          return {
            data: [
              { id: '456', subscribed_fields: [...ownFields] },
              { id: '789', subscribed_fields: ['feed'] },
            ],
          };
        throw Error('unexpected path');
      }),
      subscribePage: jest
        .fn()
        .mockImplementation(async (_page, _token, fields) => {
          ownFields = fields;
        }),
    };
    systemUser = {
      available: jest.fn().mockResolvedValue(true),
      derive: jest.fn().mockResolvedValue({
        pageToken: 'PAGE',
        sourceFingerprint: 'source',
        authorization: {
          source: 'SYSTEM_USER',
          systemUserId: '789',
          noScheduledExpiry: true,
          tokenExpiresAt: null,
        },
      }),
      assertUnchanged: jest.fn(),
    };
    repo.getSourceRevision = jest.fn().mockResolvedValue('source-cipher');
    repo.getConnectionRevision = jest.fn().mockResolvedValue('previous-cipher');
    repo.replaceConnection = jest.fn();
    service = new FacebookAutomationSetupService(
      repo,
      creds,
      provider,
      graph,
      systemUser
    );
  });

  afterEach(() => {
    delete process.env.WEBHOOK_BASE_URL;
    delete process.env.FRONTEND_URL;
  });

  describe('usuario de sistema por pagina', () => {
    beforeEach(() => {
      debug.scopes.push('pages_manage_engagement');
    });
    it('substitui somente a autorizacao cifrada e inspeciona sem inscrever feed', async () => {
      const result = await service.useSystemUser(context, 'integration');
      expect(result).toMatchObject({
        integrationId: 'integration',
        status: { stage: 'CHECK_REQUIRED' },
      });
      expect(repo.replaceConnection).toHaveBeenCalledWith(
        {
          ...connection,
          authorization: expect.objectContaining({ source: 'SYSTEM_USER' }),
        },
        'previous-cipher',
        'source-cipher'
      );
      expect(repo.saveConnection).not.toHaveBeenCalled();
      expect(graph.subscribePage).not.toHaveBeenCalled();
      expect(repo.saveReceipt).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toMatch(
        /SECRET|PAGE|sourceFingerprint/
      );
      expect(systemUser.assertUnchanged).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ client_id: '456' }),
        'source'
      );
    });
    it('nao salva diagnostico se outra autorizacao venceu a concorrencia', async () => {
      repo.replaceConnection.mockRejectedValue({ status: 409 });
      await expect(
        service.useSystemUser(context, 'integration')
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.saveStatus).not.toHaveBeenCalled();
    });
    it('cache indisponivel apos gravar pede nova verificacao sem fingir rollback', async () => {
      repo.saveStatus.mockRejectedValue(new Error('redis offline'));
      const result = await service.useSystemUser(context, 'integration');
      expect(result.status.stage).toBe('CHECK_REQUIRED');
      expect(repo.replaceConnection).toHaveBeenCalledTimes(1);
    });
    it('exige pages_manage_engagement tambem no Page token derivado', async () => {
      debug.scopes = [...FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS];
      await expect(
        service.useSystemUser(context, 'integration')
      ).rejects.toMatchObject({ status: 412 });
      expect(repo.replaceConnection).not.toHaveBeenCalled();
    });
    it('preserva a conexao antiga se o token derivado for de outra pagina', async () => {
      debug.profile_id = '999';
      await expect(
        service.useSystemUser(context, 'integration')
      ).rejects.toMatchObject({ status: 412 });
      expect(repo.replaceConnection).not.toHaveBeenCalled();
      expect(repo.saveStatus).not.toHaveBeenCalled();
    });
    it.each(['page', 'app', 'source'])(
      'preserva conexao se %s mudar durante a validacao',
      async (kind) => {
        if (kind === 'page')
          repo.getPage
            .mockResolvedValueOnce(page)
            .mockResolvedValue({ ...page, internalId: '999' });
        if (kind === 'app')
          creds.getRawShared
            .mockResolvedValueOnce(credentials)
            .mockResolvedValue({ ...credentials, clientSecret: 'CHANGED' });
        if (kind === 'source')
          systemUser.assertUnchanged.mockRejectedValue({ status: 409 });
        await expect(
          service.useSystemUser(context, 'integration')
        ).rejects.toMatchObject({ status: 409 });
        expect(repo.replaceConnection).not.toHaveBeenCalled();
      }
    );
    it('nao consulta token de sistema para pagina de outro perfil', async () => {
      repo.getPage.mockResolvedValue(null);
      await expect(
        service.useSystemUser(context, 'foreign')
      ).rejects.toMatchObject({ status: 404 });
      expect(systemUser.derive).not.toHaveBeenCalled();
    });
    it('nao grava em falha de rede e nao divulga erro bruto', async () => {
      graph.read.mockRejectedValue(new Error('SECRET'));
      await expect(
        service.useSystemUser(context, 'integration')
      ).rejects.toMatchObject({
        status: 412,
        message: 'SYSTEM_USER_CHECK_FAILED',
      });
      expect(repo.replaceConnection).not.toHaveBeenCalled();
    });
    it('exibe origem legada como login e disponibilidade sem consultar Meta', async () => {
      expect(await service.view(context, 'integration')).toMatchObject({
        systemUserConfigured: true,
        authorization: { source: 'FACEBOOK_LOGIN' },
      });
      expect(systemUser.available).toHaveBeenCalledWith(context);
      expect(graph.read).not.toHaveBeenCalled();
    });
    it('troca de origem invalida o diagnostico anterior mesmo com Page token igual', async () => {
      await service.view(context, 'integration');
      const legacyFingerprint = repo.getStatus.mock.lastCall[2];
      repo.getConnection.mockResolvedValue({
        ...connection,
        authorization: { source: 'SYSTEM_USER', noScheduledExpiry: true },
      });
      const result = await service.view(context, 'integration');
      expect(result.authorization?.source).toBe('SYSTEM_USER');
      expect(repo.getStatus.mock.lastCall[2]).not.toBe(legacyFingerprint);
    });
  });
  it('inspecao para prova nunca inscreve nem salva status', async () => {
    expect(
      await service.inspectReceiving(context, 'integration')
    ).toMatchObject({ stage: 'CHECK_REQUIRED' });
    expect(graph.subscribePage).not.toHaveBeenCalled();
    expect(repo.saveStatus).not.toHaveBeenCalled();
    ownFields = ['feed'];
    expect(
      await service.inspectReceiving(context, 'integration')
    ).toMatchObject({ stage: 'RECEIVING_READY' });
    expect(graph.subscribePage).not.toHaveBeenCalled();
  });
  it('resolucao interna rejeita Page token associado a outra integracao', async () => {
    repo.getConnection.mockResolvedValue({
      ...connection,
      integrationId: 'other',
    });
    await expect(
      service.authorizedConnection(context, 'integration')
    ).rejects.toThrow('AUTHORIZATION_REQUIRED');
  });

  it('gera state forte e usa somente credenciais do perfil selecionado', async () => {
    const result = await service.authorize(context, 'integration');
    expect(state).toMatch(/^fbauto_[a-f0-9]{64}$/);
    expect(new URL(result.url).searchParams.get('state')).toBe(state);
    expect(provider.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: '456',
        client_secret: 'SECRET',
        facebookAutomation: true,
      })
    );
    expect(savedState).toEqual(
      expect.objectContaining({ ...context, integrationId: 'integration' })
    );
    expect(JSON.stringify(savedState)).not.toContain('SECRET');
  });

  it('nao consulta Meta sem perfil ou integracao pertencente ao contexto', async () => {
    await expect(
      service.authorize({ ...context, profileId: '' }, 'integration')
    ).rejects.toMatchObject({ status: 403 });
    repo.getPage.mockResolvedValue(null);
    await expect(service.authorize(context, 'other')).rejects.toMatchObject({
      status: 404,
    });
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
  });

  it('consome OAuth uma vez, cifra via repositorio e inscreve somente a pagina escolhida', async () => {
    await service.authorize(context, 'integration');
    const result = await service.complete(context, { state, code: 'CODE' });
    expect(repo.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining(connection)
    );
    expect(graph.subscribePage).toHaveBeenCalledWith('123', 'PAGE', [
      'messages',
      'feed',
    ]);
    expect(result.status.stage).toBe('RECEIVING_READY');
    expect(JSON.stringify(result)).not.toMatch(/SECRET|PAGE|USER/);
    await expect(
      service.complete(context, { state, code: 'CODE' })
    ).rejects.toMatchObject({ status: 409 });
    expect(provider.authenticate).toHaveBeenCalledTimes(1);
  });

  it.each(['organizationId', 'profileId', 'userId'])(
    'rejeita troca de %s no retorno OAuth',
    async (field) => {
      await service.authorize(context, 'integration');
      await expect(
        service.complete(
          { ...context, [field]: 'other' },
          { state, code: 'CODE' }
        )
      ).rejects.toMatchObject({ status: 409 });
      expect(provider.authenticate).not.toHaveBeenCalled();
      expect(repo.saveConnection).not.toHaveBeenCalled();
    }
  );

  it('rejeita credenciais alteradas durante OAuth', async () => {
    await service.authorize(context, 'integration');
    creds.getRawShared.mockResolvedValue({
      ...credentials,
      clientSecret: 'changed',
    });
    await expect(
      service.complete(context, { state, code: 'CODE' })
    ).rejects.toMatchObject({ status: 409 });
    expect(provider.authenticate).not.toHaveBeenCalled();
  });

  it('rejeita state expirado mesmo se o armazenamento devolver registro antigo', async () => {
    await service.authorize(context, 'integration');
    savedState.expiresAt = Date.now() - 1;
    await expect(
      service.complete(context, { state, code: 'CODE' })
    ).rejects.toMatchObject({ status: 409 });
    expect(provider.authenticate).not.toHaveBeenCalled();
  });

  it('limita requests publicos antes de consultar credenciais', async () => {
    repo.allowWebhook.mockResolvedValue(false);
    await expect(
      service.receive('456', payload(), 'sha256=' + '0'.repeat(64))
    ).rejects.toMatchObject({ status: 429 });
    expect(repo.findConnections).not.toHaveBeenCalled();
  });

  it.each([
    { app_id: '999' },
    { profile_id: '999' },
    { type: 'USER' },
    { is_valid: false },
    { expires_at: 1 },
    { scopes: ['pages_read_engagement'] },
    { granular_scopes: [{ scope: 'pages_messaging', target_ids: ['999'] }] },
  ])('nao salva token com autorizacao divergente: %j', async (override) => {
    Object.assign(debug, override);
    await service.authorize(context, 'integration');
    await expect(
      service.complete(context, { state, code: 'CODE' })
    ).rejects.toMatchObject({ status: 412 });
    expect(repo.saveConnection).not.toHaveBeenCalled();
    expect(graph.subscribePage).not.toHaveBeenCalled();
  });

  it('bloqueia callback divergente sem alterar o aplicativo', async () => {
    callback = 'https://other.example.com/hook';
    const result = await service.activate(context, 'integration');
    expect(result.stage).toBe('CALLBACK_CONFLICT');
    expect(graph.subscribePage).not.toHaveBeenCalled();
  });

  it('revalida a pagina e as credenciais imediatamente antes de inscrever', async () => {
    const originalRead = graph.read.getMockImplementation();
    graph.read.mockImplementation(async (path: string) => {
      const result = await originalRead(path);
      if (path === '123/subscribed_apps') repo.getPage.mockResolvedValue(null);
      return result;
    });
    expect((await service.activate(context, 'integration')).stage).toBe(
      'CHECK_FAILED'
    );
    expect(graph.subscribePage).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid', 'http://api.example.com'])(
    'retorna 412 para callback invalido: %s',
    async (base) => {
      process.env.WEBHOOK_BASE_URL = base;
      process.env.FRONTEND_URL = base;
      await expect(
        service.authorize(context, 'integration')
      ).rejects.toMatchObject({ status: 412 });
    }
  );

  it('nao inscreve quando a lista de assinaturas esta incompleta', async () => {
    graph.read.mockImplementation(async (path: string) =>
      path === 'debug_token'
        ? { data: debug }
        : path === 'me'
        ? { id: '123' }
        : path === '456/subscriptions'
        ? { data: [], paging: { next: 'https://graph.facebook.com/next' } }
        : {}
    );
    const result = await service.activate(context, 'integration');
    expect(result.stage).toBe('CHECK_FAILED');
    expect(graph.subscribePage).not.toHaveBeenCalled();
  });

  it('nao marca pronto sem confirmar inscricao e nao repete POST apos timeout', async () => {
    graph.subscribePage.mockRejectedValue(new Error('secret body PAGE'));
    const result = await service.activate(context, 'integration');
    expect(result.stage).toBe('CHECK_FAILED');
    expect(graph.subscribePage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('PAGE');
  });

  it('ignora registro antigo quando credenciais do perfil mudam', async () => {
    creds.getRawShared.mockResolvedValue({
      clientId: '999',
      clientSecret: 'OTHER',
    });
    expect((await service.activate(context, 'integration')).stage).toBe(
      'AUTHORIZATION_REQUIRED'
    );
    expect(graph.subscribePage).not.toHaveBeenCalled();
  });

  const payload = () =>
    Buffer.from(
      JSON.stringify({
        object: 'page',
        entry: ['123', '999'].map((id) => ({
          id,
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                from: { id: '777' },
                post_id: `${id}_10`,
                comment_id: `${id}_20`,
                parent_id: `${id}_10`,
                message: 'PRIVADO',
                created_time: 1000,
              },
            },
          ],
        })),
      })
    );
  it('roteia lote misto somente ao perfil autorizado sem armazenar texto ou autor', async () => {
    const raw = payload();
    await service.receive(
      '456',
      raw,
      'sha256=' + createHmac('sha256', 'SECRET').update(raw).digest('hex')
    );
    expect(repo.saveReceipt).toHaveBeenCalledTimes(1);
    expect(repo.saveReceipt).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ commentId: '123_20', postId: '123_10' })
    );
    expect(JSON.stringify(repo.saveReceipt.mock.calls)).not.toContain(
      'PRIVADO'
    );
    expect(graph.subscribePage).not.toHaveBeenCalled();
  });

  it('rejeita assinatura incorreta sem gravar recibo', async () => {
    await expect(
      service.receive('456', payload(), 'sha256=' + '0'.repeat(64))
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.saveReceipt).not.toHaveBeenCalled();
    expect(repo.getMessengerProbe).not.toHaveBeenCalled();
  });

  it('observa mensagem somente com armamento e nunca despacha ao motor de comentarios', async () => {
    // Reproduz o timestamp do CI que contem o ID curto do remetente.
    const now = jest.spyOn(Date, 'now').mockReturnValue(1793586278041);
    try {
      const events = { receive: jest.fn() };
      const receiver = new FacebookAutomationSetupService(
        repo,
        creds,
        provider,
        graph,
        systemUser,
        events as any
      );
      const raw = Buffer.from(
        JSON.stringify({
          object: 'page',
          entry: [
            {
              id: '123',
              messaging: [
                {
                  sender: { id: '987' },
                  recipient: { id: '123' },
                  timestamp: Date.now(),
                  message: { mid: 'm_private', text: 'PRIVADO' },
                },
              ],
            },
          ],
        })
      );
      const signature =
        'sha256=' + createHmac('sha256', 'SECRET').update(raw).digest('hex');
      await expect(receiver.receive('456', raw, signature)).resolves.toEqual({
        received: true,
      });
      expect(repo.saveMessengerObservation).not.toHaveBeenCalled();
      const probe = {
        ...context,
        integrationId: 'integration',
        pageId: '123',
        appId: '456',
        nonce: 'a'.repeat(32),
        issuedAt: Date.now() - 1000,
        expiresAt: Date.now() + 3600000,
      };
      repo.getMessengerProbe.mockResolvedValue(probe);
      await receiver.receive('456', raw, signature);
      expect(repo.saveMessengerObservation).toHaveBeenCalledTimes(1);
      expect(repo.saveMessengerObservation.mock.lastCall[0]).toEqual(
        connection
      );
      expect(repo.saveMessengerObservation.mock.lastCall[2]).toEqual({
        receivedAt: new Date(Date.now()).toISOString(),
        occurredAt: Date.now(),
        messageHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        hasText: true,
        isEcho: false,
        isUnsupported: false,
        attachmentTypes: [],
        fields: {
          message: 'object',
          'message.mid': 'string',
          'message.text': 'string',
        },
        unknownFieldCount: 3,
        truncated: false,
      });
      expect(
        JSON.stringify(repo.saveMessengerObservation.mock.lastCall.slice(1))
      ).not.toMatch(/PRIVADO|m_private|"987"/);
      expect(events.receive).not.toHaveBeenCalled();
      expect(repo.saveReceipt).not.toHaveBeenCalled();
      expect(graph.subscribePage).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('modo completo preserva corpo de teste sem despachar DM ou alterar inscricoes', async () => {
    const events = { receive: jest.fn() };
    const receiver = new FacebookAutomationSetupService(
      repo,
      creds,
      provider,
      graph,
      systemUser,
      events as any
    );
    const probe = {
      ...context,
      integrationId: 'integration',
      appId: '456',
      pageId: '123',
      nonce: 'b'.repeat(32),
      issuedAt: Date.now() - 1000,
      expiresAt: Date.now() + 60000,
      mode: 'full-json',
      testTexts: ['Teste Story MultiPost a1b2c3', 'Teste DM MultiPost a1b2c3'],
    };
    repo.getMessengerProbe.mockResolvedValue(probe);
    const raw = Buffer.from(
      JSON.stringify(
        {
          object: 'page',
          unknown: { flag: true },
          entry: [
            {
              id: '123',
              messaging: [
                {
                  sender: { id: '987' },
                  recipient: { id: '123' },
                  timestamp: Date.now(),
                  message: {
                    mid: 'm_test',
                    text: probe.testTexts[0],
                    is_story: true,
                  },
                },
              ],
            },
          ],
        },
        null,
        2
      )
    );
    const sig =
      'sha256=' + createHmac('sha256', 'SECRET').update(raw).digest('hex');
    await receiver.receive('456', raw, sig);
    expect(repo.saveMessengerFullCapture).toHaveBeenCalledWith(
      connection,
      probe,
      expect.objectContaining({
        status: 'captured',
        rawJson: raw.toString('utf8'),
      })
    );
    expect(repo.saveMessengerObservation).not.toHaveBeenCalled();
    expect(events.receive).not.toHaveBeenCalled();
    expect(graph.subscribePage).not.toHaveBeenCalled();
    repo.saveMessengerFullCapture.mockRejectedValue(
      new Error('storage failed')
    );
    await expect(receiver.receive('456', raw, sig)).resolves.toEqual({
      received: true,
    });
  });

  it('falha do diagnostico nao interrompe comentarios do mesmo lote', async () => {
    repo.getMessengerProbe.mockRejectedValue(new Error('storage probe failed'));
    const body = JSON.parse(payload().toString());
    body.entry.push({ id: '123', messaging: [{ message: { mid: 'm_test' } }] });
    const raw = Buffer.from(JSON.stringify(body));
    await expect(
      service.receive(
        '456',
        raw,
        'sha256=' + createHmac('sha256', 'SECRET').update(raw).digest('hex')
      )
    ).resolves.toEqual({ received: true });
    expect(repo.saveReceipt).toHaveBeenCalledTimes(1);
  });

  it('ignora pagina desconhecida e perfil removido', async () => {
    repo.findConnections.mockResolvedValue([]);
    await service.receive('456', payload(), 'sha256=' + '0'.repeat(64));
    expect(repo.saveReceipt).not.toHaveBeenCalled();
  });
  it.each(['profile', 'second-profile'])(
    'roteia duas paginas do mesmo app sem cruzar recibos com destino no perfil %s',
    async (secondProfileId) => {
      const second = {
        ...connection,
        pageId: '999',
        integrationId: 'second',
        profileId: secondProfileId,
      };
      repo.findConnections.mockResolvedValue([connection, second]);
      repo.getPage.mockImplementation(async (_context: unknown, id: string) =>
        id === 'second'
          ? {
              ...page,
              id: 'second',
              internalId: '999',
              profileId: secondProfileId,
            }
          : page
      );
      const raw = payload();
      await service.receive(
        '456',
        raw,
        'sha256=' + createHmac('sha256', 'SECRET').update(raw).digest('hex')
      );
      expect(repo.saveReceipt).toHaveBeenCalledWith(
        connection,
        expect.objectContaining({ commentId: '123_20' })
      );
      expect(repo.saveReceipt).toHaveBeenCalledWith(
        second,
        expect.objectContaining({ commentId: '999_20' })
      );
      expect(repo.saveReceipt).toHaveBeenCalledTimes(2);
    }
  );
  it('nao valida HMAC usando segredo de outro perfil', async () => {
    creds.getRawShared.mockResolvedValue({
      ...credentials,
      clientSecret: 'changed',
    });
    const raw = payload();
    await service.receive(
      '456',
      raw,
      'sha256=' + createHmac('sha256', 'SECRET').update(raw).digest('hex')
    );
    expect(repo.saveReceipt).not.toHaveBeenCalled();
  });
  it('confirma challenge com token de verificacao e recusa o de outro app', async () => {
    const token = (await service.view(context, 'integration')).verifyToken;
    expect(await service.verify('456', 'subscribe', token, '123456')).toBe(
      '123456'
    );
    await expect(
      service.verify('456', 'subscribe', '0'.repeat(64), '123456')
    ).rejects.toMatchObject({ status: 403 });
  });
});
