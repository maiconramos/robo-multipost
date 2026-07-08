// Mocks topo-de-modulo: PostsService importa IntegrationManager (nostr.provider
// ESM-only que quebra ts-jest), MediaService (alias @gitroom/backend) e
// ShortLinkService. Nada disso e usado pelo caminho de changeState.
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

const ERROR_ROW = {
  id: 'post-1',
  organizationId: 'org-1',
  profileId: 'prof-9',
  integrationId: 'int-1',
  integration: {
    providerIdentifier: 'instagram',
    name: 'IG do Cliente',
    picture: 'https://cdn/ig.jpg',
  },
};

const buildService = (repo: any, statusEvent: any) =>
  new PostsService(
    repo as any,
    null as any, // integrationManager
    null as any, // integrationService
    null as any, // mediaService
    null as any, // shortLinkService
    null as any, // openaiService
    null as any, // temporalService
    null as any, // refreshIntegrationService
    null as any, // aiTextService
    {} as any, // encryption
    statusEvent as any
  );

describe('PostsService.changeState (StatusEvent POST_FAILED)', () => {
  it('registra POST_FAILED com snapshot do canal e mensagem sanitizada quando ERROR', async () => {
    const repo = { changeState: jest.fn().mockResolvedValue(ERROR_ROW) };
    const statusEvent = { record: jest.fn().mockResolvedValue(undefined) };
    const service = buildService(repo, statusEvent);

    await service.changeState(
      'post-1',
      'ERROR' as any,
      new (class extends Error {
        constructor() {
          super('400 Bad Request');
          this.name = 'HttpError';
        }
      })(),
      { some: 'body' }
    );

    expect(statusEvent.record).toHaveBeenCalledTimes(1);
    expect(statusEvent.record).toHaveBeenCalledWith({
      organizationId: 'org-1',
      type: 'POST_FAILED',
      severity: 'CRITICAL',
      message: 'HttpError: 400 Bad Request',
      profileId: 'prof-9',
      integrationId: 'int-1',
      channelName: 'IG do Cliente',
      channelPicture: 'https://cdn/ig.jpg',
      providerIdentifier: 'instagram',
      entityId: 'post-1',
    });
  });

  it('NAO serializa o erro cru (nunca JSON.stringify) — objeto sem forma de Error vira message null', async () => {
    const repo = { changeState: jest.fn().mockResolvedValue(ERROR_ROW) };
    const statusEvent = { record: jest.fn().mockResolvedValue(undefined) };
    const service = buildService(repo, statusEvent);

    // Erro no formato cru da activity — carrega um "token" no corpo.
    await service.changeState(
      'post-1',
      'ERROR' as any,
      { body: { refresh_token: 'SECRET-do-not-leak' } },
      {}
    );

    const arg = statusEvent.record.mock.calls[0][0];
    expect(arg.message).toBeNull();
    // garantia dura: o segredo nunca aparece na mensagem
    expect(JSON.stringify(arg)).not.toContain('SECRET-do-not-leak');
  });

  it('NAO registra evento para transicoes que nao sao ERROR', async () => {
    const repo = {
      changeState: jest.fn().mockResolvedValue({ ...ERROR_ROW }),
    };
    const statusEvent = { record: jest.fn().mockResolvedValue(undefined) };
    const service = buildService(repo, statusEvent);

    await service.changeState('post-1', 'PUBLISHED' as any);

    expect(statusEvent.record).not.toHaveBeenCalled();
  });
});
