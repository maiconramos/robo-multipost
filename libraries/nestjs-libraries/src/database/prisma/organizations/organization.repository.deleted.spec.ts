import { createPrismaRepositoryMock } from '../../../test';
import { OrganizationRepository } from './organization.repository';

const build = () => {
  const org = createPrismaRepositoryMock('organization');
  const membership = createPrismaRepositoryMock('userOrganization');
  const repo = new OrganizationRepository(
    org as any,
    membership as any,
    {} as any,
    {} as any,
    createPrismaRepositoryMock('oAuthAuthorization') as unknown as
      ConstructorParameters<typeof OrganizationRepository>[4],
    createPrismaRepositoryMock('consumedInvite') as unknown as
      ConstructorParameters<typeof OrganizationRepository>[5]
  );
  return {
    repo,
    org: org.model.organization,
    membership: membership.model.userOrganization,
  };
};

describe('OrganizationRepository - organizacao excluida nao resolve acesso', () => {
  it('chave da org nao resolve tombstone', async () => {
    const { repo, org } = build();
    await repo.getOrgByApiKey('api-key');
    expect(org.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { apiKey: 'api-key', deletedAt: null } })
    );
  });
  it('selecao de workspace e busca por id nao devolvem excluidos', async () => {
    const { repo, org } = build();
    await repo.getOrgsByUserId('user-1');
    expect(org.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          users: { some: { userId: 'user-1' } },
        }),
      })
    );
    await repo.getOrgById('org-1');
    expect(org.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1', deletedAt: null },
    });
  });
  it('cookie de impersonacao exige organizacao ainda viva', async () => {
    const { repo, membership } = build();
    await repo.getUserOrg('membership');
    expect(membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'membership', organization: { deletedAt: null } },
      })
    );
  });
  it('busca de impersonacao tambem filtra tombstone', async () => {
    const { repo, membership } = build();
    await repo.getImpersonateUser('cliente@example.com');
    expect(membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization: { deletedAt: null } }),
      })
    );
  });
  it('digest e streak nao resolvem destinatarios da organizacao excluida', async () => {
    const { repo, org } = build();
    await repo.getTeamForNotifications('org-1');
    expect(org.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org-1', deletedAt: null },
        select: expect.objectContaining({
          users: expect.objectContaining({ where: { disabled: false } }),
        }),
      })
    );
  });
});
