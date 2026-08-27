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
