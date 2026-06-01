// Mocks topo-de-modulo necessarios porque PostsService importa
// IntegrationManager (que carrega nostr.provider — ESM only que quebra
// ts-jest) e MediaService (que importa o alias @gitroom/backend nao
// mapeado no jest.config das libraries). Nada disso e usado pelo
// getReferencedMediaPaths.
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
import { PostsRepository } from './posts.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';

describe('PostsService.getReferencedMediaPaths', () => {
  let repository: ReturnType<typeof createMock<PostsRepository>>;
  let service: PostsService;

  beforeEach(() => {
    repository = createMock<PostsRepository>();
    service = new PostsService(
      repository as any, // postsRepository
      null as any, // integrationManager
      null as any, // integrationService
      null as any, // mediaService
      null as any, // shortLinkService
      null as any, // openaiService (legacy)
      null as any, // temporalService
      null as any, // refreshIntegrationService
      null as any // aiTextService
    );
  });

  // Em producao o path da midia vive em Post.image (JSON do MediaDto, formato
  // [{ id, path }]). Post.content e o HTML da legenda (texto simples, sem path).
  // A guarda principal e a leitura de Post.image; o parse de content e apenas
  // um safety-net defensivo para formatos futuros.
  it('deve coletar os paths de imagem dos posts pendentes (QUEUE/DRAFT) a partir de Post.image', async () => {
    repository.getPendingPostsMedia.mockResolvedValue([
      {
        content: '<p>legenda do post</p>',
        image: JSON.stringify([{ id: 'x', path: 'https://r2/a.png' }]),
      },
      {
        content: '<p>outra legenda</p>',
        image: JSON.stringify([
          { id: 'y', path: 'https://r2/b.png' },
          { id: 'z', path: 'https://r2/c.png' },
        ]),
      },
    ] as any);

    const paths = await service.getReferencedMediaPaths('org-1');

    expect(paths.has('https://r2/a.png')).toBe(true);
    expect(paths.has('https://r2/b.png')).toBe(true);
    expect(paths.has('https://r2/c.png')).toBe(true);
  });

  it('deve ignorar conteudo nao-JSON sem lancar erro', async () => {
    repository.getPendingPostsMedia.mockResolvedValue([
      { content: 'texto simples nao-json', image: null },
    ] as any);

    const paths = await service.getReferencedMediaPaths('org-1');

    expect(paths.size).toBe(0);
  });
});
