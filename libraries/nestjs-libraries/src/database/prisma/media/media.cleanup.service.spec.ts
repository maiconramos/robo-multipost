// Mocks topo-de-modulo: importar PostsService puxa IntegrationManager
// (nostr.provider, ESM-only que quebra ts-jest) e o alias @gitroom/backend.
// Nada disso e usado pelo MediaCleanupService.
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

import { MediaCleanupService } from './media.cleanup.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MediaRepository } from './media.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

describe('MediaCleanupService', () => {
  it('nao deve apagar midia referenciada por post pendente', async () => {
    const mediaRepo = createMock<MediaRepository>();
    mediaRepo.getDeletableMedia.mockResolvedValue([
      {
        id: 'm1',
        organizationId: 'o1',
        profileId: null,
        path: 'https://r2/keep.png',
      },
      {
        id: 'm2',
        organizationId: 'o1',
        profileId: null,
        path: 'https://r2/old.png',
      },
    ] as any);
    const postsService = createMock<PostsService>();
    postsService.getReferencedMediaPaths.mockResolvedValue(
      new Set(['https://r2/keep.png'])
    );
    const service = new MediaCleanupService(mediaRepo, postsService);
    const removeFile = jest.fn().mockResolvedValue(undefined);
    (service as any).storage = { removeFile };

    const result = await service.cleanup(30);

    expect(removeFile).toHaveBeenCalledTimes(1);
    expect(removeFile).toHaveBeenCalledWith('https://r2/old.png');
    expect(mediaRepo.deleteMedia).toHaveBeenCalledWith('o1', 'm2', undefined);
    expect(mediaRepo.deleteMedia).not.toHaveBeenCalledWith(
      'o1',
      'm1',
      undefined
    );
    expect(result.deleted).toBe(1);
  });

  it('deve ser no-op quando nao ha candidatos (count guard)', async () => {
    const mediaRepo = createMock<MediaRepository>();
    mediaRepo.getDeletableMedia.mockResolvedValue([] as any);
    const postsService = createMock<PostsService>();
    const service = new MediaCleanupService(mediaRepo, postsService);

    const result = await service.cleanup(30);

    expect(postsService.getReferencedMediaPaths).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: 0, skipped: 0, failed: 0 });
  });

  it('nao deve fazer soft-delete quando removeFile falha (registro mantido)', async () => {
    const mediaRepo = createMock<MediaRepository>();
    mediaRepo.getDeletableMedia.mockResolvedValue([
      {
        id: 'm1',
        organizationId: 'o1',
        profileId: null,
        path: 'https://r2/old.png',
      },
    ] as any);
    const postsService = createMock<PostsService>();
    postsService.getReferencedMediaPaths.mockResolvedValue(new Set());
    const service = new MediaCleanupService(mediaRepo, postsService);
    const removeFile = jest
      .fn()
      .mockRejectedValue(new Error('storage indisponivel'));
    (service as any).storage = { removeFile };

    const result = await service.cleanup(30);

    expect(mediaRepo.deleteMedia).not.toHaveBeenCalledWith(
      'o1',
      'm1',
      undefined
    );
    expect(result.failed).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it('deve escopar getDeletableMedia e getReferencedMediaPaths na mesma org', async () => {
    const mediaRepo = createMock<MediaRepository>();
    mediaRepo.getDeletableMedia.mockResolvedValue([
      {
        id: 'm1',
        organizationId: 'org-1',
        profileId: null,
        path: 'https://r2/keep.png',
      },
    ] as any);
    const postsService = createMock<PostsService>();
    postsService.getReferencedMediaPaths.mockResolvedValue(
      new Set(['https://r2/keep.png'])
    );
    const service = new MediaCleanupService(mediaRepo, postsService);

    await service.cleanup(30, 'org-1');

    expect(mediaRepo.getDeletableMedia).toHaveBeenCalledWith(
      expect.any(Date),
      'org-1'
    );
    expect(postsService.getReferencedMediaPaths).toHaveBeenCalledWith('org-1');
  });

  it('deve remover tambem o thumbnail do video quando presente', async () => {
    const mediaRepo = createMock<MediaRepository>();
    mediaRepo.getDeletableMedia.mockResolvedValue([
      {
        id: 'm1',
        organizationId: 'o1',
        profileId: null,
        path: 'https://r2/video.mp4',
        thumbnail: 'https://r2/video-thumb.png',
      },
    ] as any);
    const postsService = createMock<PostsService>();
    postsService.getReferencedMediaPaths.mockResolvedValue(new Set());
    const service = new MediaCleanupService(mediaRepo, postsService);
    const removeFile = jest.fn().mockResolvedValue(undefined);
    (service as any).storage = { removeFile };

    const result = await service.cleanup(30);

    expect(removeFile).toHaveBeenCalledTimes(2);
    expect(removeFile).toHaveBeenCalledWith('https://r2/video.mp4');
    expect(removeFile).toHaveBeenCalledWith('https://r2/video-thumb.png');
    expect(result.deleted).toBe(1);
  });
});
