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

const makeService = (repo: any) =>
  new IntegrationService(
    repo,
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
});
