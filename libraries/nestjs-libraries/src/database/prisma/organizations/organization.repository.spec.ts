import { OrganizationRepository } from './organization.repository';

const mockOrgCreate = jest.fn();
const mockOrgFindUnique = jest.fn();
const mockOrgFindFirst = jest.fn();
const mockOrgUpdate = jest.fn();
const mockOrgModel = {
  model: {
    organization: {
      create: mockOrgCreate,
      findUnique: mockOrgFindUnique,
      findFirst: mockOrgFindFirst,
      update: mockOrgUpdate,
    },
  },
};
const mockUserOrgDelete = jest.fn();
const mockUserOrgFindMany = jest.fn();
const mockUserOrgModel = {
  model: {
    userOrganization: {
      delete: mockUserOrgDelete,
      findMany: mockUserOrgFindMany,
    },
  },
};
const mockUserFindFirst = jest.fn();
const mockUserModel = { model: { user: { findFirst: mockUserFindFirst } } };
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

  describe('isInviteConsumed', () => {
    it('retorna true quando algum usuario ja tem o inviteId', async () => {
      mockUserFindFirst.mockResolvedValue({ id: 'u-1' });

      const result = await repository.isInviteConsumed('inv-1');

      expect(result).toBe(true);
      expect(mockUserFindFirst).toHaveBeenCalledWith({
        where: { inviteId: 'inv-1' },
        select: { id: true },
      });
    });

    it('retorna false quando o convite ainda nao foi consumido', async () => {
      mockUserFindFirst.mockResolvedValue(null);

      const result = await repository.isInviteConsumed('inv-2');

      expect(result).toBe(false);
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

  describe('idioma da org', () => {
    const body = {
      company: 'ACME',
      email: 'a@b.com',
      password: 'secret',
      provider: 'LOCAL',
    } as any;

    it('createOrgAndUser grava o idioma recebido', async () => {
      mockOrgCreate.mockResolvedValue({ id: 'org-1', users: [] });

      await repository.createOrgAndUser(body, true, 'ip', 'agent', 'en');

      expect(mockOrgCreate.mock.calls[0][0].data.language).toBe('en');
    });

    it('createOrgAndUser grava null quando nao ha idioma', async () => {
      mockOrgCreate.mockResolvedValue({ id: 'org-1', users: [] });

      await repository.createOrgAndUser(body, true, 'ip', 'agent');

      expect(mockOrgCreate.mock.calls[0][0].data.language).toBeNull();
    });

    it('getLanguage seleciona apenas language da org', async () => {
      mockOrgFindUnique.mockResolvedValue({ language: 'en' });

      const res = await repository.getLanguage('org-1');

      expect(mockOrgFindUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        select: { language: true },
      });
      expect(res).toEqual({ language: 'en' });
    });

    it('updateLanguage grava o idioma na org', async () => {
      await repository.updateLanguage('org-1', 'en');

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { language: 'en' },
      });
    });

    it('getFirstOrgLanguageByUserId usa a org mais antiga do usuario', async () => {
      mockOrgFindFirst.mockResolvedValue({ language: 'pt' });

      const res = await repository.getFirstOrgLanguageByUserId('u-1');

      const args = mockOrgFindFirst.mock.calls[0][0];
      expect(args.where).toEqual({ users: { some: { userId: 'u-1' } } });
      expect(args.orderBy).toEqual({ createdAt: 'asc' });
      expect(res).toBe('pt');
    });

    it('getFirstOrgLanguageByUserId retorna null quando sem org', async () => {
      mockOrgFindFirst.mockResolvedValue(null);

      expect(await repository.getFirstOrgLanguageByUserId('u-2')).toBeNull();
    });
  });

  describe('destinatarios de notificacao escopados por perfil', () => {
    it('getUsersForNotification escopa por admin ou membro do perfil (na org)', async () => {
      mockUserOrgFindMany.mockResolvedValue([
        { user: { id: 'u1', email: 'a@b.com' } },
      ]);

      const res = await repository.getUsersForNotification('org-1', 'prof-1');

      const args = mockUserOrgFindMany.mock.calls[0][0];
      expect(args.where.organizationId).toBe('org-1');
      expect(args.where.OR).toEqual([
        { role: { in: ['ADMIN', 'SUPERADMIN'] } },
        {
          user: {
            profileMembers: {
              some: {
                profileId: 'prof-1',
                profile: { organizationId: 'org-1' },
              },
            },
          },
        },
      ]);
      expect(res).toEqual([{ id: 'u1', email: 'a@b.com' }]);
    });

    it('getUsersForNotification sem profileId nao aplica filtro OR (org-wide)', async () => {
      mockUserOrgFindMany.mockResolvedValue([]);

      await repository.getUsersForNotification('org-1', null);

      const args = mockUserOrgFindMany.mock.calls[0][0];
      expect(args.where).toEqual({ organizationId: 'org-1' });
    });

    it('getTeamForNotifications escopa profileMembers e traz o idioma da org', async () => {
      mockOrgFindUnique.mockResolvedValue({ language: 'en', users: [] });

      await repository.getTeamForNotifications('org-1');

      const args = mockOrgFindUnique.mock.calls[0][0];
      expect(args.select.language).toBe(true);
      expect(
        args.select.users.select.user.select.profileMembers.where
      ).toEqual({ profile: { organizationId: 'org-1', deletedAt: null } });
    });
  });
});
