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
