// Mocks topo-de-modulo: importar MediaCleanupService puxa PostsService ->
// IntegrationManager (nostr.provider, ESM-only que quebra ts-jest) e o
// alias @gitroom/backend. Nada disso e usado por este spec.
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManagerMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/short-linking/short.link.service',
  () => ({ ShortLinkService: class ShortLinkServiceMock {} })
);

import { StartupMigrationService } from './startup-migration.service';
import { MediaCleanupService } from '@gitroom/nestjs-libraries/database/prisma/media/media.cleanup.service';
import { createMock } from '@gitroom/nestjs-libraries/test';

describe('StartupMigrationService', () => {
  let prisma: any;
  let mediaCleanupService: ReturnType<typeof createMock<MediaCleanupService>>;
  let service: StartupMigrationService;

  beforeEach(() => {
    // Todas as migracoes existentes viram no-op via count-guard (0).
    prisma = {
      providerCredential: { count: jest.fn().mockResolvedValue(0) },
      organization: { count: jest.fn().mockResolvedValue(0) },
      profile: { count: jest.fn().mockResolvedValue(0) },
      integration: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      repostRule: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      repostRuleDestination: { upsert: jest.fn() },
      unmatchedComment: {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };

    mediaCleanupService = createMock<MediaCleanupService>();
    mediaCleanupService.cleanup.mockResolvedValue({ deleted: 0, skipped: 0 });

    service = new StartupMigrationService(prisma, mediaCleanupService);
  });

  it('deve chamar o cleanup de midia no onModuleInit', async () => {
    await service.onModuleInit();

    expect(mediaCleanupService.cleanup).toHaveBeenCalled();
  });

  it('nao deve derrubar o boot quando o cleanup de midia falha', async () => {
    mediaCleanupService.cleanup.mockRejectedValue(new Error('boom'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
