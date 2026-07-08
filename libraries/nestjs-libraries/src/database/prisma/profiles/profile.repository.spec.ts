import { ProfileRepository } from './profile.repository';

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockFindMany = jest.fn();

const mockProfileModel = {
  model: {
    profile: {
      findFirst: mockFindFirst,
      update: mockUpdate,
      findMany: mockFindMany,
    },
  },
};

const mockMemberFindMany = jest.fn();
const mockProfileMemberModel = {
  model: { profileMember: { findMany: mockMemberFindMany } },
};

const mockUserOrgFindFirst = jest.fn();
const mockUserOrgModel = {
  model: { userOrganization: { findFirst: mockUserOrgFindFirst } },
};
const mockPersonaModel = { model: { profilePersona: {} } };

describe('ProfileRepository', () => {
  let repository: ProfileRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new ProfileRepository(
      mockProfileModel as any,
      mockProfileMemberModel as any,
      mockPersonaModel as any,
      mockUserOrgModel as any
    );
  });

  describe('getProfileNamesByIds', () => {
    it('busca por ids escopado a org e NAO filtra deletedAt (resolve perfil soft-deletado)', async () => {
      mockFindMany.mockResolvedValue([{ id: 'p1', name: 'Cliente A' }]);

      await repository.getProfileNamesByIds('org-1', ['p1', 'p2']);

      const arg = mockFindMany.mock.calls[0][0];
      expect(arg.where).toEqual({
        organizationId: 'org-1',
        id: { in: ['p1', 'p2'] },
      });
      // sem deletedAt: um evento historico de perfil apagado ainda mostra origem
      expect(arg.where.deletedAt).toBeUndefined();
      expect(arg.select).toEqual({ id: true, name: true });
    });
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

  describe('getUserProfileIds', () => {
    it('seleciona profileId e role das memberships do usuario na org', async () => {
      mockMemberFindMany.mockResolvedValue([
        { profileId: 'prof-1', role: 'EDITOR' },
      ]);

      const result = await repository.getUserProfileIds('u-1', 'org-1');

      expect(result).toEqual([{ profileId: 'prof-1', role: 'EDITOR' }]);
      expect(mockMemberFindMany).toHaveBeenCalledWith({
        where: {
          userId: 'u-1',
          profile: {
            organizationId: 'org-1',
            deletedAt: null,
          },
        },
        select: { profileId: true, role: true },
      });
    });
  });

  describe('isUserInOrg', () => {
    it('consulta o vinculo do usuario com a org', async () => {
      mockUserOrgFindFirst.mockResolvedValue({ id: 'uo-1' });

      const result = await repository.isUserInOrg('u-1', 'org-1');

      expect(result).toEqual({ id: 'uo-1' });
      expect(mockUserOrgFindFirst).toHaveBeenCalledWith({
        where: { userId: 'u-1', organizationId: 'org-1', disabled: false },
        select: { id: true },
      });
    });

    it('retorna null quando usuario nao pertence a org', async () => {
      mockUserOrgFindFirst.mockResolvedValue(null);

      const result = await repository.isUserInOrg('u-x', 'org-1');

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
