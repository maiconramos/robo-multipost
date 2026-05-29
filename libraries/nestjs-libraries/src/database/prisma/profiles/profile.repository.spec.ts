import { ProfileRepository } from './profile.repository';

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();

const mockProfileModel = {
  model: {
    profile: {
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
  },
};

const mockProfileMemberModel = { model: { profileMember: {} } };
const mockPersonaModel = { model: { profilePersona: {} } };

describe('ProfileRepository', () => {
  let repository: ProfileRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new ProfileRepository(
      mockProfileModel as any,
      mockProfileMemberModel as any,
      mockPersonaModel as any
    );
  });

  describe('getProfileByApiKey', () => {
    it('retorna perfil com org e subscription quando chave valida', async () => {
      const fakeProfile = {
        id: 'prof-1',
        apiKey: 'key-abc',
        deletedAt: null as Date | null,
        organization: { id: 'org-1', subscription: { subscriptionTier: 'PRO', totalChannels: 10, isLifetime: false } },
      };
      mockFindFirst.mockResolvedValue(fakeProfile);

      const result = await repository.getProfileByApiKey('key-abc');

      expect(result).toEqual(fakeProfile);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { apiKey: 'key-abc', deletedAt: null },
        include: {
          organization: {
            include: {
              subscription: {
                select: { subscriptionTier: true, totalChannels: true, isLifetime: true },
              },
            },
          },
        },
      });
    });

    it('retorna null quando perfil com deletedAt preenchido', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await repository.getProfileByApiKey('key-deleted');

      expect(result).toBeNull();
    });

    it('retorna null quando chave nao existe', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await repository.getProfileByApiKey('inexistente');

      expect(result).toBeNull();
    });
  });

  describe('updateApiKey', () => {
    it('chama update com nova chave encriptada e filtra por orgId', async () => {
      mockUpdate.mockResolvedValue({ id: 'prof-1', apiKey: 'encrypted-key' });

      const result = await repository.updateApiKey('org-1', 'prof-1');

      expect(result).toEqual({ id: 'prof-1', apiKey: 'encrypted-key' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prof-1', organizationId: 'org-1' },
          select: { id: true, apiKey: true },
        })
      );
      const callArgs = mockUpdate.mock.calls[0][0];
      expect(typeof callArgs.data.apiKey).toBe('string');
      expect(callArgs.data.apiKey.length).toBeGreaterThan(0);
    });
  });
});
