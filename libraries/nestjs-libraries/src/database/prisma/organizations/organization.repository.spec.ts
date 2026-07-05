import { OrganizationRepository } from './organization.repository';

const mockOrgCreate = jest.fn();
const mockOrgModel = {
  model: { organization: { create: mockOrgCreate } },
};
const mockUserOrgDelete = jest.fn();
const mockUserOrgModel = {
  model: { userOrganization: { delete: mockUserOrgDelete } },
};
const mockUserModel = { model: { user: {} } };
const mockMemberDeleteMany = jest.fn();
const mockProfileMemberModel = {
  model: { profileMember: { deleteMany: mockMemberDeleteMany } },
};

describe('OrganizationRepository', () => {
  let repository: OrganizationRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new OrganizationRepository(
      mockOrgModel as any,
      mockUserOrgModel as any,
      mockUserModel as any,
      mockProfileMemberModel as any
    );
  });

  describe('createOrgAndUser', () => {
    const body = {
      company: 'ACME',
      email: 'a@b.com',
      password: 'secret',
      provider: 'LOCAL',
    } as any;

    it('cria o perfil default junto com a organizacao', async () => {
      mockOrgCreate.mockResolvedValue({ id: 'org-1', users: [] });

      await repository.createOrgAndUser(body, true, '127.0.0.1', 'agent');

      const callArgs = mockOrgCreate.mock.calls[0][0];
      expect(callArgs.data.profiles).toEqual({
        create: {
          name: 'Default',
          slug: 'default',
          isDefault: true,
        },
      });
    });

    it('marca a organizacao como bootstrapped na criacao', async () => {
      mockOrgCreate.mockResolvedValue({ id: 'org-1', users: [] });

      await repository.createOrgAndUser(body, true, '127.0.0.1', 'agent');

      const callArgs = mockOrgCreate.mock.calls[0][0];
      expect(callArgs.data.profilesBootstrappedAt).toBeInstanceOf(Date);
    });
  });

  describe('deleteTeamMember', () => {
    it('remove as memberships de perfil junto com o vinculo da org', async () => {
      mockMemberDeleteMany.mockResolvedValue({ count: 2 });
      mockUserOrgDelete.mockResolvedValue({ id: 'uo-1' });

      await repository.deleteTeamMember('org-1', 'u-1');

      expect(mockMemberDeleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'u-1',
          profile: { organizationId: 'org-1' },
        },
      });
      expect(mockUserOrgDelete).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: 'u-1',
            organizationId: 'org-1',
          },
        },
      });
    });
  });
});
