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
      scheduledAutomationEvent: {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn(),
      },
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
        reconcileWorkflows: jest
          .fn()
          .mockResolvedValue({ total: 0, reconciled: 0 }),
      } as any,
      {
        ensureRefreshTokensCronWorkflow: jest.fn().mockResolvedValue(undefined),
      } as any,
      { ensureMigrationWorkflow: jest.fn().mockResolvedValue(undefined) } as any
    );
  });

  it('limpa capturas agendadas expiradas no boot de forma idempotente', async () => {
    prisma.scheduledAutomationEvent.count.mockResolvedValue(2);
    await service.onModuleInit();
    expect(prisma.scheduledAutomationEvent.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    prisma.scheduledAutomationEvent.deleteMany.mockClear();
    prisma.scheduledAutomationEvent.count.mockResolvedValue(0);
    await service.onModuleInit();
    expect(prisma.scheduledAutomationEvent.deleteMany).not.toHaveBeenCalled();
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
        reconcileWorkflows: jest
          .fn()
          .mockResolvedValue({ total: 0, reconciled: 0 }),
      } as any,
      {
        ensureRefreshTokensCronWorkflow: jest.fn().mockResolvedValue(undefined),
      } as any,
      { ensureMigrationWorkflow: jest.fn().mockResolvedValue(undefined) } as any
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

  const buildService = (
    ensure: jest.Mock,
    reconcile = jest.fn().mockResolvedValue({ total: 0, reconciled: 0 })
  ) =>
    new StartupMigrationService(
      buildPrisma() as any,
      { reconcileWorkflows: reconcile } as any,
      { ensureRefreshTokensCronWorkflow: ensure } as any,
      { ensureMigrationWorkflow: jest.fn().mockResolvedValue(undefined) } as any
    );

  // o cliente do Temporal so fica pronto no onModuleInit do TemporalService,
  // que corre em paralelo com o nosso: os passos que iniciam workflow vao para
  // o bootstrap (depois de todos os onModuleInit)
  it('garante o cron de refresh e os reposts so no bootstrap', async () => {
    const ensure = jest.fn().mockResolvedValue(undefined);
    const reconcile = jest.fn().mockResolvedValue({ total: 0, reconciled: 0 });
    const service = buildService(ensure, reconcile);

    await service.onModuleInit();
    expect(ensure).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();

    await service.onApplicationBootstrap();
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(
      (service as any).postWorkflowMigration.ensureMigrationWorkflow
    ).toHaveBeenCalledTimes(1);
  });

  it('nao derruba o boot quando o start do cron falha', async () => {
    const ensure = jest.fn().mockRejectedValue(new Error('temporal down'));

    await expect(
      buildService(ensure).onApplicationBootstrap()
    ).resolves.toBeUndefined();
  });
});

// Linhas Skool gravadas antes de 23/10/2026 sao JWTs assinados com o JSON que
// o cliente enviou (oraculo de forja fechado no extension-refresh). A migracao
// reescreve em AES so com os cookies esperados.
describe('StartupMigrationService.migrateSkoolExtensionCookies', () => {
  const ORIGINAL_SECRET = process.env.JWT_SECRET;
  const secret = 'segredo-de-teste';
  // eslint-free: jsonwebtoken e CJS; sign real para o verifyJWT do helper
  const { sign } = jest.requireActual(
    'jsonwebtoken'
  ) as typeof import('jsonwebtoken');
  const { AuthService } = jest.requireActual(
    '@gitroom/helpers/auth/auth.service'
  ) as typeof import('@gitroom/helpers/auth/auth.service');

  const build = () => {
    const prisma = {
      integration: {
        count: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new StartupMigrationService(
      prisma as any,
      {} as any,
      {} as any,
      { ensureMigrationWorkflow: jest.fn().mockResolvedValue(undefined) } as any
    );
    const warn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);
    jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation(() => undefined);
    const run = () => (service as any).migrateSkoolExtensionCookies();
    return { prisma, run, warn };
  };

  const row = (customInstanceDetails: string, id = 'int-1') => ({
    id,
    organizationId: 'org-1',
    customInstanceDetails,
  });

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_SECRET;
  });

  it('nao faz nada quando nenhuma linha esta no formato JWT (count guard)', async () => {
    const { prisma, run } = build();
    prisma.integration.count.mockResolvedValue(0);

    await run();

    expect(prisma.integration.findMany).not.toHaveBeenCalled();
    expect(prisma.integration.count).toHaveBeenCalledWith({
      where: {
        providerIdentifier: 'skool',
        customInstanceDetails: { startsWith: 'eyJ' },
      },
    });
  });

  it('converte um JWT legitimo para AES contendo apenas os cookies', async () => {
    const { prisma, run, warn } = build();
    prisma.integration.count.mockResolvedValue(1);
    prisma.integration.findMany.mockResolvedValue([
      row(sign({ client_id: 'cid', auth_token: 'tok' }, secret)),
    ]);

    await run();

    const data = prisma.integration.update.mock.calls[0][0].data;
    expect(
      JSON.parse(AuthService.fixedDecryption(data.customInstanceDetails))
    ).toEqual({ client_id: 'cid', auth_token: 'tok' });
    expect(data.customInstanceDetails.startsWith('eyJ')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('descarta claims extras (adulteracao) e registra aviso', async () => {
    const { prisma, run, warn } = build();
    prisma.integration.count.mockResolvedValue(1);
    prisma.integration.findMany.mockResolvedValue([
      row(
        sign(
          { client_id: 'cid', auth_token: 'tok', id: 'vitima', saasName: 'x' },
          secret
        )
      ),
    ]);

    await run();

    const data = prisma.integration.update.mock.calls[0][0].data;
    expect(
      JSON.parse(AuthService.fixedDecryption(data.customInstanceDetails))
    ).toEqual({ client_id: 'cid', auth_token: 'tok' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('id, saasName'));
  });

  it('marca para reconexao quando o JWT nao tem os cookies ou nao verifica', async () => {
    const { prisma, run } = build();
    prisma.integration.count.mockResolvedValue(2);
    prisma.integration.findMany.mockResolvedValue([
      row(sign({ client_id: 'cid' }, secret), 'int-sem-token'),
      row(
        sign({ client_id: 'cid', auth_token: 'tok' }, 'outro'),
        'int-outro-segredo'
      ),
    ]);

    await run();

    expect(prisma.integration.update).toHaveBeenCalledWith({
      where: { id: 'int-sem-token' },
      data: { refreshNeeded: true },
    });
    expect(prisma.integration.update).toHaveBeenCalledWith({
      where: { id: 'int-outro-segredo' },
      data: { refreshNeeded: true },
    });
  });
});

describe('StartupMigrationService.migrateLateToZernio', () => {
  it('copia a chave Late uma vez e apaga a origem (nao volta no proximo boot)', async () => {
    const executed: string[] = [];
    const tx = {
      $executeRawUnsafe: jest.fn(async (sql: string) => {
        executed.push(sql.replace(/\s+/g, ' ').trim());
      }),
    };
    const prisma: any = {
      integration: { count: jest.fn().mockResolvedValue(0) },
      organization: { count: jest.fn().mockResolvedValue(1) },
      profile: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    };
    const service = new StartupMigrationService(prisma, {} as any, {} as any, {} as any);

    await (service as any).migrateLateToZernio();

    expect(executed.some((sql) => sql.includes('SET "zernioApiKey" = "lateApiKey"'))).toBe(true);
    expect(
      executed.some((sql) =>
        sql.includes('UPDATE "Organization" SET "lateApiKey" = NULL, "shareLateWithProfiles" = false')
      )
    ).toBe(true);
    expect(executed.some((sql) => sql.includes('UPDATE "Profile" SET "lateApiKey" = NULL'))).toBe(true);
  });

  it('sem nada pendente nem sobra Late, nao roda nada', async () => {
    const prisma: any = {
      integration: { count: jest.fn().mockResolvedValue(0) },
      organization: { count: jest.fn().mockResolvedValue(0) },
      profile: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(),
    };
    const service = new StartupMigrationService(prisma, {} as any, {} as any, {} as any);

    await (service as any).migrateLateToZernio();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
