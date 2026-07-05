import { OrganizationService } from './organization.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

const makeRepo = () => ({
  addUserToOrg: jest.fn(),
});

const makeNotifications = () => ({
  sendEmail: jest.fn(),
  hasEmailProvider: jest.fn().mockReturnValue(true),
});

const makeProfileService = () => ({
  addMember: jest.fn(),
  getProfileById: jest.fn(),
});

describe('OrganizationService', () => {
  let service: OrganizationService;
  let repo: ReturnType<typeof makeRepo>;
  let notifications: ReturnType<typeof makeNotifications>;
  let profiles: ReturnType<typeof makeProfileService>;

  beforeEach(() => {
    repo = makeRepo();
    notifications = makeNotifications();
    profiles = makeProfileService();
    service = new OrganizationService(
      repo as any,
      notifications as any,
      profiles as any
    );
  });

  describe('addUserToOrg', () => {
    it('cria memberships dos perfis do convite para role USER', async () => {
      repo.addUserToOrg.mockResolvedValue({ organizationId: 'org-1' });
      profiles.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addUserToOrg('u-1', 'inv-1', 'org-1', 'USER', [
        'prof-1',
        'prof-2',
      ]);

      expect(profiles.addMember).toHaveBeenCalledWith(
        'org-1',
        'prof-1',
        'u-1',
        'EDITOR'
      );
      expect(profiles.addMember).toHaveBeenCalledWith(
        'org-1',
        'prof-2',
        'u-1',
        'EDITOR'
      );
    });

    it('usa o profileRole do convite quando informado', async () => {
      repo.addUserToOrg.mockResolvedValue({ organizationId: 'org-1' });
      profiles.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addUserToOrg(
        'u-1',
        'inv-1',
        'org-1',
        'USER',
        ['prof-1'],
        'VIEWER'
      );

      expect(profiles.addMember).toHaveBeenCalledWith(
        'org-1',
        'prof-1',
        'u-1',
        'VIEWER'
      );
    });

    it('nao cria membership para role ADMIN (acesso implicito)', async () => {
      repo.addUserToOrg.mockResolvedValue({ organizationId: 'org-1' });

      await service.addUserToOrg('u-1', 'inv-1', 'org-1', 'ADMIN', ['prof-1']);

      expect(profiles.addMember).not.toHaveBeenCalled();
    });

    it('nao cria membership quando o vinculo com a org falha', async () => {
      repo.addUserToOrg.mockResolvedValue(false);

      await service.addUserToOrg('u-1', 'inv-1', 'org-1', 'USER', ['prof-1']);

      expect(profiles.addMember).not.toHaveBeenCalled();
    });

    it('ignora perfil deletado entre o convite e o aceite', async () => {
      repo.addUserToOrg.mockResolvedValue({ organizationId: 'org-1' });
      profiles.addMember
        .mockRejectedValueOnce(new Error('Profile not found'))
        .mockResolvedValueOnce({ id: 'm-2' });

      const result = await service.addUserToOrg(
        'u-1',
        'inv-1',
        'org-1',
        'USER',
        ['prof-deletado', 'prof-2']
      );

      expect(result).toEqual({ organizationId: 'org-1' });
      expect(profiles.addMember).toHaveBeenCalledTimes(2);
    });
  });

  describe('inviteTeamMember', () => {
    let signSpy: jest.SpyInstance;

    beforeEach(() => {
      signSpy = jest
        .spyOn(AuthService, 'signJWT')
        .mockReturnValue('signed-token');
    });

    afterEach(() => {
      signSpy.mockRestore();
    });

    it('valida que os perfis do convite pertencem a org', async () => {
      profiles.getProfileById.mockResolvedValue(null);

      await expect(
        service.inviteTeamMember('org-1', {
          email: 'a@b.com',
          role: 'USER',
          sendEmail: false,
          profileIds: ['prof-de-outra-org'],
        } as any)
      ).rejects.toMatchObject({ status: 400 });
    });

    it('gera url de convite quando os perfis sao validos', async () => {
      profiles.getProfileById.mockResolvedValue({ id: 'prof-1' });

      const result = await service.inviteTeamMember('org-1', {
        email: 'a@b.com',
        role: 'USER',
        sendEmail: false,
        profileIds: ['prof-1'],
      } as any);

      expect(result.url).toContain('/?org=');
    });

    it('nao exige perfis para role ADMIN', async () => {
      const result = await service.inviteTeamMember('org-1', {
        email: 'a@b.com',
        role: 'ADMIN',
        sendEmail: false,
      } as any);

      expect(result.url).toContain('/?org=');
      expect(profiles.getProfileById).not.toHaveBeenCalled();
    });
  });
});
