// MediaService importa SubscriptionService que cascateia ate nostr-tools
// (ESM-only que quebra ts-jest). Mockamos topo-de-modulo as cadeias pesadas.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/videos/video.manager',
  () => ({ VideoManager: class VideoManagerMock {} })
);
jest.mock(
  '@gitroom/backend/services/auth/permissions/permission.exception.class',
  () => ({
    AuthorizationActions: { Create: 'Create', Delete: 'Delete', Update: 'Update' },
    Sections: { ADMIN: 'ADMIN', VIDEOS_PER_MONTH: 'VIDEOS_PER_MONTH' },
    SubscriptionException: class SubscriptionExceptionMock extends Error {
      constructor(public meta: any) { super('SubscriptionException'); }
    },
  })
);

const mockStorage = {
  uploadSimple: jest.fn(),
  uploadFile: jest.fn(),
  removeFile: jest.fn(),
  healthCheck: jest.fn(),
};
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => mockStorage },
}));

import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';

const buildService = () => {
  const repository = createMock<MediaRepository>();
  repository.findPendingPostsUsingMedia.mockResolvedValue([] as any);
  repository.findMediaReferencingPaths.mockResolvedValue([] as any);
  repository.deleteMediaBulk.mockResolvedValue({ count: 0 } as any);

  const service = new MediaService(
    repository,
    null as any, // openaiService legacy
    null as any, // subscriptionService
    null as any, // videoManager
    null as any, // aiImageService
    null as any, // aiTextService
    null as any // aiVideoService
  );

  return { service, repository };
};

const candidate = (overrides: Partial<any> = {}) => ({
  id: 'media-1',
  name: 'foto.png',
  path: 'https://bucket.example.com/foto.png',
  thumbnail: null as string | null,
  usedAsAvatar: false,
  ...overrides,
});

describe('MediaService.deleteMediaBulk', () => {
  beforeEach(() => {
    mockStorage.removeFile.mockReset();
    mockStorage.removeFile.mockResolvedValue(undefined);
  });

  it('remove so o arquivo da midia (nunca a miniatura informada pelo cliente) antes de marcar deletedAt', async () => {
    const { service, repository } = buildService();
    repository.getMediaForDeletion.mockResolvedValue([
      candidate({ thumbnail: 'https://bucket.example.com/arquivo-de-outra-org.jpg' }),
    ] as any);

    const result = await service.deleteMediaBulk('org-1', ['media-1'], 'prof-1');

    expect(mockStorage.removeFile).toHaveBeenCalledTimes(1);
    expect(mockStorage.removeFile).toHaveBeenCalledWith(
      'https://bucket.example.com/foto.png'
    );
    expect(repository.deleteMediaBulk).toHaveBeenCalledWith(
      'org-1',
      ['media-1'],
      'prof-1'
    );
    expect(result).toEqual({ deleted: ['media-1'], blocked: [], failed: [] });
  });

  it('bloqueia midia usada em post pendente e nao toca no bucket', async () => {
    const { service, repository } = buildService();
    repository.getMediaForDeletion.mockResolvedValue([candidate()] as any);
    repository.findPendingPostsUsingMedia.mockResolvedValue([
      { image: '[{"id":"media-1","path":"x"}]', settings: null as string | null },
    ] as any);

    const result = await service.deleteMediaBulk('org-1', ['media-1']);

    expect(mockStorage.removeFile).not.toHaveBeenCalled();
    expect(repository.deleteMediaBulk).not.toHaveBeenCalled();
    expect(result.deleted).toEqual([]);
    expect(result.blocked).toEqual([
      { id: 'media-1', name: 'foto.png', reason: 'pending_posts', posts: 1 },
    ]);
  });

  it('bloqueia midia usada como thumbnail do YouTube no settings do post', async () => {
    const { service, repository } = buildService();
    repository.getMediaForDeletion.mockResolvedValue([candidate()] as any);
    repository.findPendingPostsUsingMedia.mockResolvedValue([
      { image: '[]', settings: '{"thumbnail":{"id":"media-1","path":"x"}}' },
    ] as any);

    const result = await service.deleteMediaBulk('org-1', ['media-1']);

    expect(mockStorage.removeFile).not.toHaveBeenCalled();
    expect(result.blocked[0].reason).toBe('pending_posts');
  });

  it('bloqueia midia usada como foto de perfil, logo ou icone de app', async () => {
    const { service, repository } = buildService();
    repository.getMediaForDeletion.mockResolvedValue([
      candidate({ usedAsAvatar: true }),
    ] as any);

    const result = await service.deleteMediaBulk('org-1', ['media-1']);

    expect(mockStorage.removeFile).not.toHaveBeenCalled();
    expect(result.blocked[0].reason).toBe('avatar');
  });

  it('bloqueia midia cujo arquivo e thumbnail de outra midia viva', async () => {
    const { service, repository } = buildService();
    repository.getMediaForDeletion.mockResolvedValue([candidate()] as any);
    repository.findMediaReferencingPaths.mockResolvedValue([
      {
        id: 'media-2',
        path: 'https://bucket.example.com/video.mp4',
        thumbnail: 'https://bucket.example.com/foto.png',
      },
    ] as any);

    const result = await service.deleteMediaBulk('org-1', ['media-1']);

    expect(mockStorage.removeFile).not.toHaveBeenCalled();
    expect(result.blocked[0].reason).toBe('thumbnail_of_other_media');
  });

  it('preserva no bucket arquivo duplicado por outra midia viva, mas apaga a linha', async () => {
    const { service, repository } = buildService();
    repository.getMediaForDeletion.mockResolvedValue([
      candidate({ thumbnail: 'https://bucket.example.com/thumb.jpg' }),
    ] as any);
    repository.findMediaReferencingPaths.mockResolvedValue([
      {
        id: 'media-2',
        path: 'https://bucket.example.com/foto.png',
        thumbnail: null as string | null,
      },
    ] as any);

    const result = await service.deleteMediaBulk('org-1', ['media-1']);

    expect(mockStorage.removeFile).not.toHaveBeenCalled();
    expect(result.deleted).toEqual(['media-1']);
  });

  it('mantem a midia viva quando a remocao no storage falha', async () => {
    const { service, repository } = buildService();
    repository.getMediaForDeletion.mockResolvedValue([
      candidate(),
      candidate({ id: 'media-2', name: 'ok.png', path: 'https://bucket.example.com/ok.png' }),
    ] as any);
    mockStorage.removeFile.mockImplementation(async (path: string) => {
      if (path.endsWith('foto.png')) {
        throw new Error('AccessDenied');
      }
    });

    const result = await service.deleteMediaBulk('org-1', ['media-1', 'media-2']);

    expect(result.failed).toEqual([{ id: 'media-1', name: 'foto.png' }]);
    expect(result.deleted).toEqual(['media-2']);
    expect(repository.deleteMediaBulk).toHaveBeenCalledWith(
      'org-1',
      ['media-2'],
      undefined
    );
  });

  it('ignora lista vazia sem consultar o banco', async () => {
    const { service, repository } = buildService();

    const result = await service.deleteMediaBulk('org-1', []);

    expect(repository.getMediaForDeletion).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: [], blocked: [], failed: [] });
  });

  it('exclusao individual usa as mesmas travas da exclusao em massa', async () => {
    const { service, repository } = buildService();
    repository.getMediaForDeletion.mockResolvedValue([candidate()] as any);

    const result = await service.deleteMedia('org-1', 'media-1', 'prof-1');

    expect(repository.getMediaForDeletion).toHaveBeenCalledWith(
      'org-1',
      ['media-1'],
      'prof-1'
    );
    expect(result.deleted).toEqual(['media-1']);
  });
});

describe('MediaService.getMedia', () => {
  it('marca inUse para midia de post pendente e para avatar', async () => {
    const { service, repository } = buildService();
    repository.getMedia.mockResolvedValue({
      pages: 1,
      results: [
        { id: 'media-1', name: 'a.png', usedAsAvatar: false },
        { id: 'media-2', name: 'b.png', usedAsAvatar: true },
        { id: 'media-3', name: 'c.png', usedAsAvatar: false },
      ],
    } as any);
    repository.findPendingPostsUsingMedia.mockResolvedValue([
      { image: '[{"id":"media-1"}]', settings: null as string | null },
    ] as any);

    const result = await service.getMedia('org-1', 1, 'prof-1');

    expect(result.results.map((item: any) => item.inUse)).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe('MediaService.saveMediaInformation', () => {
  const ORIGINAL = process.env.FRONTEND_URL;
  beforeAll(() => {
    process.env.FRONTEND_URL = 'https://app.example.com';
  });
  afterAll(() => {
    process.env.FRONTEND_URL = ORIGINAL;
  });

  it('nao altera midia de outro perfil', async () => {
    const { service, repository } = buildService();
    repository.getMediaForInformation.mockResolvedValue(null as any);
    await expect(
      service.saveMediaInformation('org-1', { id: 'media-B', alt: 'x' } as any, 'prof-A')
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.getMediaForInformation).toHaveBeenCalledWith('org-1', 'media-B', 'prof-A');
    expect(repository.saveMediaInformation).not.toHaveBeenCalled();
  });

  it('recusa miniatura que nao e um arquivo canonico do proprio storage', async () => {
    const { service, repository } = buildService();
    repository.getMediaForInformation.mockResolvedValue({ id: 'media-1', thumbnail: null } as any);
    for (const thumbnail of [
      'https://app.example.com/uploads/2026/11/01/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png?v=1',
      'https://outro.example.com/uploads/2026/11/01/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
    ]) {
      await expect(
        service.saveMediaInformation('org-1', { id: 'media-1', alt: '', thumbnail } as any, 'prof-A')
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(repository.saveMediaInformation).not.toHaveBeenCalled();
  });

  it('aceita miniatura recem enviada ao proprio storage e a miniatura atual', async () => {
    const { service, repository } = buildService();
    repository.getMediaForInformation.mockResolvedValue({
      id: 'media-1',
      thumbnail: 'https://legado.example.com/thumb.jpg?x=1',
    } as any);
    await service.saveMediaInformation(
      'org-1',
      { id: 'media-1', alt: '', thumbnail: 'https://app.example.com/uploads/2026/11/01/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png' } as any,
      'prof-A'
    );
    await service.saveMediaInformation(
      'org-1',
      { id: 'media-1', alt: 'novo', thumbnail: 'https://legado.example.com/thumb.jpg?x=1' } as any,
      'prof-A'
    );
    expect(repository.saveMediaInformation).toHaveBeenCalledTimes(2);
  });
});
