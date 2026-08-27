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
const mockTransaction = { model: { $transaction: jest.fn() } };

describe('ProfileRepository', () => {
  let repository: ProfileRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new ProfileRepository(
      mockProfileModel as any,
      mockProfileMemberModel as any,
      mockPersonaModel as any,
      mockUserOrgModel as any,
      mockTransaction as any
    );
  });

  describe('deleteProfile', () => {
    it('encerra recursos ativos e preserva o historico publicado em uma transacao', async () => {
      const tx = {
        post: {
          findMany: jest.fn().mockResolvedValue([{ id: 'post-queue' }]),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        autoPost: {
          findMany: jest.fn().mockResolvedValue([{ id: 'auto-1' }]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        repostRule: {
          findMany: jest.fn().mockResolvedValue([{ id: 'repost-1' }]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        flowExecution: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ temporalWorkflowId: 'flow-exec-1' }]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        pendingPostback: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        integration: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
        flow: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        webhooks: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        profile: {
          update: jest.fn().mockResolvedValue({
            id: 'prof-1',
            deletedAt: new Date(),
          }),
        },
      };
      mockTransaction.model.$transaction.mockImplementation((callback) =>
        callback(tx)
      );

      const result = await repository.deleteProfile('org-1', 'prof-1');

      expect(tx.post.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          profileId: 'prof-1',
          deletedAt: null,
          parentPostId: null,
          state: 'QUEUE',
        },
        select: { id: true },
      });
      expect(tx.post.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          profileId: 'prof-1',
          deletedAt: null,
          state: { in: ['QUEUE', 'DRAFT'] },
        },
        data: { deletedAt: expect.any(Date) },
      });
      expect(tx.integration.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          profileId: 'prof-1',
          deletedAt: null,
        },
        data: { disabled: true, deletedAt: expect.any(Date) },
      });
      expect(tx.flow.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          profileId: 'prof-1',
          deletedAt: null,
        },
        data: { status: 'ARCHIVED', deletedAt: expect.any(Date) },
      });
      expect(tx.autoPost.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          profileId: 'prof-1',
          deletedAt: null,
        },
        data: { active: false, deletedAt: expect.any(Date) },
      });
      expect(tx.repostRule.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          profileId: 'prof-1',
          deletedAt: null,
        },
        data: { enabled: false, deletedAt: expect.any(Date) },
      });
      expect(tx.webhooks.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          profileId: 'prof-1',
          deletedAt: null,
        },
        data: { deletedAt: expect.any(Date) },
      });
      expect(tx.flowExecution.updateMany).toHaveBeenCalledWith({
        where: {
          flow: { organizationId: 'org-1', profileId: 'prof-1' },
          status: { in: ['RUNNING', 'WAITING_POSTBACK'] },
        },
        data: { status: 'CANCELLED', completedAt: expect.any(Date) },
      });
      expect(tx.pendingPostback.updateMany).toHaveBeenCalledWith({
        where: {
          flow: { organizationId: 'org-1', profileId: 'prof-1' },
          status: 'PENDING',
        },
        data: { status: 'ABANDONED' },
      });
      expect(result).toMatchObject({
        profile: { id: 'prof-1' },
        workflowIds: [
          'post_post-queue',
          'autopost-auto-1',
          'repost-rule-repost-1',
          'flow-exec-1',
        ],
      });
    });
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
