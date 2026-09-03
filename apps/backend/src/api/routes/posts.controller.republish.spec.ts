jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkServiceMock {},
}));
jest.mock('@gitroom/nestjs-libraries/agent/agent.graph.service', () => ({
  AgentGraphService: class AgentGraphServiceMock {},
}));

import { createMock } from '@gitroom/nestjs-libraries/test';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostsController } from './posts.controller';

const buildController = () => {
  const postsService = createMock<PostsService>();
  const controller = new PostsController(
    postsService,
    null as any,
    null as any,
    null as any
  );

  return { controller, postsService };
};

describe('PostsController.changeDate - republicacao explicita', () => {
  it('repassa update como default seguro e preserva a posicao do profileId', () => {
    const { controller, postsService } = buildController();

    controller.changeDate(
      { id: 'org-1' } as any,
      { id: 'profile-1' } as any,
      'post-1',
      '2026-09-04T17:00:00.000Z',
      undefined,
      false
    );

    expect(postsService.changeDate).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      '2026-09-04T17:00:00.000Z',
      'update',
      'profile-1',
      false
    );
  });

  it('repassa o opt-in depois do profileId', () => {
    const { controller, postsService } = buildController();

    controller.changeDate(
      { id: 'org-1' } as any,
      { id: 'profile-1' } as any,
      'post-1',
      '2026-09-04T17:00:00.000Z',
      'schedule',
      true
    );

    expect(postsService.changeDate).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      '2026-09-04T17:00:00.000Z',
      'schedule',
      'profile-1',
      true
    );
  });
});
