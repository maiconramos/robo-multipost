import { HttpException } from '@nestjs/common';
import { ProfileService } from '../profile.service';

const makeRepo = () => ({
  getProfileById: jest.fn(),
  getPersona: jest.fn(),
  upsertPersona: jest.fn(),
  deletePersona: jest.fn(),
});

describe('ProfileService - Persona', () => {
  let service: ProfileService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new ProfileService(repo as any);
  });

  describe('getPersona', () => {
    it('throws 404 when profile not in org', async () => {
      repo.getProfileById.mockResolvedValue(null);
      await expect(service.getPersona('org-1', 'prof-1')).rejects.toBeInstanceOf(HttpException);
    });

    it('returns persona when profile exists', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1' });
      repo.getPersona.mockResolvedValue({ id: 'p1' });
      const result = await service.getPersona('org-1', 'prof-1');
      expect(result).toEqual({ id: 'p1' });
      expect(repo.getPersona).toHaveBeenCalledWith('prof-1');
    });
  });

  describe('getPersonaForAgent', () => {
    it('skips org check (internal use)', async () => {
      repo.getPersona.mockResolvedValue({ id: 'p1' });
      const result = await service.getPersonaForAgent('prof-1');
      expect(result).toEqual({ id: 'p1' });
      expect(repo.getProfileById).not.toHaveBeenCalled();
    });
  });

  describe('upsertPersona', () => {
    it('throws 404 when profile not in org', async () => {
      repo.getProfileById.mockResolvedValue(null);
      await expect(
        service.upsertPersona('org-1', 'prof-1', { toneOfVoice: 'x' })
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('upserts when profile exists', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1' });
      repo.upsertPersona.mockResolvedValue({ id: 'p1' });
      const result = await service.upsertPersona('org-1', 'prof-1', { toneOfVoice: 'x' });
      expect(result).toEqual({ id: 'p1' });
      expect(repo.upsertPersona).toHaveBeenCalledWith('prof-1', { toneOfVoice: 'x' });
    });
  });

  describe('deletePersona', () => {
    it('throws 404 when profile not in org', async () => {
      repo.getProfileById.mockResolvedValue(null);
      await expect(service.deletePersona('org-1', 'prof-1')).rejects.toBeInstanceOf(HttpException);
    });

    it('deletes when profile exists', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1' });
      repo.deletePersona.mockResolvedValue({ count: 1 });
      const result = await service.deletePersona('org-1', 'prof-1');
      expect(result).toEqual({ count: 1 });
    });
  });
});
