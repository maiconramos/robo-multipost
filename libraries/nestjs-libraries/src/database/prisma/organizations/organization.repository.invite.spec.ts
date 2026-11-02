import { createPrismaRepositoryMock } from '../../../test';
import { OrganizationRepository } from './organization.repository';

const build = () => {
  const org = createPrismaRepositoryMock('organization');
  const membership = createPrismaRepositoryMock('userOrganization');
  const user = createPrismaRepositoryMock('user');
  const consumed = createPrismaRepositoryMock('consumedInvite');
  const repo = new OrganizationRepository(
    org as any,
    membership as any,
    user as any,
    {} as any,
    {} as any,
    consumed as any
  );
  org.model.organization.findFirst.mockResolvedValue({ subscription: null });
  user.model.user.findFirst.mockResolvedValue(null);
  consumed.model.consumedInvite.findUnique.mockResolvedValue(null);
  consumed.model.consumedInvite.create.mockResolvedValue({ id: 'inv-1' });
  membership.model.userOrganization.create.mockResolvedValue({
    organizationId: 'org-1',
  });
  user.model.user.update.mockResolvedValue({});
  return {
    repo,
    membership: membership.model.userOrganization,
    user: user.model.user,
    consumed: consumed.model.consumedInvite,
  };
};

describe('OrganizationRepository - convite de uso unico', () => {
  it('aceita o convite, reserva o id e grava o marcador legado', async () => {
    const { repo, membership, user, consumed } = build();

    const res = await repo.addUserToOrg('u-1', 'inv-1', 'org-1', 'USER');

    expect(res).toEqual({ organizationId: 'org-1' });
    expect(consumed.create).toHaveBeenCalledWith({
      data: { id: 'inv-1', userId: 'u-1', organizationId: 'org-1' },
    });
    expect(membership.create).toHaveBeenCalled();
    expect(user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { inviteId: 'inv-1' },
    });
  });

  it('convite ja consumido (tabela nova) nao entra de novo', async () => {
    const { repo, membership, consumed } = build();
    consumed.findUnique.mockResolvedValue({ id: 'inv-1' });

    await expect(repo.addUserToOrg('u-2', 'inv-1', 'org-1', 'USER')).resolves.toBe(false);
    expect(membership.create).not.toHaveBeenCalled();
  });

  it('convite consumido antes da tabela (marcador legado) nao entra de novo', async () => {
    const { repo, membership, user } = build();
    user.findFirst.mockResolvedValue({ id: 'u-1' });

    await expect(repo.addUserToOrg('u-2', 'inv-1', 'org-1', 'USER')).resolves.toBe(false);
    expect(membership.create).not.toHaveBeenCalled();
  });

  it('corrida: quem perde a reserva (P2002) nao vira membro', async () => {
    const { repo, membership, consumed } = build();
    consumed.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(repo.addUserToOrg('u-2', 'inv-1', 'org-1', 'USER')).resolves.toBe(false);
    expect(membership.create).not.toHaveBeenCalled();
  });

  it('se a entrada falhar, devolve o convite (apaga a reserva)', async () => {
    const { repo, membership, consumed, user } = build();
    membership.create.mockRejectedValue(new Error('ja e membro'));
    consumed.delete.mockResolvedValue({});

    await expect(repo.addUserToOrg('u-1', 'inv-1', 'org-1', 'USER')).rejects.toThrow('ja e membro');
    expect(consumed.delete).toHaveBeenCalledWith({ where: { id: 'inv-1' } });
    expect(user.update).not.toHaveBeenCalled();
  });

  it('aceitar outro convite depois nao reabre o primeiro', async () => {
    const { repo, consumed, user } = build();
    // marcador legado ja foi sobrescrito por outro convite, mas a reserva fica
    user.findFirst.mockResolvedValue(null);
    consumed.findUnique.mockResolvedValue({ id: 'inv-1' });

    await expect(repo.isInviteConsumed('inv-1')).resolves.toBe(true);
  });
});
