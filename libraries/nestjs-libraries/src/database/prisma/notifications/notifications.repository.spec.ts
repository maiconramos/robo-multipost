import { NotificationsRepository } from './notifications.repository';

const mockNotifCreate = jest.fn();
const mockNotifCount = jest.fn();
const mockNotifFindMany = jest.fn();
const mockNotifModel = {
  model: {
    notifications: {
      create: mockNotifCreate,
      count: mockNotifCount,
      findMany: mockNotifFindMany,
    },
  },
};
const mockUserFindFirst = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserModel = {
  model: {
    user: {
      findFirst: mockUserFindFirst,
      update: mockUserUpdate,
    },
  },
};

describe('NotificationsRepository', () => {
  let repository: NotificationsRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new NotificationsRepository(
      mockNotifModel as any,
      mockUserModel as any
    );
  });

  describe('createNotification', () => {
    it('grava content contentKey profileId e contentParams', async () => {
      await repository.createNotification('org-1', 'texto', {
        contentKey: 'notif_x',
        contentParams: { a: '1' },
        profileId: 'prof-1',
      });

      expect(mockNotifCreate).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          content: 'texto',
          contentKey: 'notif_x',
          profileId: 'prof-1',
          contentParams: { a: '1' },
        },
      });
    });

    it('usa nulls e omite contentParams quando ausente', async () => {
      await repository.createNotification('org-1', 'texto');

      expect(mockNotifCreate).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          content: 'texto',
          contentKey: null,
          profileId: null,
        },
      });
    });
  });

  describe('escopo por perfil nas leituras', () => {
    beforeEach(() => {
      mockUserFindFirst.mockResolvedValue({ lastReadNotifications: new Date(0) });
      mockNotifCount.mockResolvedValue(0);
    });

    it('admin nao aplica filtro de perfil', async () => {
      await repository.getMainPageCount('org-1', 'u-1', {
        isAdmin: true,
        profileIds: ['x'],
      });

      expect(mockNotifCount.mock.calls[0][0].where.OR).toBeUndefined();
    });

    it('nao-admin com perfis ve org-wide + seus perfis', async () => {
      await repository.getMainPageCount('org-1', 'u-1', {
        isAdmin: false,
        profileIds: ['p1', 'p2'],
      });

      expect(mockNotifCount.mock.calls[0][0].where.OR).toEqual([
        { profileId: null },
        { profileId: { in: ['p1', 'p2'] } },
      ]);
    });

    it('nao-admin sem perfis ve apenas org-wide', async () => {
      await repository.getMainPageCount('org-1', 'u-1', {
        isAdmin: false,
        profileIds: [],
      });

      expect(mockNotifCount.mock.calls[0][0].where.OR).toEqual([
        { profileId: null },
      ]);
    });

    it('sem scope (chave de org na public api) nao filtra', async () => {
      await repository.getMainPageCount('org-1', 'u-1');

      expect(mockNotifCount.mock.calls[0][0].where.OR).toBeUndefined();
    });
  });

  describe('getNotifications', () => {
    it('seleciona contentKey/contentParams, escopa e marca como lido', async () => {
      mockUserFindFirst.mockResolvedValue({ lastReadNotifications: new Date(0) });
      mockNotifFindMany.mockResolvedValue([]);

      await repository.getNotifications('org-1', 'u-1', {
        isAdmin: false,
        profileIds: ['p1'],
      });

      expect(mockUserUpdate).toHaveBeenCalled();
      const args = mockNotifFindMany.mock.calls[0][0];
      expect(args.select).toEqual({
        createdAt: true,
        content: true,
        contentKey: true,
        contentParams: true,
      });
      expect(args.where.OR).toEqual([
        { profileId: null },
        { profileId: { in: ['p1'] } },
      ]);
    });
  });
});
