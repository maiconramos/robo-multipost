import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { AutopostRepository } from './autopost.repository';

describe('AutopostRepository', () => {
  it('nao executa autopost de perfil cancelado e preserva o escopo workspace', async () => {
    const prismaMock = createPrismaRepositoryMock('autoPost');
    (prismaMock.model.autoPost as any).findFirst = jest
      .fn()
      .mockResolvedValue(null);
    const repository = new AutopostRepository(prismaMock as any);

    await repository.getAutopost('auto-1');

    expect((prismaMock.model.autoPost as any).findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'auto-1',
          deletedAt: null,
          OR: [{ profileId: null }, { profile: { deletedAt: null } }],
        },
      })
    );
  });
});

describe('AutopostRepository - editar por id respeita o perfil', () => {
  it('nao edita registro de outro perfil pelo id', async () => {
    const mock = createPrismaRepositoryMock('autoPost');
    (mock.model.autoPost as any).findFirst.mockResolvedValue(null);
    const repo = new AutopostRepository(mock as any);
    await expect(repo.createAutopost('org', { url: 'https://x', integrations: [] } as any, 'ap-B', 'prof-A')).rejects.toMatchObject({ status: 404 });
    expect((mock.model.autoPost as any).findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'ap-B', organizationId: 'org', profileId: 'prof-A' }),
      })
    );
    expect((mock.model.autoPost as any).upsert).not.toHaveBeenCalled();
  });
});
