import 'reflect-metadata';

const redisStore = new Map<string, string>();
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
    }),
  },
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/refresh.integration.service', () => ({
  RefreshIntegrationService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);

import { NoAuthIntegrationsController } from './no.auth.integrations.controller';

describe('NoAuthIntegrationsController.saveProviderPage', () => {
  const build = () => {
    const integrationService = { saveProviderPage: jest.fn().mockResolvedValue({ success: true }) };
    const organizationService = { getOrgById: jest.fn().mockResolvedValue({ id: 'org-1' }) };
    const controller = new NoAuthIntegrationsController(
      {} as any,
      integrationService as any,
      {} as any,
      organizationService as any
    );
    return { controller, integrationService };
  };

  beforeEach(() => redisStore.clear());

  it('recusa escolher pagina de canal pendente que nao foi criado por este state', async () => {
    const { controller, integrationService } = build();
    redisStore.set('organization:STATE_A', 'org-1');
    redisStore.set('pending:STATE_A', 'int-A');

    await expect(
      controller.saveProviderPage('int-B', { state: 'STATE_A', page: 'p2' } as any)
    ).rejects.toMatchObject({ status: 400 });
    expect(integrationService.saveProviderPage).not.toHaveBeenCalled();
  });

  it('conclui a escolha do proprio canal e consome o state', async () => {
    const { controller, integrationService } = build();
    redisStore.set('organization:STATE_A', 'org-1');
    redisStore.set('pending:STATE_A', 'int-A');
    redisStore.set('login:STATE_A', 'verifier');

    await controller.saveProviderPage('int-A', { state: 'STATE_A', page: 'p1' } as any);

    expect(integrationService.saveProviderPage).toHaveBeenCalledWith('org-1', 'int-A', { page: 'p1' });
    expect(redisStore.has('organization:STATE_A')).toBe(false);
    expect(redisStore.has('pending:STATE_A')).toBe(false);
    await expect(
      controller.saveProviderPage('int-A', { state: 'STATE_A', page: 'p1' } as any)
    ).rejects.toMatchObject({ status: 400 });
  });
});
