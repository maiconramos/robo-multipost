// integration.manager puxa todos os providers sociais (nostr-tools e ESM e
// quebra o ts-jest); redis abre conexao no load; upload roda no construtor.
// Mocks seguem o padrao dos demais specs do repo.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn().mockReturnValue({}) },
}));

import { RefreshIntegrationService } from './refresh.integration.service';

const integration = {
  id: 'int-1',
  name: 'Canal X',
  providerIdentifier: 'linkedin',
  organizationId: 'org-1',
  profileId: null,
  refreshToken: 'plain-refresh',
  internalId: 'abc',
  rootInternalId: 'abc',
  picture: null,
} as any;

const buildService = (opts: {
  provider?: any;
  integrationService?: any;
  temporal?: any;
  metaSystemUser?: any;
}) => {
  const provider = opts.provider ?? {
    identifier: 'linkedin',
    refreshToken: jest.fn(),
    reConnect: undefined,
    oneTimeToken: false,
  };
  const manager = {
    getSocialIntegration: jest.fn().mockReturnValue(provider),
    getProviderCredentials: jest.fn().mockResolvedValue(null),
  };
  const integrationService = opts.integrationService ?? {
    disconnectChannel: jest.fn().mockResolvedValue(undefined),
    createOrUpdateIntegration: jest.fn().mockResolvedValue(undefined),
  };
  const encryption = { decrypt: jest.fn((x: string) => x) };
  // Sem system user token por padrao — preserva o comportamento legado
  // (desconectar) nos testes existentes.
  const metaSystemUser = opts.metaSystemUser ?? {
    resolveHealedToken: jest.fn().mockResolvedValue(null),
  };
  const service = new RefreshIntegrationService(
    manager as any,
    integrationService as any,
    (opts.temporal ?? {}) as any,
    encryption as any,
    metaSystemUser as any
  );
  return { service, provider, manager, integrationService, metaSystemUser };
};

describe('RefreshIntegrationService', () => {
  describe('refresh', () => {
    it('renova com sucesso e persiste sem desconectar o canal', async () => {
      const { service, provider, integrationService } = buildService({});
      provider.refreshToken.mockResolvedValue({
        accessToken: 'na',
        refreshToken: 'nr',
        expiresIn: 100,
      });

      const result = await service.refresh(integration);

      expect(result).toEqual({
        accessToken: 'na',
        refreshToken: 'nr',
        expiresIn: 100,
      });
      expect(integrationService.createOrUpdateIntegration).toHaveBeenCalledTimes(
        1
      );
      expect(integrationService.disconnectChannel).not.toHaveBeenCalled();
    });

    it('marca desconectado UMA unica vez quando o refresh retorna false', async () => {
      const { service, provider, integrationService } = buildService({});
      provider.refreshToken.mockResolvedValue(false);

      const result = await service.refresh(integration);

      expect(result).toBe(false);
      expect(integrationService.disconnectChannel).toHaveBeenCalledTimes(1);
      expect(integrationService.disconnectChannel).toHaveBeenCalledWith(
        'org-1',
        integration,
        'Refresh returned no access token'
      );
      expect(
        integrationService.createOrUpdateIntegration
      ).not.toHaveBeenCalled();
    });

    it('cura o canal via system user quando o refresh nativo falha (nao desconecta)', async () => {
      const healed = {
        id: '755639424460731',
        name: 'Pagina X',
        accessToken: 'EAA-healed',
        refreshToken: 'EAA-healed',
        expiresIn: 315360000,
        picture: 'https://pic',
        username: '',
      };
      const metaSystemUser = {
        resolveHealedToken: jest.fn().mockResolvedValue(healed),
      };
      const { service, provider, integrationService } = buildService({
        provider: {
          identifier: 'facebook',
          refreshToken: jest.fn().mockResolvedValue({
            accessToken: '',
            refreshToken: '',
            expiresIn: 0,
          }),
          reConnect: jest.fn(),
          oneTimeToken: false,
        },
        metaSystemUser,
      });

      const fbIntegration = {
        ...integration,
        providerIdentifier: 'facebook',
      };
      const result = await service.refresh(fbIntegration);

      expect(metaSystemUser.resolveHealedToken).toHaveBeenCalledWith(
        fbIntegration,
        expect.objectContaining({ identifier: 'facebook' })
      );
      expect(result).toEqual(healed);
      // Curou: persiste o token novo e NAO desconecta.
      expect(
        integrationService.createOrUpdateIntegration
      ).toHaveBeenCalledTimes(1);
      expect(integrationService.disconnectChannel).not.toHaveBeenCalled();
      // O heal ja veio do reConnect dentro do MetaSystemUserService; o bloco
      // reConnect legado do refreshProcess nao pode rodar de novo.
      expect(provider.reConnect).not.toHaveBeenCalled();
    });

    it('desconecta quando o heal via system user tambem falha (retorna null)', async () => {
      const metaSystemUser = {
        resolveHealedToken: jest.fn().mockResolvedValue(null),
      };
      const { service, integrationService } = buildService({
        provider: {
          identifier: 'facebook',
          refreshToken: jest.fn().mockResolvedValue(false),
          reConnect: jest.fn(),
          oneTimeToken: false,
        },
        metaSystemUser,
      });

      const result = await service.refresh({
        ...integration,
        providerIdentifier: 'facebook',
      });

      expect(result).toBe(false);
      expect(metaSystemUser.resolveHealedToken).toHaveBeenCalledTimes(1);
      expect(integrationService.disconnectChannel).toHaveBeenCalledTimes(1);
    });

    it('loga o motivo real e marca desconectado quando o provider lanca (observabilidade)', async () => {
      const { service, provider, integrationService } = buildService({});
      provider.refreshToken.mockRejectedValue(new Error('invalid_grant'));
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const result = await service.refresh(integration);

      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      // Loga name+message numa unica string (nunca o objeto de erro cru, que
      // carregaria o refresh_token no body). A causa real aparece na mensagem.
      expect(String(errorSpy.mock.calls[0][0])).toContain('invalid_grant');
      expect(integrationService.disconnectChannel).toHaveBeenCalledTimes(1);
      // O motivo sanitizado (name: message) e repassado para persistir em refreshError.
      expect(integrationService.disconnectChannel).toHaveBeenCalledWith(
        'org-1',
        integration,
        expect.stringContaining('invalid_grant')
      );
      errorSpy.mockRestore();
    });
  });

  describe('ensureRefreshTokensCronWorkflow', () => {
    it('inicia o workflow SINGLETON com USE_EXISTING (idempotente)', async () => {
      const start = jest.fn().mockResolvedValue({});
      const temporal = {
        client: { getRawClient: () => ({ workflow: { start } }) },
      };
      const { service } = buildService({ temporal });

      await service.ensureRefreshTokensCronWorkflow();

      expect(start).toHaveBeenCalledTimes(1);
      const [name, opts] = start.mock.calls[0];
      expect(name).toBe('refreshTokensCronWorkflow');
      expect(opts.workflowId).toBe('refresh-tokens-cron');
      expect(opts.workflowIdConflictPolicy).toBe('USE_EXISTING');
      expect(opts.taskQueue).toBe('main');
    });
  });
});
