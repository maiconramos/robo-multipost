import { Provider } from '@prisma/client';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  it.each(['America/Sao_Paulo', null])(
    'grava fuso %s sem alterar offset legado ou outros usuarios',
    async (timezoneName) => {
      const prisma = createPrismaRepositoryMock('user');
      prisma.model.user.update.mockResolvedValue({ timezoneName });
      const repository = new UsersRepository(prisma as any);

      await expect(
        repository.setTimezone('user-1', timezoneName)
      ).resolves.toEqual({ timezoneName });
      expect(prisma.model.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { timezoneName },
        select: { timezoneName: true },
      });
    }
  );

  it('troca de senha grava o corte que derruba sessoes e links antigos', async () => {
    const prisma = createPrismaRepositoryMock('user');
    prisma.model.user.update.mockResolvedValue({});
    const repository = new UsersRepository(prisma as any);
    const before = Math.floor(Date.now() / 1000) * 1000;

    await repository.updatePassword('user-1', 'nova-senha');

    const call = prisma.model.user.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'user-1', providerName: Provider.LOCAL });
    expect(call.data.password).toEqual(expect.any(String));
    expect(call.data.password).not.toBe('nova-senha');
    expect(call.data.sessionsValidAfter).toBeInstanceOf(Date);
    expect(call.data.sessionsValidAfter.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.data.sessionsValidAfter.getTime() % 1000).toBe(0);
  });

  it('busca conta local por email sem diferenciar maiusculas e minusculas', async () => {
    const prisma = createPrismaRepositoryMock('user');
    prisma.model.user.findFirst.mockResolvedValue(null);
    const repository = new UsersRepository(prisma as any);

    await repository.getUserByEmail('Legacy.User@Example.COM');

    expect(prisma.model.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: 'Legacy.User@Example.COM',
          mode: 'insensitive',
        },
        providerName: Provider.LOCAL,
      },
      include: {
        picture: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });
  });
});
