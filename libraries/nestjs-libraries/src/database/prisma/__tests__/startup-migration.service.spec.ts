import 'reflect-metadata';

// Mocks topo-de-modulo: StartupMigrationService passou a importar
// MediaCleanupService -> PostsService -> IntegrationManager
// (nostr.provider, ESM-only que quebra ts-jest) e o alias
// @gitroom/backend. Nada disso e usado por este spec.
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

import { StartupMigrationService } from '../startup-migration.service';

describe('StartupMigrationService.cleanupExpiredUnmatchedComments', () => {
  let service: StartupMigrationService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      providerCredential: { count: jest.fn().mockResolvedValue(0) },
      organization: { count: jest.fn().mockResolvedValue(0) },
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
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    const mediaCleanupService = {
      cleanup: jest.fn().mockResolvedValue({ deleted: 0, skipped: 0 }),
    };
    service = new StartupMigrationService(
      prisma,
      mediaCleanupService as any
    );
  });

  it('deve ser no-op quando nao ha PENDING > 30 dias', async () => {
    prisma.unmatchedComment.count.mockResolvedValue(0);

    await service.onModuleInit();

    expect(prisma.unmatchedComment.deleteMany).not.toHaveBeenCalled();
  });

  it('deve deletar PENDING anteriores ao cutoff de 30 dias', async () => {
    prisma.unmatchedComment.count.mockResolvedValue(5);
    prisma.unmatchedComment.deleteMany.mockResolvedValue({ count: 5 });

    await service.onModuleInit();

    expect(prisma.unmatchedComment.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'PENDING',
        createdAt: expect.objectContaining({ lt: expect.any(Date) }),
      }),
    });
  });

  it('nao deve derrubar o boot quando deleteMany falha', async () => {
    prisma.unmatchedComment.count.mockResolvedValue(3);
    prisma.unmatchedComment.deleteMany.mockRejectedValue(
      new Error('DB connection lost')
    );

    // Nao lanca — apenas loga
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
