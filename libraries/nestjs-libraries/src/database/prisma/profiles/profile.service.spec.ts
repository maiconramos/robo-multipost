import { HttpException } from '@nestjs/common';
import { ProfileService } from './profile.service';

const makeRepo = () => ({
  getProfileById: jest.fn(),
  getProfileByApiKey: jest.fn(),
  updateApiKey: jest.fn(),
  getMembers: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  getProfilesByOrgId: jest.fn(),
  getUserProfileIds: jest.fn(),
  getMemberRole: jest.fn(),
  isUserInOrg: jest.fn(),
});

describe('ProfileService', () => {
  let service: ProfileService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new ProfileService(repo as any);
  });

  describe('getProfileByApiKey', () => {
    it('delega ao repositorio sem transformacao', async () => {
      const fakeProfile = { id: 'prof-1', apiKey: 'key-abc', organization: {} };
      repo.getProfileByApiKey.mockResolvedValue(fakeProfile);

      const result = await service.getProfileByApiKey('key-abc');

      expect(result).toEqual(fakeProfile);
      expect(repo.getProfileByApiKey).toHaveBeenCalledWith('key-abc');
    });

    it('retorna null quando chave nao existe', async () => {
      repo.getProfileByApiKey.mockResolvedValue(null);

      const result = await service.getProfileByApiKey('inexistente');

      expect(result).toBeNull();
    });
  });

  describe('updateApiKey', () => {
    it('lanca 404 quando perfil nao encontrado', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(service.updateApiKey('org-1', 'prof-1')).rejects.toBeInstanceOf(HttpException);
      expect(repo.updateApiKey).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil encontrado', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.updateApiKey.mockResolvedValue({ id: 'prof-1', apiKey: 'new-key' });

      const result = await service.updateApiKey('org-1', 'prof-1');

      expect(result).toEqual({ id: 'prof-1', apiKey: 'new-key' });
      expect(repo.updateApiKey).toHaveBeenCalledWith('org-1', 'prof-1');
    });
  });

  describe('getMembers', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(service.getMembers('org-1', 'prof-de-outra-org')).rejects.toBeInstanceOf(
        HttpException
      );
      expect(repo.getMembers).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMembers.mockResolvedValue([{ userId: 'u-1' }]);

      const result = await service.getMembers('org-1', 'prof-1');

      expect(result).toEqual([{ userId: 'u-1' }]);
      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.getMembers).toHaveBeenCalledWith('prof-1');
    });
  });

  describe('addMember', () => {
    beforeEach(() => {
      repo.isUserInOrg.mockResolvedValue({ id: 'uo-1' });
    });

    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(
        service.addMember('org-1', 'prof-de-outra-org', 'u-1', 'EDITOR')
      ).rejects.toBeInstanceOf(HttpException);
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addMember('org-1', 'prof-1', 'u-1', 'EDITOR');

      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.addMember).toHaveBeenCalledWith('prof-1', 'u-1', 'EDITOR');
    });

    it('lanca 400 quando usuario adicionado nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.isUserInOrg.mockResolvedValue(null);

      await expect(
        service.addMember('org-1', 'prof-1', 'u-de-outra-org', 'EDITOR')
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('bloqueia MANAGER concedendo papel acima do proprio', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // ator MANAGER; alvo ainda sem membership
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce(null);

      await expect(
        service.addMember('org-1', 'prof-1', 'u-1', 'OWNER', {
          userId: 'actor-1',
          orgRole: 'USER',
        })
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('permite MANAGER concedendo papel igual ou abaixo do proprio', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // ator MANAGER; alvo ainda sem membership
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce(null);
      repo.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addMember('org-1', 'prof-1', 'u-1', 'EDITOR', {
        userId: 'actor-1',
        orgRole: 'USER',
      });

      expect(repo.addMember).toHaveBeenCalledWith('prof-1', 'u-1', 'EDITOR');
    });

    it('bloqueia MANAGER rebaixando um OWNER existente', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // ator MANAGER; alvo ja e OWNER (upsert rebaixaria)
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce({ role: 'OWNER' });

      await expect(
        service.addMember('org-1', 'prof-1', 'u-owner', 'EDITOR', {
          userId: 'actor-1',
          orgRole: 'USER',
        })
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('nao aplica hierarquia quando ator e admin da org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addMember('org-1', 'prof-1', 'u-1', 'OWNER', {
        userId: 'actor-1',
        orgRole: 'ADMIN',
      });

      expect(repo.getMemberRole).not.toHaveBeenCalled();
      expect(repo.addMember).toHaveBeenCalledWith('prof-1', 'u-1', 'OWNER');
    });

    it('rejeita role fora do enum com 400 (fail-closed)', async () => {
      await expect(
        service.addMember('org-1', 'prof-1', 'u-1', 'SUPER_HACK' as any, {
          userId: 'actor-1',
          orgRole: 'USER',
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.addMember).not.toHaveBeenCalled();
    });
  });

  describe('getUserProfileMemberships', () => {
    it('retorna as memberships com profileId e role', async () => {
      repo.getUserProfileIds.mockResolvedValue([
        { profileId: 'prof-1', role: 'EDITOR' },
        { profileId: 'prof-2', role: 'VIEWER' },
      ]);

      const result = await service.getUserProfileMemberships('u-1', 'org-1');

      expect(result).toEqual([
        { profileId: 'prof-1', role: 'EDITOR' },
        { profileId: 'prof-2', role: 'VIEWER' },
      ]);
      expect(repo.getUserProfileIds).toHaveBeenCalledWith('u-1', 'org-1');
    });
  });

  describe('getUserProfileIds', () => {
    it('mapeia as memberships para uma lista de ids', async () => {
      repo.getUserProfileIds.mockResolvedValue([
        { profileId: 'prof-1', role: 'EDITOR' },
        { profileId: 'prof-2', role: 'VIEWER' },
      ]);

      const result = await service.getUserProfileIds('u-1', 'org-1');

      expect(result).toEqual(['prof-1', 'prof-2']);
    });
  });

  describe('getAccessibleProfiles', () => {
    const profiles = [
      { id: 'prof-default', isDefault: true },
      { id: 'prof-client-1', isDefault: false },
      { id: 'prof-client-2', isDefault: false },
    ];

    it('retorna todos os perfis da org quando role e ADMIN', async () => {
      repo.getProfilesByOrgId.mockResolvedValue(profiles);

      const result = await service.getAccessibleProfiles('org-1', 'u-1', 'ADMIN');

      expect(result).toEqual(profiles);
      expect(repo.getUserProfileIds).not.toHaveBeenCalled();
    });

    it('retorna todos os perfis da org quando role e SUPERADMIN', async () => {
      repo.getProfilesByOrgId.mockResolvedValue(profiles);

      const result = await service.getAccessibleProfiles('org-1', 'u-1', 'SUPERADMIN');

      expect(result).toEqual(profiles);
      expect(repo.getUserProfileIds).not.toHaveBeenCalled();
    });

    it('filtra por membership quando role e USER', async () => {
      repo.getProfilesByOrgId.mockResolvedValue(profiles);
      repo.getUserProfileIds.mockResolvedValue([
        { profileId: 'prof-client-1', role: 'EDITOR' },
      ]);

      const result = await service.getAccessibleProfiles('org-1', 'u-1', 'USER');

      expect(result).toEqual([{ id: 'prof-client-1', isDefault: false }]);
      expect(repo.getUserProfileIds).toHaveBeenCalledWith('u-1', 'org-1');
    });

    it('retorna lista vazia quando USER sem memberships', async () => {
      repo.getProfilesByOrgId.mockResolvedValue(profiles);
      repo.getUserProfileIds.mockResolvedValue([]);

      const result = await service.getAccessibleProfiles('org-1', 'u-1', 'USER');

      expect(result).toEqual([]);
    });
  });

  describe('getEffectiveProfileRole', () => {
    it('retorna OWNER implicito para ADMIN quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });

      const result = await service.getEffectiveProfileRole('org-1', 'prof-1', 'u-1', 'ADMIN');

      expect(result).toBe('OWNER');
      expect(repo.getMemberRole).not.toHaveBeenCalled();
    });

    it('retorna null quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      const result = await service.getEffectiveProfileRole('org-1', 'prof-x', 'u-1', 'ADMIN');

      expect(result).toBeNull();
    });

    it('retorna o role da membership para USER', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue({ role: 'MANAGER' });

      const result = await service.getEffectiveProfileRole('org-1', 'prof-1', 'u-1', 'USER');

      expect(result).toBe('MANAGER');
      expect(repo.getMemberRole).toHaveBeenCalledWith('prof-1', 'u-1');
    });

    it('retorna null para USER sem membership no perfil', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue(null);

      const result = await service.getEffectiveProfileRole('org-1', 'prof-1', 'u-1', 'USER');

      expect(result).toBeNull();
    });
  });

  describe('assertProfileAccess', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(
        service.assertProfileAccess('org-1', 'prof-x', 'u-1', 'ADMIN')
      ).rejects.toMatchObject({ status: 404 });
    });

    it('retorna perfil com role OWNER implicito para ADMIN', async () => {
      const profile = { id: 'prof-1', organizationId: 'org-1' };
      repo.getProfileById.mockResolvedValue(profile);

      const result = await service.assertProfileAccess('org-1', 'prof-1', 'u-1', 'ADMIN');

      expect(result).toEqual({ profile, role: 'OWNER' });
      expect(repo.getMemberRole).not.toHaveBeenCalled();
    });

    it('lanca 403 quando USER nao e membro do perfil', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue(null);

      await expect(
        service.assertProfileAccess('org-1', 'prof-1', 'u-1', 'USER')
      ).rejects.toMatchObject({ status: 403 });
    });

    it('retorna perfil e role da membership para USER membro', async () => {
      const profile = { id: 'prof-1', organizationId: 'org-1' };
      repo.getProfileById.mockResolvedValue(profile);
      repo.getMemberRole.mockResolvedValue({ role: 'VIEWER' });

      const result = await service.assertProfileAccess('org-1', 'prof-1', 'u-1', 'USER');

      expect(result).toEqual({ profile, role: 'VIEWER' });
    });
  });

  describe('removeMember', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(
        service.removeMember('org-1', 'prof-de-outra-org', 'u-1')
      ).rejects.toBeInstanceOf(HttpException);
      expect(repo.removeMember).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.removeMember.mockResolvedValue({ id: 'm-1' });

      await service.removeMember('org-1', 'prof-1', 'u-1');

      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.removeMember).toHaveBeenCalledWith('prof-1', 'u-1');
    });

    it('bloqueia MANAGER removendo membro com papel acima do proprio', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // Promise.all: 1a consulta = ator (MANAGER); 2a = alvo (OWNER)
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce({ role: 'OWNER' });

      await expect(
        service.removeMember('org-1', 'prof-1', 'u-owner', {
          userId: 'actor-1',
          orgRole: 'USER',
        })
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.removeMember).not.toHaveBeenCalled();
    });

    it('permite MANAGER removendo membro EDITOR', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // Promise.all: 1a consulta = ator (MANAGER); 2a = alvo (EDITOR)
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce({ role: 'EDITOR' });
      repo.removeMember.mockResolvedValue({ id: 'm-1' });

      await service.removeMember('org-1', 'prof-1', 'u-editor', {
        userId: 'actor-1',
        orgRole: 'USER',
      });

      expect(repo.removeMember).toHaveBeenCalledWith('prof-1', 'u-editor');
    });
  });
});
