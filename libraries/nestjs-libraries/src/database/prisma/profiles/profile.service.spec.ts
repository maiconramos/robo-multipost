import { HttpException } from '@nestjs/common';
import { ProfileService } from './profile.service';

const makeRepo = () => ({
  getProfileById: jest.fn(),
  getProfileByApiKey: jest.fn(),
  updateApiKey: jest.fn(),
  getMembers: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
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

  describe('getMembers', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(service.getMembers('org-1', 'prof-de-outra-org')).rejects.toBeInstanceOf(
        HttpException
      );
      expect(repo.getMembers).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMembers.mockResolvedValue([{ userId: 'u-1' }]);

      const result = await service.getMembers('org-1', 'prof-1');

      expect(result).toEqual([{ userId: 'u-1' }]);
      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.getMembers).toHaveBeenCalledWith('prof-1');
    });
  });

  describe('addMember', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(
        service.addMember('org-1', 'prof-de-outra-org', 'u-1', 'EDITOR')
      ).rejects.toBeInstanceOf(HttpException);
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addMember('org-1', 'prof-1', 'u-1', 'EDITOR');

      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.addMember).toHaveBeenCalledWith('prof-1', 'u-1', 'EDITOR');
    });
  });

  describe('removeMember', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(
        service.removeMember('org-1', 'prof-de-outra-org', 'u-1')
      ).rejects.toBeInstanceOf(HttpException);
      expect(repo.removeMember).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.removeMember.mockResolvedValue({ id: 'm-1' });

      await service.removeMember('org-1', 'prof-1', 'u-1');

      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.removeMember).toHaveBeenCalledWith('prof-1', 'u-1');
    });
  });
});
