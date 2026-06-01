import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { MediaRepository } from './media.repository';

describe('MediaRepository.getDeletableMedia', () => {
  it('deve buscar midia nao deletada criada antes do cutoff', async () => {
    const prisma = createPrismaRepositoryMock('media');
    prisma.model.media.findMany.mockResolvedValue([] as any);
    const repo = new MediaRepository(prisma as any);
    const cutoff = new Date('2026-05-01');

    await repo.getDeletableMedia(cutoff, 'org-1');

    expect(prisma.model.media.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        createdAt: { lt: cutoff },
        organizationId: 'org-1',
      },
      select: {
        id: true,
        organizationId: true,
        profileId: true,
        path: true,
      },
    });
  });

  it('deve omitir organizationId quando orgId nao for fornecido', async () => {
    const prisma = createPrismaRepositoryMock('media');
    prisma.model.media.findMany.mockResolvedValue([] as any);
    const repo = new MediaRepository(prisma as any);
    const cutoff = new Date('2026-05-01');

    await repo.getDeletableMedia(cutoff);

    expect(prisma.model.media.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        organizationId: true,
        profileId: true,
        path: true,
      },
    });
  });
});

describe('MediaRepository.getMediaStats', () => {
  it('deve retornar total e soma de bytes da midia ativa', async () => {
    const prisma = createPrismaRepositoryMock('media');
    prisma.model.media.count.mockResolvedValue(3);
    prisma.model.media.aggregate.mockResolvedValue({
      _sum: { fileSize: 4096 },
    } as any);
    const repo = new MediaRepository(prisma as any);

    const result = await repo.getMediaStats('org-1');

    expect(prisma.model.media.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', deletedAt: null },
    });
    expect(result).toEqual({ total: 3, totalSizeBytes: 4096 });
  });

  it('deve usar 0 quando a soma de fileSize for nula', async () => {
    const prisma = createPrismaRepositoryMock('media');
    prisma.model.media.count.mockResolvedValue(0);
    prisma.model.media.aggregate.mockResolvedValue({
      _sum: { fileSize: null },
    } as any);
    const repo = new MediaRepository(prisma as any);

    const result = await repo.getMediaStats('org-1', 'profile-9');

    expect(prisma.model.media.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        deletedAt: null,
        OR: [{ profileId: 'profile-9' }, { profileId: null }],
      },
    });
    expect(result).toEqual({ total: 0, totalSizeBytes: 0 });
  });
});
