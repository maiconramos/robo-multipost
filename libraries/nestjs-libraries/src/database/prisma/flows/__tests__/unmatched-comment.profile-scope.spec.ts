jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { get: jest.fn(), set: jest.fn() },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/instagram.provider',
  () => ({ InstagramProvider: class InstagramProviderMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service',
  () => ({ InstagramMessagingService: class InstagramMessagingServiceMock {} })
);

import { createMock } from '@gitroom/nestjs-libraries/test';
import { FlowsRepository } from '../flows.repository';
import { UnmatchedCommentService } from '../unmatched-comment.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';

describe('UnmatchedCommentService - escopo de perfil', () => {
  let repository: ReturnType<typeof createMock<FlowsRepository>>;
  let integrations: ReturnType<typeof createMock<IntegrationService>>;
  let service: UnmatchedCommentService;
  const denied = new Error('Integration does not belong to this profile');

  beforeEach(() => {
    repository = createMock<FlowsRepository>();
    integrations = createMock<IntegrationService>();
    service = new UnmatchedCommentService(
      repository,
      integrations,
      {} as any,
      {} as any,
      {} as any
    );
    repository.findUnmatchedById.mockResolvedValue({
      id: 'uc-1',
      integrationId: 'int-B',
      organizationId: 'org',
      igMediaId: 'media-1',
    } as any);
  });

  it('lista da caixa exige canal visivel ao perfil', async () => {
    integrations.validateIntegrationProfile.mockRejectedValue(denied);
    await expect(service.listInbox('org', 'int-B', {}, 'prof-A')).rejects.toThrow(denied.message);
    expect(integrations.validateIntegrationProfile).toHaveBeenCalledWith('org', 'int-B', 'prof-A');
    expect(repository.listUnmatchedByIntegration).not.toHaveBeenCalled();
  });

  it('vincular comentario de outro perfil e recusado antes de criar alias', async () => {
    integrations.validateIntegrationProfile.mockRejectedValue(denied);
    await expect(service.bindToFlow('org', 'uc-1', 'flow-B', 'user-1', 'prof-A')).rejects.toThrow(denied.message);
    expect(repository.createAlias).not.toHaveBeenCalled();
  });

  it('vincular procura o flow dentro do perfil ativo', async () => {
    repository.getFlow.mockResolvedValue(null);
    await expect(service.bindToFlow('org', 'uc-1', 'flow-B', 'user-1', 'prof-A')).rejects.toThrow();
    expect(repository.getFlow).toHaveBeenCalledWith('org', 'flow-B', 'prof-A');
    expect(repository.createAlias).not.toHaveBeenCalled();
  });

  it('ignorar comentario de outro perfil e recusado sem gravar', async () => {
    integrations.validateIntegrationProfile.mockRejectedValue(denied);
    await expect(service.ignore('org', 'uc-1', 'spam', 'user-1', 'prof-A')).rejects.toThrow(denied.message);
    expect(repository.upsertIgnoredMedia).not.toHaveBeenCalled();
    expect(repository.markUnmatchedIgnored).not.toHaveBeenCalled();
  });

  it('lista de aliases filtra pelo perfil ativo', async () => {
    repository.listAliasesByFlow.mockResolvedValue([]);
    await service.listAliasesEnriched('org', 'flow-B', 'prof-A');
    expect(repository.listAliasesByFlow).toHaveBeenCalledWith('org', 'flow-B', 'prof-A');
  });
});
