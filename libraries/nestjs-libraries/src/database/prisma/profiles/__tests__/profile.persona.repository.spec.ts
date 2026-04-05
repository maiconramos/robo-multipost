import { ProfileRepository } from '../profile.repository';

const mockPersonaModel = {
  model: {
    profilePersona: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
};

const mockProfileModel = { model: { profile: {} } };
const mockProfileMemberModel = { model: { profileMember: {} } };

describe('ProfileRepository - Persona', () => {
  let repository: ProfileRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new ProfileRepository(
      mockProfileModel as any,
      mockProfileMemberModel as any,
      mockPersonaModel as any
    );
  });

  describe('getPersona', () => {
    it('returns persona by profileId', async () => {
      mockPersonaModel.model.profilePersona.findUnique.mockResolvedValue({
        id: 'p1',
        profileId: 'prof-1',
      });
      const result = await repository.getPersona('prof-1');
      expect(result).toEqual({ id: 'p1', profileId: 'prof-1' });
      expect(mockPersonaModel.model.profilePersona.findUnique).toHaveBeenCalledWith({
        where: { profileId: 'prof-1' },
      });
    });
  });

  describe('upsertPersona', () => {
    it('trims and filters empty CTAs and truncates examplePosts to 5', async () => {
      mockPersonaModel.model.profilePersona.upsert.mockResolvedValue({ id: 'p1' });
      await repository.upsertPersona('prof-1', {
        brandDescription: 'Brand X',
        toneOfVoice: 'friendly',
        preferredCtas: ['  Buy now  ', '', 'Subscribe', '   '],
        examplePosts: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      });

      const call = mockPersonaModel.model.profilePersona.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ profileId: 'prof-1' });
      expect(call.create.preferredCtas).toEqual(['Buy now', 'Subscribe']);
      expect(call.update.preferredCtas).toEqual(['Buy now', 'Subscribe']);
      expect(call.create.examplePosts).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(call.create.brandDescription).toBe('Brand X');
      expect(call.create.toneOfVoice).toBe('friendly');
    });

    it('sets optional fields to null when undefined', async () => {
      mockPersonaModel.model.profilePersona.upsert.mockResolvedValue({ id: 'p1' });
      await repository.upsertPersona('prof-1', {});
      const call = mockPersonaModel.model.profilePersona.upsert.mock.calls[0][0];
      expect(call.create.brandDescription).toBeNull();
      expect(call.create.toneOfVoice).toBeNull();
      expect(call.create.preferredCtas).toEqual([]);
      expect(call.create.examplePosts).toEqual([]);
    });
  });

  describe('deletePersona', () => {
    it('deletes persona for profileId', async () => {
      mockPersonaModel.model.profilePersona.deleteMany.mockResolvedValue({ count: 1 });
      const result = await repository.deletePersona('prof-1');
      expect(result).toEqual({ count: 1 });
      expect(mockPersonaModel.model.profilePersona.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'prof-1' },
      });
    });
  });
});
