import { ProfilesController } from './profiles.controller';

const makeService = () => ({
  getAccessibleProfiles: jest.fn(),
  assertProfileAccess: jest.fn(),
  getMembers: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
});

const orgAdmin = { id: 'org-1', users: [{ role: 'ADMIN' }] } as any;
const orgUser = { id: 'org-1', users: [{ role: 'USER' }] } as any;
const user = { id: 'user-1' } as any;

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: ReturnType<typeof makeService>;

  beforeEach(() => {
    service = makeService();
    controller = new ProfilesController(service as any);
  });

  describe('getProfiles', () => {
    it('delega ao getAccessibleProfiles com o role da org', async () => {
      service.getAccessibleProfiles.mockResolvedValue([{ id: 'prof-1' }]);

      const result = await controller.getProfiles(orgUser, user);

      expect(result).toEqual([{ id: 'prof-1' }]);
      expect(service.getAccessibleProfiles).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        'USER'
      );
    });
  });

  describe('getMembers', () => {
    it('valida acesso ao perfil antes de listar o roster', async () => {
      service.assertProfileAccess.mockResolvedValue({
        profile: { id: 'prof-1' },
        role: 'EDITOR',
      });
      service.getMembers.mockResolvedValue([{ userId: 'u-2' }]);

      const result = await controller.getMembers(orgUser, user, 'prof-1');

      expect(service.assertProfileAccess).toHaveBeenCalledWith(
        'org-1',
        'prof-1',
        'user-1',
        'USER'
      );
      expect(result).toEqual([{ userId: 'u-2' }]);
    });

    it('propaga 403 quando usuario nao e membro do perfil', async () => {
      service.assertProfileAccess.mockRejectedValue(
        Object.assign(new Error('denied'), { status: 403 })
      );

      await expect(
        controller.getMembers(orgUser, user, 'prof-alheio')
      ).rejects.toMatchObject({ status: 403 });
      expect(service.getMembers).not.toHaveBeenCalled();
    });
  });

  describe('addMember', () => {
    it('repassa o ator para as regras de hierarquia do service', async () => {
      service.addMember.mockResolvedValue({ id: 'm-1' });

      await controller.addMember(orgAdmin, user, 'prof-1', {
        userId: 'u-2',
        role: 'EDITOR',
      });

      expect(service.addMember).toHaveBeenCalledWith(
        'org-1',
        'prof-1',
        'u-2',
        'EDITOR',
        { userId: 'user-1', orgRole: 'ADMIN' }
      );
    });
  });

  describe('removeMember', () => {
    it('repassa o ator para as regras de hierarquia do service', async () => {
      service.removeMember.mockResolvedValue({ id: 'm-1' });

      await controller.removeMember(orgUser, user, 'prof-1', 'u-2');

      expect(service.removeMember).toHaveBeenCalledWith(
        'org-1',
        'prof-1',
        'u-2',
        { userId: 'user-1', orgRole: 'USER' }
      );
    });
  });
});
