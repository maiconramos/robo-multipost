// Mocks topo-de-modulo: PostsService importa IntegrationManager (carrega
// nostr.provider, ESM-only que quebra ts-jest), MediaService (alias
// @gitroom/backend nao mapeado no jest das libraries) e ShortLinkService.
// Nada disso e usado pelo caminho de derivacao de profileId em createPost.
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
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';

const makeBody = () => ({
  type: 'schedule' as const,
  shortLink: false,
  date: '2026-06-07T17:00:00.000Z',
  tags: [] as { value: string; label: string }[],
  posts: [
    {
      integration: { id: 'int-1' },
      value: [{ content: '<p>carro</p>' }],
      settings: { __type: 'instagram' },
    },
  ],
});

const buildService = (
  repo: ReturnType<typeof createMock<PostsRepository>>,
  integrationService: ReturnType<typeof createMock<IntegrationService>>
) => {
  const service = new PostsService(
    repo as any,
    null as any, // integrationManager
    integrationService as any,
    null as any, // mediaService
    null as any, // shortLinkService
    null as any, // openaiService
    null as any, // temporalService
    null as any, // refreshIntegrationService
    null as any // aiTextService
  );
  // startWorkflow dispara Temporal (fire-and-forget); neutraliza no teste.
  jest.spyOn(service as any, 'startWorkflow').mockResolvedValue(undefined);
  return service;
};

describe('PostsService.createPost - derivacao de profileId', () => {
  let repo: ReturnType<typeof createMock<PostsRepository>>;
  let integrationService: ReturnType<typeof createMock<IntegrationService>>;

  beforeEach(() => {
    repo = createMock<PostsRepository>();
    integrationService = createMock<IntegrationService>();
    repo.createOrUpdatePost.mockResolvedValue({
      posts: [{ id: 'post-1', state: 'QUEUE' }],
    } as any);
  });

  it('herda o profileId do canal quando nenhum profileId e fornecido', async () => {
    integrationService.getIntegrationById.mockResolvedValue({
      id: 'int-1',
      profileId: 'profile-do-canal',
    } as any);
    const service = buildService(repo, integrationService);

    await service.createPost('org-1', makeBody() as any);

    expect(integrationService.getIntegrationById).toHaveBeenCalledWith('org-1', 'int-1');
    const passedProfileId = repo.createOrUpdatePost.mock.calls[0][6];
    expect(passedProfileId).toBe('profile-do-canal');
  });

  it('usa o profileId explicito sem consultar o canal', async () => {
    const service = buildService(repo, integrationService);

    await service.createPost('org-1', makeBody() as any, 'profile-explicito');

    expect(integrationService.getIntegrationById).not.toHaveBeenCalled();
    const passedProfileId = repo.createOrUpdatePost.mock.calls[0][6];
    expect(passedProfileId).toBe('profile-explicito');
  });

  it('passa undefined quando o canal tambem nao tem perfil (sem regressao de orfaos)', async () => {
    integrationService.getIntegrationById.mockResolvedValue({
      id: 'int-1',
      profileId: null,
    } as any);
    const service = buildService(repo, integrationService);

    await service.createPost('org-1', makeBody() as any);

    const passedProfileId = repo.createOrUpdatePost.mock.calls[0][6];
    expect(passedProfileId).toBeUndefined();
  });
});
