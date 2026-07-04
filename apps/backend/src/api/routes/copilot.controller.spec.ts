// Mock dependencias transitivas problematicas (ESM em node_modules) antes de
// importar o controller. Os testes de erro lancam antes de tocar Mastra /
// CopilotRuntime / OpenAI, entao mocks vazios bastam. Mesmo padrao de
// subscription.service.spec.ts.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: jest.fn() })
);
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: jest.fn(),
}));
jest.mock('@copilotkit/runtime', () => ({
  CopilotRuntime: jest.fn(),
  OpenAIAdapter: jest.fn(),
  copilotRuntimeNodeHttpEndpoint: jest.fn(),
  copilotRuntimeNextJSAppRouterEndpoint: jest.fn(),
}));
jest.mock('@ag-ui/mastra', () => ({
  MastraAgent: { getLocalAgents: jest.fn() },
}));
jest.mock('@mastra/core/di', () => ({ RequestContext: jest.fn() }));
jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }));
jest.mock('@openrouter/ai-sdk-provider', () => ({ createOpenRouter: jest.fn() }));

import { CopilotController } from './copilot.controller';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { AiClientFactory } from '@gitroom/nestjs-libraries/ai/ai-client.factory';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MockProxy } from 'jest-mock-extended';
import { HttpException } from '@nestjs/common';
import { Organization, Profile } from '@prisma/client';

describe('CopilotController', () => {
  let controller: CopilotController;
  let subscriptionService: MockProxy<SubscriptionService> & SubscriptionService;
  let mastraService: MockProxy<MastraService> & MastraService;
  let profileService: MockProxy<ProfileService> & ProfileService;
  let aiClientFactory: MockProxy<AiClientFactory> & AiClientFactory;

  const org = { id: 'org-1' } as Organization;

  const mockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    subscriptionService = createMock<SubscriptionService>();
    mastraService = createMock<MastraService>();
    profileService = createMock<ProfileService>();
    aiClientFactory = createMock<AiClientFactory>();
    controller = new CopilotController(
      subscriptionService,
      mastraService,
      profileService,
      aiClientFactory
    );
  });

  describe('chatAgent (/copilot/chat)', () => {
    it('deve responder 412 (sem pendurar) quando a credencial nao esta configurada', async () => {
      aiClientFactory.buildOpenAiCompatibleClient.mockRejectedValue(
        new HttpException('Configure suas chaves em Configuracoes > Modelos de IA.', 412)
      );
      const req: any = {};
      const res = mockRes();

      await controller.chatAgent(req, res, org, null);

      expect(aiClientFactory.buildOpenAiCompatibleClient).toHaveBeenCalledWith(
        'org-1',
        undefined
      );
      expect(res.status).toHaveBeenCalledWith(412);
      expect(res.json).toHaveBeenCalledTimes(1);
    });

    it('deve repassar o profileId para respeitar o gate shareDefault', async () => {
      aiClientFactory.buildOpenAiCompatibleClient.mockRejectedValue(
        new HttpException('Perfil sem chave e default nao compartilhado.', 412)
      );
      const req: any = {};
      const res = mockRes();
      const profile = { id: 'prof-2' } as Profile;

      await controller.chatAgent(req, res, org, profile);

      expect(aiClientFactory.buildOpenAiCompatibleClient).toHaveBeenCalledWith(
        'org-1',
        'prof-2'
      );
      expect(res.status).toHaveBeenCalledWith(412);
    });
  });

  describe('agent (/copilot/agent)', () => {
    it('deve responder 412 e NAO montar o runtime Mastra quando a credencial falha', async () => {
      aiClientFactory.buildOpenAiCompatibleClient.mockRejectedValue(
        new HttpException('Configure suas chaves em Configuracoes > Modelos de IA.', 412)
      );
      const req: any = { body: {} };
      const res = mockRes();
      const profile = { id: 'prof-1' } as Profile;

      await controller.agent(req, res, org, profile);

      expect(aiClientFactory.buildOpenAiCompatibleClient).toHaveBeenCalledWith(
        'org-1',
        'prof-1'
      );
      expect(res.status).toHaveBeenCalledWith(412);
      // Falhou antes de tocar o Mastra — nao deve montar o agente.
      expect(mastraService.mastra).not.toHaveBeenCalled();
    });

    it('deve propagar status generico 500 para erro sem HttpException', async () => {
      aiClientFactory.buildOpenAiCompatibleClient.mockRejectedValue(
        new Error('boom')
      );
      const req: any = { body: {} };
      const res = mockRes();

      await controller.agent(req, res, org, null);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
