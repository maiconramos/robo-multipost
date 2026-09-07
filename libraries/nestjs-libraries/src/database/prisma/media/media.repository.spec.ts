import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { MediaRepository } from './media.repository';

const buildRepository = () => {
  const mediaMock = createPrismaRepositoryMock('media');
  const postMock = createPrismaRepositoryMock('post');
  const repository = new MediaRepository(mediaMock as any, postMock as any);

  return { repository, mediaMock, postMock };
};

describe('MediaRepository', () => {
  describe('findPendingPostsUsingMedia', () => {
    it('procura a midia em image e em settings dos posts que ainda vao publicar', async () => {
      const { repository, postMock } = buildRepository();
      (postMock.model.post as any).findMany.mockResolvedValue([]);

      await repository.findPendingPostsUsingMedia('org-1', ['m-1', 'm-2']);

      expect((postMock.model.post as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            deletedAt: null,
            state: { in: ['QUEUE', 'DRAFT', 'ERROR'] },
            OR: [
              { image: { contains: 'm-1' } },
              { settings: { contains: 'm-1' } },
              { image: { contains: 'm-2' } },
              { settings: { contains: 'm-2' } },
            ],
          },
        })
      );
    });

    it('nao consulta o banco quando nao ha ids', async () => {
      const { repository, postMock } = buildRepository();

      await expect(
        repository.findPendingPostsUsingMedia('org-1', [])
      ).resolves.toEqual([]);
      expect((postMock.model.post as any).findMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteMediaBulk', () => {
    it('preserva o escopo de org e perfil e ignora midia ja excluida', async () => {
      const { repository, mediaMock } = buildRepository();
      (mediaMock.model.media as any).updateMany.mockResolvedValue({ count: 2 });

      await repository.deleteMediaBulk('org-1', ['m-1', 'm-2'], 'prof-1');

      expect((mediaMock.model.media as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['m-1', 'm-2'] },
            organizationId: 'org-1',
            deletedAt: null,
            OR: [{ profileId: 'prof-1' }, { profileId: null }],
          },
        })
      );
    });
  });

  describe('getMediaForDeletion', () => {
    it('marca usedAsAvatar quando a midia e foto de perfil, logo ou icone de app', async () => {
      const { repository, mediaMock } = buildRepository();
      (mediaMock.model.media as any).findMany.mockResolvedValue([
        {
          id: 'm-1',
          name: 'a.png',
          path: 'p1',
          thumbnail: null,
          _count: { userPicture: 0, agencies: 0, oauthApps: 0 },
        },
        {
          id: 'm-2',
          name: 'b.png',
          path: 'p2',
          thumbnail: null,
          _count: { userPicture: 1, agencies: 0, oauthApps: 0 },
        },
      ]);

      const result = await repository.getMediaForDeletion('org-1', [
        'm-1',
        'm-2',
      ]);

      expect(result).toEqual([
        { id: 'm-1', name: 'a.png', path: 'p1', thumbnail: null, usedAsAvatar: false },
        { id: 'm-2', name: 'b.png', path: 'p2', thumbnail: null, usedAsAvatar: true },
      ]);
    });
  });

  describe('getMedia', () => {
    it('conta apenas midia viva para nao gerar paginas vazias apos exclusao', async () => {
      const { repository, mediaMock } = buildRepository();
      (mediaMock.model.media as any).count.mockResolvedValue(0);
      (mediaMock.model.media as any).findMany.mockResolvedValue([]);

      await repository.getMedia('org-1', 1, 'prof-1');

      expect((mediaMock.model.media as any).count).toHaveBeenCalledWith({
        where: {
          organization: { id: 'org-1' },
          deletedAt: null,
          OR: [{ profileId: 'prof-1' }, { profileId: null }],
        },
      });
    });
  });
});
