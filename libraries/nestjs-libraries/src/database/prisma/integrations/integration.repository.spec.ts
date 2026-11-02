// UploadFactory.createStorage() roda no construtor do repository.
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn().mockReturnValue({}) },
}));

import { IntegrationRepository } from './integration.repository';
import {
  createPrismaRepositoryMock,
  createMock,
} from '@gitroom/nestjs-libraries/test';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { TOKEN_ENC_PREFIX } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';
import { MockProxy } from 'jest-mock-extended';

// B1 Etapa 2: criptografia LIGADA por padrao; DISABLE_INTEGRATION_TOKEN_ENCRYPTION
// e o freio de emergencia opcional.
describe('IntegrationRepository (B1 Etapa 2 - criptografia na escrita)', () => {
  let repo: IntegrationRepository;
  let prismaMock: ReturnType<typeof createPrismaRepositoryMock<'integration'>>;
  let encryption: MockProxy<EncryptionService> & EncryptionService;
  const ORIGINAL = process.env.DISABLE_INTEGRATION_TOKEN_ENCRYPTION;

  beforeEach(() => {
    // Baseline = default (cifrado). Cada teste que quiser desligar seta DISABLE.
    delete process.env.DISABLE_INTEGRATION_TOKEN_ENCRYPTION;

    prismaMock = createPrismaRepositoryMock('integration');
    prismaMock.model.integration.upsert.mockResolvedValue({ id: 'int-1' } as any);

    encryption = createMock<EncryptionService>();
    encryption.encrypt.mockImplementation((plain: string) => `CIPHER(${plain})`);

    repo = new IntegrationRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      encryption
    );
  });

  afterEach(() => {
    if (ORIGINAL === undefined)
      delete process.env.DISABLE_INTEGRATION_TOKEN_ENCRYPTION;
    else process.env.DISABLE_INTEGRATION_TOKEN_ENCRYPTION = ORIGINAL;
  });

  const create = (token: string, refreshToken = 'REFRESH') =>
    repo.createOrUpdateIntegration(
      undefined,
      false,
      'org-1',
      'nome',
      undefined,
      'social',
      'internal-1',
      'instagram',
      token,
      refreshToken,
      3600,
      'user'
    );

  const upsertArg = () =>
    prismaMock.model.integration.upsert.mock.calls[0][0] as any;

  describe('createOrUpdateIntegration', () => {
    it('grava token cifrado (prefixado) e tokenEncrypted=true por padrao', async () => {
      await create('PLAINTOKEN');

      const arg = upsertArg();
      expect(arg.create.token).toBe(`${TOKEN_ENC_PREFIX}CIPHER(PLAINTOKEN)`);
      expect(arg.create.refreshToken).toBe(`${TOKEN_ENC_PREFIX}CIPHER(REFRESH)`);
      expect(arg.create.tokenEncrypted).toBe(true);
      expect(arg.update.token).toBe(`${TOKEN_ENC_PREFIX}CIPHER(PLAINTOKEN)`);
      expect(arg.update.refreshToken).toBe(`${TOKEN_ENC_PREFIX}CIPHER(REFRESH)`);
      expect(arg.update.tokenEncrypted).toBe(true);
    });

    it('grava token em texto puro e tokenEncrypted=false quando DISABLE_INTEGRATION_TOKEN_ENCRYPTION=true', async () => {
      process.env.DISABLE_INTEGRATION_TOKEN_ENCRYPTION = 'true';

      await create('PLAINTOKEN');

      const arg = upsertArg();
      expect(arg.create.token).toBe('PLAINTOKEN');
      expect(arg.create.refreshToken).toBe('REFRESH');
      expect(arg.create.tokenEncrypted).toBe(false);
      expect(encryption.encrypt).not.toHaveBeenCalled();
    });

    it('e idempotente: nao re-cifra um token que ja tem o prefixo', async () => {
      await create(`${TOKEN_ENC_PREFIX}JACIFRADO`, '');

      const arg = upsertArg();
      expect(arg.create.token).toBe(`${TOKEN_ENC_PREFIX}JACIFRADO`);
      expect(encryption.encrypt).not.toHaveBeenCalled();
    });

    const connectAs = (profileId?: string) =>
      repo.createOrUpdateIntegration(
        undefined,
        false,
        'org-1',
        'nome',
        undefined,
        'social',
        'internal-1',
        'instagram',
        'TOKEN',
        'REFRESH',
        3600,
        'user',
        false,
        undefined,
        undefined,
        undefined,
        profileId
      );

    it('nao troca o token do canal vivo de outro perfil (409)', async () => {
      prismaMock.model.integration.findFirst.mockResolvedValue({
        profileId: 'prof-b',
        deletedAt: null,
      } as any);

      await expect(connectAs('prof-a')).rejects.toMatchObject({ status: 409 });
      expect(prismaMock.model.integration.upsert).not.toHaveBeenCalled();
    });

    it('canal apagado de outro perfil volta no perfil de quem conectou agora', async () => {
      prismaMock.model.integration.findFirst.mockResolvedValue({
        profileId: 'prof-b',
        deletedAt: new Date(),
      } as any);

      await connectAs('prof-a');

      expect(upsertArg().update.profileId).toBe('prof-a');
      expect(upsertArg().update.deletedAt).toBeNull();
    });

    it('reconexao (refresh) do canal pela tela de Status nao e bloqueada', async () => {
      prismaMock.model.integration.findFirst.mockResolvedValue({
        profileId: 'prof-b',
        deletedAt: null,
      } as any);

      await repo.createOrUpdateIntegration(
        undefined, false, 'org-1', 'nome', undefined, 'social', 'internal-1',
        'instagram', 'TOKEN', 'REFRESH', 3600, 'user', false, 'internal-1',
        undefined, undefined, 'prof-a'
      );

      expect(prismaMock.model.integration.upsert).toHaveBeenCalled();
      expect(upsertArg().update.profileId).toBeUndefined();
    });

    it('reconectar no proprio perfil segue normal', async () => {
      prismaMock.model.integration.findFirst.mockResolvedValue({
        profileId: 'prof-a',
        deletedAt: null,
      } as any);

      await connectAs('prof-a');

      expect(upsertArg().update.profileId).toBeUndefined();
      expect(upsertArg().update.token).toBe(`${TOKEN_ENC_PREFIX}CIPHER(TOKEN)`);
    });

    it('cifra tambem o updateMany do oneTimeToken (linhas irmas) por padrao', async () => {
      prismaMock.model.integration.findFirst.mockResolvedValue({
        rootInternalId: 'root-1',
      } as any);
      // createPrismaRepositoryMock nao inclui updateMany — adiciona no mock.
      const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
      (prismaMock.model.integration as any).updateMany = updateManyMock;

      await repo.createOrUpdateIntegration(
        undefined,
        true, // oneTimeToken
        'org-1',
        'nome',
        undefined,
        'social',
        'internal-1_child',
        'instagram',
        'PLAINTOKEN',
        'REFRESH',
        3600,
        'user'
      );

      const arg = updateManyMock.mock.calls[0][0] as any;
      expect(arg.data.token).toBe(`${TOKEN_ENC_PREFIX}CIPHER(PLAINTOKEN)`);
      expect(arg.data.refreshToken).toBe(`${TOKEN_ENC_PREFIX}CIPHER(REFRESH)`);
      expect(arg.data.tokenEncrypted).toBe(true);
    });

    it('oneTimeToken so propaga o token para linhas irmas da mesma org', async () => {
      prismaMock.model.integration.findFirst.mockResolvedValue({
        rootInternalId: 'root-1',
      } as any);
      const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
      (prismaMock.model.integration as any).updateMany = updateManyMock;

      await repo.createOrUpdateIntegration(
        undefined,
        true,
        'org-1',
        'nome',
        undefined,
        'social',
        'internal-1_child',
        'linkedin',
        'PLAINTOKEN',
        '',
        3600,
        'user'
      );

      const arg = updateManyMock.mock.calls[0][0] as any;
      expect(arg.where).toMatchObject({ organizationId: 'org-1', rootInternalId: 'root-1' });
      // login sem refresh token nao apaga o das linhas irmas (upstream #1884)
      expect('refreshToken' in arg.data).toBe(false);
    });
  });

  describe('createOrUpdateIntegration - refresh token vazio (upstream #1884)', () => {
    it('reconexao sem refresh token nao apaga o refresh token salvo', async () => {
      await create('PLAINTOKEN', '');
      const arg = upsertArg();
      expect('refreshToken' in arg.update).toBe(false);
    });
  });

  describe('updateIntegration - pagina reescolhida (upstream #2298)', () => {
    it('a linha que continua assume identidade, refresh token e validade do login novo', async () => {
      const tokenExpiration = new Date('2026-12-01T00:00:00Z');
      prismaMock.model.integration.findUnique.mockResolvedValueOnce({
        id: 'old-row',
      } as any);
      prismaMock.model.integration.findFirst.mockResolvedValueOnce({
        rootInternalId: 'root-novo',
        refreshToken: `${TOKEN_ENC_PREFIX}CIPHER(REFRESH-NOVO)`,
        tokenExpiration,
      } as any);
      prismaMock.model.integration.update.mockResolvedValue({ id: 'old-row' } as any);
      const postsUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
      (repo as any)._posts = { model: { post: { updateMany: postsUpdateMany } } };

      await repo.updateIntegration('new-row', {
        organizationId: 'org-1',
        internalId: 'page-1',
        token: 'PAGE',
      } as any);

      // a linha nova so e lida dentro da org da requisicao
      expect(prismaMock.model.integration.findFirst.mock.calls[0][0]).toEqual({
        where: { id: 'new-row', organizationId: 'org-1' },
        select: { rootInternalId: true, refreshToken: true, tokenExpiration: true },
      });
      const last = prismaMock.model.integration.update.mock.calls.at(-1)![0] as any;
      expect(last.where).toEqual({ id: 'old-row' });
      expect(last.data).toMatchObject({
        rootInternalId: 'root-novo',
        refreshToken: `${TOKEN_ENC_PREFIX}CIPHER(REFRESH-NOVO)`,
        tokenExpiration,
        refreshNeeded: false,
      });
    });
  });

  describe('updateIntegration', () => {
    it('cifra params.token e seta tokenEncrypted=true por padrao', async () => {
      prismaMock.model.integration.findUnique.mockResolvedValue(null as any);
      prismaMock.model.integration.update.mockResolvedValue({ id: 'int-1' } as any);

      await repo.updateIntegration('int-1', {
        organizationId: 'org-1',
        internalId: 'internal-1',
        token: 'NEWTOKEN',
      } as any);

      const arg = prismaMock.model.integration.update.mock.calls[0][0] as any;
      expect(arg.data.token).toBe(`${TOKEN_ENC_PREFIX}CIPHER(NEWTOKEN)`);
      expect(arg.data.tokenEncrypted).toBe(true);
    });

    it('nao cifra e nao seta tokenEncrypted quando DISABLE_INTEGRATION_TOKEN_ENCRYPTION=true', async () => {
      process.env.DISABLE_INTEGRATION_TOKEN_ENCRYPTION = 'true';
      prismaMock.model.integration.findUnique.mockResolvedValue(null as any);
      prismaMock.model.integration.update.mockResolvedValue({ id: 'int-1' } as any);

      await repo.updateIntegration('int-1', {
        organizationId: 'org-1',
        internalId: 'internal-1',
        token: 'NEWTOKEN',
      } as any);

      const arg = prismaMock.model.integration.update.mock.calls[0][0] as any;
      expect(arg.data.token).toBe('NEWTOKEN');
      expect(arg.data.tokenEncrypted).toBeUndefined();
      expect(encryption.encrypt).not.toHaveBeenCalled();
    });
  });

  describe('markRefreshNeeded', () => {
    it('transiciona false->true de forma atomica, grava o motivo e retorna true', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      (prismaMock.model.integration as any).updateMany = updateMany;

      const result = await repo.markRefreshNeeded(
        'org-1',
        'int-1',
        'ApplicationFailure: expired'
      );

      expect(result).toBe(true);
      const arg = updateMany.mock.calls[0][0] as any;
      // Guard atomico (sem read-then-write) + persistencia do motivo na MESMA escrita.
      expect(arg.where).toEqual({
        id: 'int-1',
        organizationId: 'org-1',
        refreshNeeded: false,
      });
      expect(arg.data.refreshNeeded).toBe(true);
      expect(arg.data.refreshError).toBe('ApplicationFailure: expired');
      expect(arg.data.refreshErrorAt).toBeInstanceOf(Date);
    });

    it('grava refreshError=null quando nao ha motivo', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      (prismaMock.model.integration as any).updateMany = updateMany;

      await repo.markRefreshNeeded('org-1', 'int-1');

      expect(updateMany.mock.calls[0][0].data.refreshError).toBeNull();
    });

    it('retorna false quando o canal ja estava desconectado (0 linhas afetadas)', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      (prismaMock.model.integration as any).updateMany = updateMany;

      const result = await repo.markRefreshNeeded('org-1', 'int-1');

      expect(result).toBe(false);
    });
  });

  describe('getProblemChannels', () => {
    it('filtra refreshNeeded OR disabled por org e embute o perfil (sem token)', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prismaMock.model.integration as any).findMany = findMany;

      await repo.getProblemChannels('org-1');

      const arg = findMany.mock.calls[0][0] as any;
      expect(arg.where.organizationId).toBe('org-1');
      expect(arg.where.deletedAt).toBeNull();
      expect(arg.where.AND).toContainEqual({
        OR: [{ profileId: null }, { clientProfile: { deletedAt: null } }],
      });
      expect(arg.where.OR).toEqual([
        { refreshNeeded: true },
        { disabled: true },
      ]);
      // select EXPLICITO — nunca token/refreshToken
      expect(arg.select.token).toBeUndefined();
      expect(arg.select.refreshToken).toBeUndefined();
      expect(arg.select.refreshError).toBe(true);
      expect(arg.select.clientProfile.select).toEqual({ id: true, name: true });
    });

    it('aplica profileId ao filtro quando informado', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prismaMock.model.integration as any).findMany = findMany;

      await repo.getProblemChannels('org-1', 'prof-2');

      expect(findMany.mock.calls[0][0].where.profileId).toBe('prof-2');
    });
  });

  describe('needsToBeRefreshed', () => {
    it('ignora canais de perfis cancelados', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prismaMock.model.integration as any).findMany = findMany;

      await repo.needsToBeRefreshed();

      expect(findMany.mock.calls[0][0].where.OR).toEqual([
        { profileId: null },
        { clientProfile: { deletedAt: null } },
      ]);
    });
  });

  describe('getIntegrationsList', () => {
    it('ignora perfis cancelados sem esconder canais compartilhados do workspace', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prismaMock.model.integration as any).findMany = findMany;

      await repo.getIntegrationsList('org-1', 'prof-2');

      expect(findMany.mock.calls[0][0].where.AND).toEqual([
        {
          OR: [{ profileId: null }, { clientProfile: { deletedAt: null } }],
        },
        { OR: [{ profileId: 'prof-2' }, { profileId: null }] },
      ]);
    });
  });

  describe('getIntegrationById', () => {
    it('exige canal e perfil ativos sem esconder canal compartilhado', async () => {
      prismaMock.model.integration.findFirst.mockResolvedValue(null);

      await repo.getIntegrationById('org-1', 'int-1', 'prof-2');

      const where = prismaMock.model.integration.findFirst.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
      expect(where.AND).toEqual([
        {
          OR: [{ profileId: null }, { clientProfile: { deletedAt: null } }],
        },
        { OR: [{ profileId: 'prof-2' }, { profileId: null }] },
      ]);
    });
  });

  describe('perfis cancelados legados', () => {
    it('nao despacha webhooks para canais de perfil cancelado', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prismaMock.model.integration as any).findMany = findMany;

      await repo.getIntegrationsByInternalId('ig-1');

      expect(findMany.mock.calls[0][0].where.OR).toEqual([
        { profileId: null },
        { clientProfile: { deletedAt: null } },
      ]);
    });

    it('libera o internalId antigo para uma nova conexao', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      (prismaMock.model.integration as any).updateMany = updateMany;

      await repo.checkForDeletedOnceAndUpdate('org-1', 'ig-1');

      expect(updateMany.mock.calls[0][0].where.OR).toEqual([
        { deletedAt: { not: null } },
        { clientProfile: { deletedAt: { not: null } } },
      ]);
    });

    it('nao usa canais cancelados ao reduzir a cota do plano', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prismaMock.model.integration as any).findMany = findMany;

      await repo.disableIntegrations('org-1', 2);

      expect(findMany.mock.calls[0][0].where.OR).toEqual([
        { profileId: null },
        { clientProfile: { deletedAt: null } },
      ]);
    });
  });

  describe('updateIntegration (fail-soft do avatar)', () => {
    it('mantem a picture original quando o upload do avatar falha (nao derruba a conexao)', async () => {
      (repo as any).storage = {
        uploadSimple: jest.fn().mockRejectedValue(new Error('R2 403')),
      };
      prismaMock.model.integration.findUnique.mockResolvedValue(null as any);
      prismaMock.model.integration.update.mockResolvedValue({
        id: 'int-1',
      } as any);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(
        repo.updateIntegration('int-1', {
          organizationId: 'org-1',
          internalId: 'internal-1',
          picture: 'https://provider.example/avatar.jpg',
        } as any)
      ).resolves.toEqual({ id: 'int-1' });

      const arg = prismaMock.model.integration.update.mock.calls[0][0] as any;
      expect(arg.data.picture).toBe('https://provider.example/avatar.jpg');
    });
  });
});

// CVE-2026-107761: a resposta do delete de canal voltava com a linha inteira
// (token, refreshToken, customInstanceDetails).
describe('IntegrationRepository.deleteChannel', () => {
  it('marca deletedAt e devolve apenas o id do canal', async () => {
    const prismaMock = createPrismaRepositoryMock('integration');
    prismaMock.model.integration.update.mockResolvedValue({ id: 'int-1' } as any);
    const repo = new IntegrationRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      createMock<EncryptionService>()
    );

    await expect(repo.deleteChannel('org-1', 'int-1')).resolves.toEqual({
      id: 'int-1',
    });

    expect(prismaMock.model.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'int-1', organizationId: 'org-1' },
        data: { deletedAt: expect.any(Date) },
        select: { id: true },
      })
    );
  });
});

// CVE-2026-107761 (mesma classe): updates cujo resultado volta ao dashboard
// nao podem ecoar a linha inteira do canal.
describe('IntegrationRepository - updates devolvem apenas campos seguros', () => {
  const build = () => {
    const prismaMock = createPrismaRepositoryMock('integration');
    prismaMock.model.integration.update.mockResolvedValue({ id: 'int-1' } as any);
    const customers = {
      model: {
        customer: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cust-1' }),
          create: jest.fn(),
        },
      },
    };
    const repo = new IntegrationRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      customers as any,
      {} as any,
      {} as any,
      createMock<EncryptionService>()
    );
    return { repo, prismaMock };
  };

  it('updateNameAndUrl seleciona id, name e picture', async () => {
    const { repo, prismaMock } = build();
    await repo.updateNameAndUrl('int-1', 'Apelido', 'https://img/x.png');
    expect(prismaMock.model.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true, picture: true } })
    );
  });

  it('updateIntegrationGroup seleciona id e customerId', async () => {
    const { repo, prismaMock } = build();
    await repo.updateIntegrationGroup('org-1', 'int-1', 'cust-1');
    expect(prismaMock.model.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'int-1', organizationId: 'org-1' },
        select: { id: true, customerId: true },
      })
    );
  });
});

describe('IntegrationRepository.getPlugForOrg', () => {
  it('busca o plug restrito a org, so com id e integrationId', async () => {
    const plugsMock = createPrismaRepositoryMock('plugs');
    plugsMock.model.plugs.findFirst.mockResolvedValue({
      id: 'plug-1',
      integrationId: 'int-1',
    } as any);
    const repo = new IntegrationRepository(
      {} as any,
      {} as any,
      plugsMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await expect(repo.getPlugForOrg('org-1', 'plug-1')).resolves.toEqual({
      id: 'plug-1',
      integrationId: 'int-1',
    });
    expect(plugsMock.model.plugs.findFirst).toHaveBeenCalledWith({
      where: { id: 'plug-1', organizationId: 'org-1' },
      select: { id: true, integrationId: true },
    });
  });
});

describe('IntegrationRepository - grupos (upstream #2183)', () => {
  it('conta canais do grupo fora do perfil, inclusive os sem perfil, so na org', async () => {
    const integration = createPrismaRepositoryMock('integration');
    integration.model.integration.count.mockResolvedValue(1 as any);
    const repo = new IntegrationRepository(
      integration as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await repo.countCustomerIntegrationsOutsideProfile('org-1', 'cli-1', 'perfil-1');

    expect(integration.model.integration.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        customerId: 'cli-1',
        deletedAt: null,
        OR: [{ profileId: null }, { profileId: { not: 'perfil-1' } }],
      },
    });
  });
});

describe('IntegrationRepository.updateCustomName (upstream #2190)', () => {
  it('grava o nome aparado, restrito a org, e vazio volta ao nome da plataforma', async () => {
    const integration = createPrismaRepositoryMock('integration');
    integration.model.integration.update.mockResolvedValue({ id: 'int-1' } as any);
    const repo = new IntegrationRepository(
      integration as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await repo.updateCustomName('org-1', 'int-1', '  Loja Centro  ');
    await repo.updateCustomName('org-1', 'int-1', '   ');

    expect(integration.model.integration.update).toHaveBeenNthCalledWith(1, {
      select: { id: true },
      where: { id: 'int-1', organizationId: 'org-1' },
      data: { customName: 'Loja Centro' },
    });
    expect(integration.model.integration.update.mock.calls[1][0].data).toEqual({
      customName: null,
    });
  });
});

describe('IntegrationRepository - consultas de grupo escopadas (upstream #2183)', () => {
  const build = () => {
    const customer = createPrismaRepositoryMock('customer');
    const repo = new IntegrationRepository(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      customer as any,
      {} as any,
      {} as any
    );
    return { customer, repo };
  };

  it('busca grupo por id e por nome so na org e sem os apagados', async () => {
    const { customer, repo } = build();
    customer.model.customer.findFirst.mockResolvedValue(null);

    await repo.getCustomer('org-1', 'cli-1');
    await repo.getCustomerByName('org-1', 'Loja');

    expect(customer.model.customer.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'cli-1', orgId: 'org-1', deletedAt: null },
      select: { id: true },
    });
    expect(customer.model.customer.findFirst).toHaveBeenNthCalledWith(2, {
      where: { orgId: 'org-1', name: 'Loja', deletedAt: null },
      select: { id: true },
    });
  });

  it('renomeia restrito a org e devolve so id e nome', async () => {
    const { customer, repo } = build();
    customer.model.customer.update.mockResolvedValue({ id: 'cli-1', name: 'Novo' } as any);

    await repo.updateCustomerName('org-1', 'cli-1', 'Novo');

    expect(customer.model.customer.update).toHaveBeenCalledWith({
      where: { id: 'cli-1', orgId: 'org-1' },
      data: { name: 'Novo' },
      select: { id: true, name: true },
    });
  });
});
