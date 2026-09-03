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

import { HttpException } from '@nestjs/common';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';
import { PostsController } from './posts.controller';

const streamThatFails = (error: Error) =>
  (async function* () {
    yield { name: 'agent', data: { step: 'started' } };
    throw error;
  })();

const buildController = () => {
  const agentGraphService = createMock<AgentGraphService>();
  const controller = new PostsController(
    null as any,
    agentGraphService,
    null as any,
    null as any
  );
  const response = {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  } as any;

  return { controller, agentGraphService, response };
};

describe('PostsController.generatePosts - erro no stream', () => {
  it('emite a mensagem controlada do HttpException e encerra o stream', async () => {
    const { controller, agentGraphService, response } = buildController();
    agentGraphService.start.mockResolvedValue(
      streamThatFails(
        new HttpException('Conteudo recusado pelo provedor.', 422)
      ) as any
    );

    await expect(
      controller.generatePosts(
        { id: 'org-1' } as any,
        { id: 'profile-1' } as any,
        {} as any,
        response
      )
    ).resolves.toBeUndefined();

    expect(agentGraphService.start).toHaveBeenCalledWith(
      'org-1',
      {},
      'profile-1'
    );
    expect(response.write).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ name: 'agent', data: { step: 'started' } }) + '\n'
    );
    expect(response.write).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({
        name: 'error',
        error: true,
        message: 'Conteudo recusado pelo provedor.',
      }) + '\n'
    );
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it('nao vaza detalhes de erro inesperado no evento final', async () => {
    const { controller, agentGraphService, response } = buildController();
    agentGraphService.start.mockResolvedValue(
      streamThatFails(new Error('provider secret sk-live-sensitive')) as any
    );

    await controller.generatePosts(
      { id: 'org-1' } as any,
      null,
      {} as any,
      response
    );

    expect(response.write).toHaveBeenLastCalledWith(
      JSON.stringify({
        name: 'error',
        error: true,
        message: 'Nao foi possivel gerar as publicacoes. Tente novamente.',
      }) + '\n'
    );
    expect(response.end).toHaveBeenCalledTimes(1);
  });
});
