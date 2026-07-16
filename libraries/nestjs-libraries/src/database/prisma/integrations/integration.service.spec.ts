// integration.manager puxa todos os providers sociais (nostr-tools e ESM e
// quebra o ts-jest); redis abre conexao no load do modulo. Mocks seguem o
// padrao dos demais specs do repo.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn().mockReturnValue({}) },
}));

import { IntegrationService } from './integration.service';
import { SYSTEM_USER_PAGE_TOKEN_TTL } from '@gitroom/nestjs-libraries/integrations/meta-system-user.service';

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
});
