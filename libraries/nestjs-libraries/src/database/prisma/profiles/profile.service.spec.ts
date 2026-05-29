import { HttpException } from '@nestjs/common';
import { ProfileService } from './profile.service';

const makeRepo = () => ({
  getProfileById: jest.fn(),
  getProfileByApiKey: jest.fn(),
  updateApiKey: jest.fn(),
});

describe('ProfileService', () => {
  let service: ProfileService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new ProfileService(repo as any);
  });

  describe('getProfileByApiKey', () => {
    it('delega ao repositorio sem transformacao', async () => {
      const fakeProfile = { id: 'prof-1', apiKey: 'key-abc', organization: {} };
      repo.getProfileByApiKey.mockResolvedValue(fakeProfile);

      const result = await service.getProfileByApiKey('key-abc');

      expect(result).toEqual(fakeProfile);
      expect(repo.getProfileByApiKey).toHaveBeenCalledWith('key-abc');
    });

    it('retorna null quando chave nao existe', async () => {
      repo.getProfileByApiKey.mockResolvedValue(null);

      const result = await service.getProfileByApiKey('inexistente');

      expect(result).toBeNull();
    });
  });

  describe('updateApiKey', () => {
    it('lanca 404 quando perfil nao encontrado', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(service.updateApiKey('org-1', 'prof-1')).rejects.toBeInstanceOf(HttpException);
      expect(repo.updateApiKey).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil encontrado', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.updateApiKey.mockResolvedValue({ id: 'prof-1', apiKey: 'new-key' });

      const result = await service.updateApiKey('org-1', 'prof-1');

      expect(result).toEqual({ id: 'prof-1', apiKey: 'new-key' });
      expect(repo.updateApiKey).toHaveBeenCalledWith('org-1', 'prof-1');
    });
  });
});
