import 'reflect-metadata';

// O tipo RepostService no construtor puxa integration.manager (nostr-tools e
// ESM e quebra o ts-jest); mock segue o padrao dos demais specs do repo.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));

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
      flow: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    service = new StartupMigrationService(
      prisma,
      {
        reconcileWorkflows: jest.fn().mockResolvedValue({ started: 0 }),
      } as any,
      {
        ensureRefreshTokensCronWorkflow: jest
          .fn()
          .mockResolvedValue(undefined),
      } as any
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

describe('StartupMigrationService.backfillFlowsToDefaultProfile', () => {
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
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn(),
      },
      flow: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    service = new StartupMigrationService(
      prisma,
      {
        reconcileWorkflows: jest.fn().mockResolvedValue({ started: 0 }),
      } as any,
      {
        ensureRefreshTokensCronWorkflow: jest
          .fn()
          .mockResolvedValue(undefined),
      } as any
    );
  });

  it('deve ser no-op quando nao ha flow com profileId null', async () => {
    prisma.flow.count.mockResolvedValue(0);

    await service.onModuleInit();

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('deve rodar UPDATE atribuindo flows null ao perfil Default', async () => {
    prisma.flow.count.mockResolvedValue(2);

    await service.onModuleInit();

    expect(prisma.flow.count).toHaveBeenCalledWith({
      where: { profileId: null },
    });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "Flow"')
    );
  });

  it('nao deve derrubar o boot quando o UPDATE falha', async () => {
    prisma.flow.count.mockResolvedValue(1);
    prisma.$executeRawUnsafe.mockRejectedValue(new Error('DB down'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

describe('StartupMigrationService.reconcileRefreshTokensCron', () => {
  const buildPrisma = () => ({
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
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn(),
    },
    flow: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  });

  const buildService = (ensure: jest.Mock) =>
    new StartupMigrationService(
      buildPrisma() as any,
      { reconcileWorkflows: jest.fn().mockResolvedValue({ started: 0 }) } as any,
      { ensureRefreshTokensCronWorkflow: ensure } as any
    );

  it('garante o workflow cron de refresh (singleton) no boot', async () => {
    const ensure = jest.fn().mockResolvedValue(undefined);

    await buildService(ensure).onModuleInit();

    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it('nao derruba o boot quando o start do cron falha', async () => {
    const ensure = jest.fn().mockRejectedValue(new Error('temporal down'));

    await expect(buildService(ensure).onModuleInit()).resolves.toBeUndefined();
  });
});
