// Mocks topo-de-modulo (mesma razao dos outros specs de PostsService).
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManagerMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/short-linking/short.link.service',
  () => ({ ShortLinkService: class ShortLinkServiceMock {} })
);

import { PostsService } from './posts.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { PostsRepository } from './posts.repository';

const buildService = (repo: ReturnType<typeof createMock<PostsRepository>>) =>
  new PostsService(
    repo as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    {} as any,
    {} as any
  );

describe('PostsService - revisao (aprovar/comentar por perfil)', () => {
  let repo: ReturnType<typeof createMock<PostsRepository>>;
  let service: PostsService;

  beforeEach(() => {
    repo = createMock<PostsRepository>();
    service = buildService(repo);
  });

  describe('createReview', () => {
    it('lanca 404 quando o post nao pertence a org', async () => {
      repo.getPostProfileScope.mockResolvedValue(null as any);

      await expect(
        service.createReview('org-1', 'u-1', 'post-x', {
          kind: 'APPROVAL',
          content: '',
        })
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.createComment).not.toHaveBeenCalled();
    });

    it('bloqueia (403) quando o post nao esta no perfil do membro', async () => {
      repo.getPostProfileScope.mockResolvedValue({
        id: 'post-1',
        profileId: 'prof-outro',
      } as any);

      await expect(
        service.createReview('org-1', 'u-1', 'post-1', {
          kind: 'APPROVAL',
          content: '',
          requireProfileId: 'prof-dell',
        })
      ).rejects.toMatchObject({ status: 403 });
    });

    it('cria APPROVAL quando o post esta no perfil do membro', async () => {
      repo.getPostProfileScope.mockResolvedValue({
        id: 'post-1',
        profileId: 'prof-dell',
      } as any);
      repo.createComment.mockResolvedValue({ id: 'c-1' } as any);

      await service.createReview('org-1', 'u-1', 'post-1', {
        kind: 'APPROVAL',
        content: '',
        requireProfileId: 'prof-dell',
      });

      expect(repo.createComment).toHaveBeenCalledWith(
        'org-1',
        'u-1',
        'post-1',
        '',
        'APPROVAL'
      );
    });

    it('exige conteudo para COMMENT', async () => {
      repo.getPostProfileScope.mockResolvedValue({
        id: 'post-1',
        profileId: 'prof-dell',
      } as any);

      await expect(
        service.createReview('org-1', 'u-1', 'post-1', {
          kind: 'COMMENT',
          content: '   ',
          requireProfileId: 'prof-dell',
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.createComment).not.toHaveBeenCalled();
    });

    it('admin (requireProfileId undefined) nao valida perfil', async () => {
      repo.getPostProfileScope.mockResolvedValue({
        id: 'post-1',
        profileId: 'prof-qualquer',
      } as any);
      repo.createComment.mockResolvedValue({ id: 'c-1' } as any);

      await service.createReview('org-1', 'admin-1', 'post-1', {
        kind: 'CHANGE_REQUEST',
        content: 'ajustar',
      });

      expect(repo.createComment).toHaveBeenCalled();
    });
  });

  describe('getReviewComments', () => {
    it('valida acesso e retorna os comentarios escopados por org', async () => {
      repo.getPostProfileScope.mockResolvedValue({
        id: 'post-1',
        profileId: 'prof-dell',
      } as any);
      repo.getComments.mockResolvedValue([{ id: 'c-1' }] as any);

      const res = await service.getReviewComments('org-1', 'post-1', 'prof-dell');

      expect(res).toEqual([{ id: 'c-1' }]);
      expect(repo.getComments).toHaveBeenCalledWith('post-1', 'org-1');
    });
  });
});
