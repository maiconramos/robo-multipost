// integration.manager puxa todos os providers sociais (nostr-tools e ESM e
// quebra o ts-jest); redis abre conexao no load do modulo. Mocks seguem o
// padrao dos demais specs do repo.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { get: jest.fn(), set: jest.fn() },
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn().mockReturnValue({}) },
}));

import { IntegrationService } from './integration.service';
import { HttpException } from '@nestjs/common';
import { SYSTEM_USER_PAGE_TOKEN_TTL } from '@gitroom/nestjs-libraries/integrations/meta-system-user.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const makeService = (repo: any) =>
  new IntegrationService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

describe('IntegrationService', () => {
  it('usa namespace novo de analytics sem reutilizar variacao fabricada do cache antigo', async () => {
    const metric = [{ label: 'Views', data: [{ total: '12', date: 'day' }] }];
    const repo = { getIntegrationById: jest.fn().mockResolvedValue({ id: 'int', profileId: 'perfil', type: 'social', providerIdentifier: 'facebook', tokenExpiration: new Date(Date.now() + 86400000) }) };
    const service = new IntegrationService(repo as any, {} as any, { getSocialIntegration: jest.fn().mockReturnValue({}) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    (ioRedis.get as jest.Mock).mockImplementation(async key => JSON.stringify(key === 'integration:analytics-v2:org:int:7' ? metric : [{ ...metric[0], percentageChange: 5 }]));
    expect(await service.checkAnalytics({ id: 'org' } as any, 'int', '7', false, 'perfil')).toEqual(metric);
    expect(ioRedis.get).toHaveBeenCalledWith('integration:analytics-v2:org:int:7');
  });
  describe('checkAnalytics - renovacao e periodo (upstream 96b78476)', () => {
    const build = (analytics: jest.Mock) => {
      const repo = {
        getIntegrationById: jest.fn(async () => ({
          id: 'int',
          profileId: 'perfil',
          type: 'social',
          providerIdentifier: 'youtube',
          internalId: 'canal',
          token: 'tok',
          tokenExpiration: new Date(Date.now() + 86400000),
        })),
      };
      const refresh = { refresh: jest.fn().mockResolvedValue({ accessToken: 'novo' }) };
      const service = new IntegrationService(
        repo as any,
        {} as any,
        { getSocialIntegration: jest.fn().mockReturnValue({ analytics }) } as any,
        {} as any,
        refresh as any,
        {} as any,
        { decrypt: jest.fn((v: string) => v) } as any,
        {} as any,
        {} as any
      );
      return { service, refresh };
    };

    beforeEach(() => {
      (ioRedis.get as jest.Mock).mockReset().mockResolvedValue(null);
      (ioRedis.set as jest.Mock).mockReset().mockResolvedValue('OK');
    });

    it('renova e tenta de novo uma unica vez, mantendo o perfil', async () => {
      const analytics = jest
        .fn()
        .mockRejectedValue(new RefreshToken('youtube', '{}', '{}'));
      const { service, refresh } = build(analytics);
      const spy = jest.spyOn(service, 'checkAnalytics');

      await expect(
        service.checkAnalytics({ id: 'org' } as any, 'int', '7', false, 'perfil')
      ).resolves.toEqual([]);

      expect(refresh.refresh).toHaveBeenCalledTimes(1);
      expect(analytics).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[1]).toEqual([{ id: 'org' }, 'int', '7', true, 'perfil']);
    });

    it('nao guarda falha de analytics no cache nem tenta renovar token saudavel', async () => {
      const analytics = jest
        .fn()
        .mockRejectedValue(new Error('INSTAGRAM_ANALYTICS_UNAVAILABLE'));
      const { service, refresh } = build(analytics);
      await expect(
        service.checkAnalytics({ id: 'org' } as any, 'int', '30', false, 'perfil')
      ).resolves.toEqual([]);
      expect(analytics).toHaveBeenCalledTimes(1);
      expect(ioRedis.set).not.toHaveBeenCalled();
      expect(refresh.refresh).not.toHaveBeenCalled();
    });

    it('periodo ausente ou invalido usa 7 dias no cache e no provider', async () => {
      const analytics = jest.fn().mockResolvedValue([]);
      const { service } = build(analytics);

      await service.checkAnalytics({ id: 'org' } as any, 'int', 'abc');
      await service.checkAnalytics({ id: 'org' } as any, 'int', 'Infinity');

      expect(ioRedis.get).toHaveBeenNthCalledWith(1, 'integration:analytics-v2:org:int:7');
      expect(ioRedis.get).toHaveBeenNthCalledWith(2, 'integration:analytics-v2:org:int:7');
      expect(analytics.mock.calls.map((c) => c[2])).toEqual([7, 7]);
    });
  });

  describe('updateCustomerName (upstream #2183)', () => {
    const repoWith = (over: Record<string, jest.Mock> = {}) => ({
      getCustomer: jest.fn().mockResolvedValue({ id: 'cli-1' }),
      getCustomerByName: jest.fn().mockResolvedValue(null),
      countCustomerIntegrationsOutsideProfile: jest.fn().mockResolvedValue(0),
      updateCustomerName: jest.fn().mockResolvedValue({ id: 'cli-1', name: 'Novo' }),
      ...over,
    });

    it('admin renomeia sem checar perfil', async () => {
      const repo = repoWith();
      await expect(
        makeService(repo).updateCustomerName('org-1', 'cli-1', 'Novo')
      ).resolves.toEqual({ id: 'cli-1', name: 'Novo' });
      expect(repo.countCustomerIntegrationsOutsideProfile).not.toHaveBeenCalled();
      expect(repo.updateCustomerName).toHaveBeenCalledWith('org-1', 'cli-1', 'Novo');
    });

    it('grupo de outra org (ou inexistente) responde 404', async () => {
      const repo = repoWith({ getCustomer: jest.fn().mockResolvedValue(null) });
      await expect(
        makeService(repo).updateCustomerName('org-1', 'cli-x', 'Novo')
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.updateCustomerName).not.toHaveBeenCalled();
    });

    it('USER nao renomeia grupo com canais de outro perfil, nem sem perfil', async () => {
      const repo = repoWith({
        countCustomerIntegrationsOutsideProfile: jest.fn().mockResolvedValue(2),
      });
      await expect(
        makeService(repo).updateCustomerName('org-1', 'cli-1', 'Novo', 'perfil-1')
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        makeService(repo).updateCustomerName('org-1', 'cli-1', 'Novo', null)
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.countCustomerIntegrationsOutsideProfile).toHaveBeenCalledWith(
        'org-1',
        'cli-1',
        'perfil-1'
      );
      expect(repo.updateCustomerName).not.toHaveBeenCalled();
    });

    it('nome ja usado por outro grupo da org responde 400', async () => {
      const repo = repoWith({
        getCustomerByName: jest.fn().mockResolvedValue({ id: 'cli-2' }),
      });
      await expect(
        makeService(repo).updateCustomerName('org-1', 'cli-1', 'Novo', 'perfil-1')
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('validateIntegrationProfile', () => {
    it('retorna sem validar quando profileId ausente e perfil nao obrigatorio', async () => {
      const repo = { getIntegrationById: jest.fn() };
      const service = makeService(repo);

      await expect(
        service.validateIntegrationProfile('org-1', 'int-1', undefined)
      ).resolves.toBeUndefined();
      expect(repo.getIntegrationById).not.toHaveBeenCalled();
    });

    it('lanca quando profileId ausente e requireProfile e true', async () => {
      const repo = { getIntegrationById: jest.fn() };
      const service = makeService(repo);

      await expect(
        service.validateIntegrationProfile('org-1', 'int-1', undefined, {
          requireProfile: true,
        })
      ).rejects.toThrow();
      expect(repo.getIntegrationById).not.toHaveBeenCalled();
    });

    it('lanca quando integration nao encontrada', async () => {
      const repo = { getIntegrationById: jest.fn().mockResolvedValue(null) };
      const service = makeService(repo);

      await expect(
        service.validateIntegrationProfile('org-1', 'int-1', 'prof-1')
      ).rejects.toThrow('Integration not found');
    });

    it('lanca quando integration pertence a outro perfil', async () => {
      const repo = {
        getIntegrationById: jest
          .fn()
          .mockResolvedValue({ id: 'int-1', profileId: 'prof-2' }),
      };
      const service = makeService(repo);

      await expect(
        service.validateIntegrationProfile('org-1', 'int-1', 'prof-1')
      ).rejects.toThrow('Integration does not belong to this profile');
    });

    it('passa quando integration pertence ao perfil', async () => {
      const repo = {
        getIntegrationById: jest
          .fn()
          .mockResolvedValue({ id: 'int-1', profileId: 'prof-1' }),
      };
      const service = makeService(repo);

      await expect(
        service.validateIntegrationProfile('org-1', 'int-1', 'prof-1')
      ).resolves.toBeUndefined();
    });

    it('passa quando integration legada sem perfil', async () => {
      const repo = {
        getIntegrationById: jest
          .fn()
          .mockResolvedValue({ id: 'int-1', profileId: null }),
      };
      const service = makeService(repo);

      await expect(
        service.validateIntegrationProfile('org-1', 'int-1', 'prof-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('disconnectChannel', () => {
    const buildService = (repo: any, notification: any, statusEvent: any = {}) =>
      new IntegrationService(
        repo,
        {} as any,
        {} as any,
        notification,
        {} as any,
        {} as any,
        {} as any,
        statusEvent,
        {} as any
      );

    const integration = {
      id: 'int-1',
      name: 'Canal X',
      picture: 'https://cdn/x.jpg',
      providerIdentifier: 'linkedin',
      profileId: 'prof-9',
    } as any;

    it('notifica, registra no historico e repassa o motivo (reason) ao marcar desconectado', async () => {
      const repo = { markRefreshNeeded: jest.fn().mockResolvedValue(true) };
      const statusEvent = { record: jest.fn().mockResolvedValue(undefined) };
      const service = buildService(repo, {}, statusEvent);
      const notify = jest
        .spyOn(service, 'informAboutRefreshError')
        .mockResolvedValue(undefined as any);

      await service.disconnectChannel(
        'org-1',
        integration,
        'ApplicationFailure: expired'
      );

      expect(repo.markRefreshNeeded).toHaveBeenCalledWith(
        'org-1',
        'int-1',
        'ApplicationFailure: expired'
      );
      expect(notify).toHaveBeenCalledTimes(1);
      // Evento CHANNEL_DISCONNECT com snapshot do canal + perfil de origem.
      expect(statusEvent.record).toHaveBeenCalledTimes(1);
      expect(statusEvent.record).toHaveBeenCalledWith({
        organizationId: 'org-1',
        type: 'CHANNEL_DISCONNECT',
        severity: 'CRITICAL',
        message: 'ApplicationFailure: expired',
        profileId: 'prof-9',
        integrationId: 'int-1',
        channelName: 'Canal X',
        channelPicture: 'https://cdn/x.jpg',
        providerIdentifier: 'linkedin',
      });
    });

    it('nao notifica nem registra quando o canal ja estava desconectado (sem transicao)', async () => {
      const repo = { markRefreshNeeded: jest.fn().mockResolvedValue(false) };
      const statusEvent = { record: jest.fn().mockResolvedValue(undefined) };
      const service = buildService(repo, {}, statusEvent);
      const notify = jest
        .spyOn(service, 'informAboutRefreshError')
        .mockResolvedValue(undefined as any);

      await service.disconnectChannel('org-1', integration);

      expect(notify).not.toHaveBeenCalled();
      expect(statusEvent.record).not.toHaveBeenCalled();
    });
  });

  describe('createOrUpdateIntegration (fail-soft do avatar)', () => {
    it('persiste a integracao com a picture original quando o upload do avatar falha', async () => {
      const repo = {
        createOrUpdateIntegration: jest
          .fn()
          .mockResolvedValue({ id: 'int-1' }),
      };
      const service = new IntegrationService(
        repo as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );
      (service as any).storage = {
        uploadSimple: jest.fn().mockRejectedValue(new Error('R2 403')),
      };
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await service.createOrUpdateIntegration(
        undefined,
        false,
        'org-1',
        'Canal X',
        'https://provider.example/avatar.jpg',
        'social',
        'internal-1',
        'linkedin',
        'tok'
      );

      // 5o arg posicional (indice 4) do repo = a picture; deve ser a original.
      expect(repo.createOrUpdateIntegration).toHaveBeenCalledTimes(1);
      expect(repo.createOrUpdateIntegration.mock.calls[0][4]).toBe(
        'https://provider.example/avatar.jpg'
      );
    });
  });

  describe('refreshTokens', () => {
    // Sem system user token por padrao — preserva o comportamento legado
    // (desconectar quando o refresh falha) nos testes existentes.
    const buildService = (
      repo: any,
      manager: any,
      metaSystemUser: any = {
        resolveHealedToken: jest.fn().mockResolvedValue(null),
      }
    ) =>
      new IntegrationService(
        repo,
        {} as any,
        manager,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        metaSystemUser
      );

    it('nao aborta o lote quando um canal falha o refresh (continue, nao return)', async () => {
      const integrations: any[] = [
        {
          id: 'int-1',
          name: 'A',
          providerIdentifier: 'linkedin',
          organizationId: 'org-1',
          refreshToken: 'r1',
          profileId: null,
        },
        {
          id: 'int-2',
          name: 'B',
          providerIdentifier: 'linkedin',
          organizationId: 'org-1',
          refreshToken: 'r2',
          profileId: null,
        },
      ];
      const repo = {
        needsToBeRefreshed: jest.fn().mockResolvedValue(integrations),
      };
      const manager = {
        getSocialIntegration: jest.fn().mockReturnValue({ oneTimeToken: false }),
      };
      const service = buildService(repo, manager);

      // 1o canal falha o refresh, 2o renova com sucesso.
      jest
        .spyOn(service, 'refreshToken')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce({
          refreshToken: 'nr',
          accessToken: 'na',
          expiresIn: 100,
        } as any);
      const disconnect = jest
        .spyOn(service, 'disconnectChannel')
        .mockResolvedValue(undefined as any);
      const upsert = jest
        .spyOn(service, 'createOrUpdateIntegration')
        .mockResolvedValue(undefined as any);

      await service.refreshTokens();

      // canal 1 desconectado, canal 2 renovado — prova que o loop nao abortou.
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(disconnect).toHaveBeenCalledWith(
        'org-1',
        integrations[0],
        'Automatic token refresh failed'
      );
      expect(upsert).toHaveBeenCalledTimes(1);
    });

    it('cura canal facebook via system user no lote sem desconectar', async () => {
      const fbIntegration: any = {
        id: 'int-fb',
        name: 'Pagina X',
        providerIdentifier: 'facebook',
        organizationId: 'org-1',
        internalId: '755639424460731',
        refreshToken: 'r1',
        profileId: 'prof-1',
      };
      const repo = {
        needsToBeRefreshed: jest.fn().mockResolvedValue([fbIntegration]),
      };
      const provider = {
        identifier: 'facebook',
        oneTimeToken: false,
        noNativeRefresh: true,
      };
      const manager = {
        getSocialIntegration: jest.fn().mockReturnValue(provider),
      };
      const healed = {
        id: '755639424460731',
        name: 'Pagina X',
        accessToken: 'EAA-healed',
        refreshToken: 'EAA-healed',
        expiresIn: SYSTEM_USER_PAGE_TOKEN_TTL,
        picture: '',
        username: '',
      };
      const metaSystemUser = {
        resolveHealedToken: jest.fn().mockResolvedValue(healed),
      };
      const service = buildService(repo, manager, metaSystemUser);

      // Stub sem refresh nativo: o refresh interno falha.
      jest.spyOn(service, 'refreshToken').mockResolvedValue(false);
      const disconnect = jest
        .spyOn(service, 'disconnectChannel')
        .mockResolvedValue(undefined as any);
      const upsert = jest
        .spyOn(service, 'createOrUpdateIntegration')
        .mockResolvedValue(undefined as any);

      await service.refreshTokens();

      expect(metaSystemUser.resolveHealedToken).toHaveBeenCalledWith(
        fbIntegration,
        provider
      );
      // Curou: persiste o token novo com a expiracao longa e NAO desconecta.
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledWith(
        undefined,
        false,
        'org-1',
        'Pagina X',
        undefined,
        'social',
        '755639424460731',
        'facebook',
        'EAA-healed',
        'EAA-healed',
        SYSTEM_USER_PAGE_TOKEN_TTL
      );
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('pula canal sem refresh nativo e sem system user (nao desconecta — falso positivo)', async () => {
      const fbIntegration: any = {
        id: 'int-fb',
        name: 'Pagina X',
        providerIdentifier: 'facebook',
        organizationId: 'org-1',
        internalId: '755639424460731',
        refreshToken: 'r1',
        profileId: null,
      };
      const repo = {
        needsToBeRefreshed: jest.fn().mockResolvedValue([fbIntegration]),
      };
      const manager = {
        getSocialIntegration: jest.fn().mockReturnValue({
          identifier: 'facebook',
          oneTimeToken: false,
          noNativeRefresh: true,
        }),
      };
      const service = buildService(repo, manager);

      jest.spyOn(service, 'refreshToken').mockResolvedValue(false);
      const disconnect = jest
        .spyOn(service, 'disconnectChannel')
        .mockResolvedValue(undefined as any);
      const upsert = jest
        .spyOn(service, 'createOrUpdateIntegration')
        .mockResolvedValue(undefined as any);

      await service.refreshTokens();

      // O token de Pagina pode continuar valido (a expiracao registrada e
      // sintetica); desconectar aqui era o falso positivo que derrubava
      // canal saudavel. A morte real do token e tratada no post-time.
      expect(disconnect).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('nao derruba o lote quando o processamento de um canal lanca', async () => {
      const integrations: any[] = [
        {
          id: 'int-1',
          name: 'A',
          providerIdentifier: 'linkedin',
          organizationId: 'org-1',
          refreshToken: 'r1',
          profileId: null,
        },
        {
          id: 'int-2',
          name: 'B',
          providerIdentifier: 'linkedin',
          organizationId: 'org-1',
          refreshToken: 'r2',
          profileId: null,
        },
      ];
      const repo = {
        needsToBeRefreshed: jest.fn().mockResolvedValue(integrations),
      };
      const manager = {
        getSocialIntegration: jest.fn().mockReturnValue({ oneTimeToken: false }),
      };
      const service = buildService(repo, manager);

      jest
        .spyOn(service, 'refreshToken')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({
          refreshToken: 'nr',
          accessToken: 'na',
          expiresIn: 100,
        } as any);
      const upsert = jest
        .spyOn(service, 'createOrUpdateIntegration')
        .mockResolvedValue(undefined as any);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(service.refreshTokens()).resolves.toBeUndefined();
      expect(upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveProviderPage', () => {
    const makePageService = (fetchPageInformation: jest.Mock) => {
      const repo = {
        getIntegrationById: jest.fn().mockResolvedValue({
          id: 'int-1',
          inBetweenSteps: true,
          providerIdentifier: 'facebook',
          token: 'tok',
        }),
      };
      const manager = {
        getSocialIntegration: jest
          .fn()
          .mockReturnValue({ fetchPageInformation }),
      };
      return new IntegrationService(
        repo as any,
        {} as any,
        manager as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );
    };

    it('converte erro do provider ao buscar a pagina em 400 com a mensagem, nao 500', async () => {
      const service = makePageService(
        jest
          .fn()
          .mockRejectedValue(
            new Error(
              'Your Facebook user has no permission to manage this page'
            )
          )
      );

      let thrown: any;
      try {
        await service.saveProviderPage('org-1', 'int-1', { page: 'p-1' });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect(thrown.getStatus()).toBe(400);
      expect(thrown.message).toBe(
        'Your Facebook user has no permission to manage this page'
      );
    });

    it('preserva HttpException lancada pelo provider', async () => {
      const service = makePageService(
        jest.fn().mockRejectedValue(new HttpException('teapot', 418))
      );

      let thrown: any;
      try {
        await service.saveProviderPage('org-1', 'int-1', { page: 'p-1' });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect(thrown.getStatus()).toBe(418);
    });
  });

  describe('getChannelProfileByInternalId (dono do canal para reconectar)', () => {
    it('devolve so o perfil do canal da org, inclusive desativado', async () => {
      const repo = {
        findActiveByOrgAndInternalIdWithProfile: jest.fn().mockResolvedValue({
          id: 'int-1',
          disabled: true,
          token: 'segredo',
          profileId: 'prof-2',
        }),
      };
      await expect(
        makeService(repo).getChannelProfileByInternalId('org-1', 'acc-1')
      ).resolves.toEqual({ profileId: 'prof-2' });
      expect(repo.findActiveByOrgAndInternalIdWithProfile).toHaveBeenCalledWith(
        'org-1',
        'acc-1'
      );
    });

    it('canal sem perfil vira null e canal inexistente devolve null', async () => {
      const repo = {
        findActiveByOrgAndInternalIdWithProfile: jest
          .fn()
          .mockResolvedValueOnce({ id: 'int-1' })
          .mockResolvedValueOnce(null),
      };
      const service = makeService(repo);
      await expect(
        service.getChannelProfileByInternalId('org-1', 'acc-1')
      ).resolves.toEqual({ profileId: null });
      await expect(
        service.getChannelProfileByInternalId('org-1', 'acc-2')
      ).resolves.toBeNull();
    });
  });

  describe('validateIntegrationProfile (status HTTP)', () => {
    it('integracao de outro perfil responde 403 e inexistente 404 (nao 500)', async () => {
      const repo = {
        getIntegrationById: jest
          .fn()
          .mockResolvedValueOnce({ id: 'int-1', profileId: 'prof-2' })
          .mockResolvedValueOnce(null),
      };
      const service = makeService(repo);

      let thrown: any;
      try {
        await service.validateIntegrationProfile('org-1', 'int-1', 'prof-1');
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect(thrown.getStatus()).toBe(403);

      try {
        await service.validateIntegrationProfile('org-1', 'int-x', 'prof-1');
      } catch (err) {
        thrown = err;
      }
      expect(thrown.getStatus()).toBe(404);
    });
  });

  describe('plugs (func validado contra os plugs registrados)', () => {
    const makePlugService = (integration: any) => {
      const repo = {
        getIntegrationById: jest.fn().mockResolvedValue(integration),
        createOrUpdatePlug: jest.fn().mockResolvedValue({ activated: true }),
        getPlug: jest.fn(),
      };
      const manager = {
        getAllPlugs: jest.fn().mockReturnValue([
          {
            identifier: 'x',
            name: 'X',
            plugs: [
              {
                methodName: 'autoRepostPost',
                identifier: 'x-autoRepostPost',
                fields: [{ name: 'likesAmount', validation: '/^\\d+$/' }],
              },
            ],
          },
        ]),
        getSocialIntegration: jest.fn(),
      };
      const service = new IntegrationService(
        repo as any,
        {} as any,
        manager as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );
      return { service, repo, manager };
    };
    const body = (func: string, fields = [{ name: 'likesAmount', value: '10' }]) =>
      ({ func, fields } as any);

    it('integracao fora da org responde 404 sem gravar', async () => {
      const { service, repo } = makePlugService(null);
      let thrown: any;
      try {
        await service.createOrUpdatePlug('org-1', 'int-1', body('autoRepostPost'));
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect(thrown.getStatus()).toBe(404);
      expect(repo.createOrUpdatePlug).not.toHaveBeenCalled();
    });

    it('func que nao e um plug registrado do provider responde 400 sem gravar', async () => {
      const { service, repo } = makePlugService({ id: 'int-1', providerIdentifier: 'x' });
      for (const func of ['readOrFetch', 'fetch', 'post', 'x-autoRepostPost']) {
        let thrown: any;
        try {
          await service.createOrUpdatePlug('org-1', 'int-1', body(func));
        } catch (err) {
          thrown = err;
        }
        expect(thrown).toBeInstanceOf(HttpException);
        expect(thrown.getStatus()).toBe(400);
      }
      expect(repo.createOrUpdatePlug).not.toHaveBeenCalled();
    });

    it('campo nao declarado pelo plug responde 400', async () => {
      const { service, repo } = makePlugService({ id: 'int-1', providerIdentifier: 'x' });
      let thrown: any;
      try {
        await service.createOrUpdatePlug(
          'org-1',
          'int-1',
          body('autoRepostPost', [{ name: 'constructor', value: 'x' }])
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown?.getStatus?.()).toBe(400);
      expect(repo.createOrUpdatePlug).not.toHaveBeenCalled();
    });

    it('plug registrado com os campos declarados grava', async () => {
      const { service, repo } = makePlugService({ id: 'int-1', providerIdentifier: 'x' });
      await expect(
        service.createOrUpdatePlug('org-1', 'int-1', body('autoRepostPost'))
      ).resolves.toEqual({ activated: true });
      expect(repo.createOrUpdatePlug).toHaveBeenCalledWith(
        'org-1',
        'int-1',
        body('autoRepostPost')
      );
    });

    it('changePlugActivation exige plug da org e canal do perfil', async () => {
      const { service, repo } = makePlugService({ id: 'int-1', providerIdentifier: 'x', profileId: 'prof-2' });
      (repo as any).getPlugForOrg = jest.fn().mockResolvedValue({ id: 'plug-1', integrationId: 'int-1' });
      (repo as any).changePlugActivation = jest.fn().mockResolvedValue({ id: 'plug-1' });

      let thrown: any;
      try {
        await service.changePlugActivation('org-1', 'plug-1', false, 'prof-1');
      } catch (err) {
        thrown = err;
      }
      expect(thrown?.getStatus?.()).toBe(403);
      expect((repo as any).changePlugActivation).not.toHaveBeenCalled();

      await expect(
        service.changePlugActivation('org-1', 'plug-1', false, 'prof-2')
      ).resolves.toEqual({ id: 'plug-1' });

      (repo as any).getPlugForOrg.mockResolvedValue(null);
      try {
        await service.changePlugActivation('org-1', 'plug-x', false, 'prof-2');
      } catch (err) {
        thrown = err;
      }
      expect(thrown?.getStatus?.()).toBe(404);
    });

    it('processPlugs nao invoca funcao que nao e plug registrado (linha legada) e encerra', async () => {
      const { service, repo, manager } = makePlugService({ id: 'int-1', providerIdentifier: 'x' });
      const provider = { autoRepostPost: jest.fn().mockResolvedValue(true), readOrFetch: jest.fn() };
      manager.getSocialIntegration.mockReturnValue(provider);
      repo.getPlug.mockResolvedValue({
        id: 'plug-1',
        plugFunction: 'readOrFetch',
        data: '[]',
        integration: { providerIdentifier: 'x', token: 'tok' },
      });

      await expect(
        service.processPlugs({ plugId: 'plug-1', postId: 'p', delay: 0, totalRuns: 1, currentRun: 1 })
      ).resolves.toBe(true);
      expect(provider.readOrFetch).not.toHaveBeenCalled();

      repo.getPlug.mockResolvedValue({
        id: 'plug-1',
        plugFunction: 'autoRepostPost',
        data: '[{"name":"likesAmount","value":"10"}]',
        integration: { providerIdentifier: 'x', token: 'tok' },
      });
      await service.processPlugs({ plugId: 'plug-1', postId: 'p', delay: 0, totalRuns: 1, currentRun: 1 });
      expect(provider.autoRepostPost).toHaveBeenCalled();
    });
  });
});
