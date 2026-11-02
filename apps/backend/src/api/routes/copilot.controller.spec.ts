// Mock dependencias transitivas problematicas (ESM em node_modules) antes de
// importar o controller. Os testes de erro lancam antes de tocar Mastra /
// CopilotRuntime / OpenAI, entao mocks vazios bastam. Mesmo padrao de
// subscription.service.spec.ts.
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({})
);
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
jest.mock('@copilotkit/runtime/v2', () => ({
  AgentRunner: class {},
  InMemoryAgentRunner: jest.fn(),
}));
jest.mock('@ag-ui/mastra', () => ({
  MastraAgent: { getLocalAgents: jest.fn() },
}));
jest.mock('@mastra/core/di', () => ({ RequestContext: jest.fn() }));
jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }));
jest.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: jest.fn(),
}));

import { CopilotController } from './copilot.controller';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { AiClientFactory } from '@gitroom/nestjs-libraries/ai/ai-client.factory';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MockProxy } from 'jest-mock-extended';
import { HttpException } from '@nestjs/common';
import { Organization, Profile } from '@prisma/client';
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { MastraAgent } from '@ag-ui/mastra';
import { RequestContext } from '@mastra/core/di';

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
    jest.clearAllMocks();
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

  it.each(['agent', 'chatAgent'] as const)(
    'recusa mutacoes novas antes do runtime em %s',
    async (route) => {
      for (const body of [
        { method: 'threads/clear' },
        {
          method: 'resource/request',
          params: { path: '/threads/clear', httpMethod: 'POST' },
        },
        {
          method: 'resource/request',
          params: { path: '/threads/known', httpMethod: 'DELETE' },
        },
      ]) {
        const res = mockRes();
        await controller[route]({ body } as any, res, org, null);
        expect(res.status).toHaveBeenCalledWith(405);
      }
      expect(
        aiClientFactory.buildOpenAiCompatibleClient
      ).not.toHaveBeenCalled();
      expect(CopilotRuntime).not.toHaveBeenCalled();
    }
  );

  describe('chatAgent (/copilot/chat)', () => {
    it('deve responder 412 (sem pendurar) quando a credencial nao esta configurada', async () => {
      aiClientFactory.buildOpenAiCompatibleClient.mockRejectedValue(
        new HttpException(
          'Configure suas chaves em Configuracoes > Modelos de IA.',
          412
        )
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
    const prepareAgent = () => {
      const context = new Map<string, unknown>();
      const mastra = { getAgent: jest.fn() };
      const agents = { postiz: { id: 'local-agent' } };
      const handler = jest.fn().mockResolvedValue('node-response');
      (RequestContext as unknown as jest.Mock).mockImplementation(
        () => context
      );
      (MastraAgent.getLocalAgents as jest.Mock).mockReturnValue(agents);
      (copilotRuntimeNodeHttpEndpoint as jest.Mock).mockReturnValue(handler);
      // O contrato antigo tambem responde para que a regressao falhe pelas
      // assercoes de transporte/contexto, nao por um mock incompleto.
      (copilotRuntimeNextJSAppRouterEndpoint as jest.Mock).mockReturnValue({
        handleRequest: jest.fn().mockResolvedValue('node-response'),
      });
      aiClientFactory.buildOpenAiCompatibleClient.mockResolvedValue({
        client: {} as any,
        model: 'modelo-configurado-no-perfil',
        languageModel: {
          specificationVersion: 'v2',
          modelId: 'profile-chat-model',
        },
      } as any);
      mastraService.mastra.mockResolvedValue(mastra as any);
      return { context, mastra, agents, handler };
    };

    it('usa o transporte Node e encaminha os mesmos request e response', async () => {
      const { handler, agents } = prepareAgent();
      const req: any = { body: { forwardedProps: { integrations: [] } } };
      const res = mockRes();

      await expect(controller.agent(req, res, org, null)).resolves.toBe(
        'node-response'
      );

      expect(CopilotRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          agents,
          runner: expect.objectContaining({
            run: expect.any(Function),
            connect: expect.any(Function),
          }),
        })
      );
      expect(copilotRuntimeNodeHttpEndpoint).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/copilot/agent' })
      );
      expect(handler).toHaveBeenCalledWith(req, res);
      expect(copilotRuntimeNextJSAppRouterEndpoint).not.toHaveBeenCalled();
      const adapter = (OpenAIAdapter as jest.Mock).mock.instances.at(-1);
      expect(adapter.getLanguageModel()).toEqual({
        specificationVersion: 'v2',
        modelId: 'profile-chat-model',
      });
    });

    it('prioriza canais do forwardedProps e preserva identidade e persona do perfil', async () => {
      const { context, mastra } = prepareAgent();
      const integrations = [
        { id: 'channel-profile-1', name: 'Canal do perfil' },
      ];
      const persona = { tone: 'Amigavel', targetAudience: 'Comunidade' };
      const profile = { id: 'prof-1' } as Profile;
      profileService.getPersonaForAgent.mockResolvedValue(persona as any);
      const req: any = {
        body: {
          forwardedProps: { integrations },
          variables: {
            properties: { integrations: [{ id: 'legacy-channel' }] },
          },
        },
      };

      await controller.agent(req, mockRes(), org, profile);

      expect(context.get('integrations')).toEqual(integrations);
      expect(context.get('organization')).toBe(JSON.stringify(org));
      expect(context.get('profileId')).toBe('prof-1');
      expect(context.get('persona')).toBe(JSON.stringify(persona));
      expect(context.get('ui')).toBe('true');
      expect(profileService.getPersonaForAgent).toHaveBeenCalledWith('prof-1');
      expect(aiClientFactory.buildOpenAiCompatibleClient).toHaveBeenCalledWith(
        'org-1',
        'prof-1'
      );
      expect(MastraAgent.getLocalAgents).toHaveBeenCalledWith({
        resourceId: 'org-1:prof-1',
        mastra,
        requestContext: context,
      });
    });

    it('preserva canais no envelope single-route do CopilotKit novo', async () => {
      const { context } = prepareAgent();
      const integrations = [{ id: 'new-channel' }];
      const req: any = {
        body: {
          method: 'agent/run',
          body: { forwardedProps: { integrations } },
        },
      };
      await controller.agent(req, mockRes(), org, null);
      expect(context.get('integrations')).toEqual(integrations);
    });

    it('mantem o contexto de canais do cliente legado sem forwardedProps', async () => {
      const { context, handler } = prepareAgent();
      const integrations = [{ id: 'legacy-channel' }];
      const req: any = {
        body: { variables: { properties: { integrations } } },
      };
      const res = mockRes();

      await controller.agent(req, res, org, null);

      expect(context.get('integrations')).toEqual(integrations);
      expect(context.get('profileId')).toBeUndefined();
      expect(profileService.getPersonaForAgent).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(req, res);
    });

    it('nao recupera selecao antiga quando forwardedProps traz lista vazia', async () => {
      const { context } = prepareAgent();
      const req: any = {
        body: {
          forwardedProps: { integrations: [] },
          variables: { properties: { integrations: [{ id: 'old-channel' }] } },
        },
      };

      await controller.agent(req, mockRes(), org, null);

      expect(context.get('integrations')).toEqual([]);
    });

    it('deve responder 412 e NAO montar o runtime Mastra quando a credencial falha', async () => {
      aiClientFactory.buildOpenAiCompatibleClient.mockRejectedValue(
        new HttpException(
          'Configure suas chaves em Configuracoes > Modelos de IA.',
          412
        )
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
      expect(copilotRuntimeNodeHttpEndpoint).not.toHaveBeenCalled();
      expect(MastraAgent.getLocalAgents).not.toHaveBeenCalled();
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

  describe('memoria do copilot por perfil', () => {
    const memoryWith = (threads: Record<string, any>) => {
      const memory = {
        getThreadById: jest.fn(async ({ threadId }: any) => threads[threadId] ?? null),
        recall: jest.fn().mockResolvedValue({ messages: [{ role: 'user', content: 'oi' }] }),
        listThreads: jest.fn(async ({ filter }: any) => ({
          threads: Object.values(threads).filter((t: any) => t.resourceId === filter.resourceId),
        })),
      };
      mastraService.mastra.mockResolvedValue({
        getAgent: jest.fn().mockReturnValue({ getMemory: jest.fn().mockResolvedValue(memory) }),
      } as any);
      return memory;
    };
    const userOrg = { id: 'org-1', users: [{ role: 'USER' }] } as any;
    const adminOrg = { id: 'org-1', users: [{ role: 'ADMIN' }] } as any;
    const threads = {
      'th-A': { id: 'th-A', title: 'A', resourceId: 'org-1:prof-A', createdAt: '2026-01-02' },
      'th-B': { id: 'th-B', title: 'B', resourceId: 'org-1:prof-B', createdAt: '2026-01-03' },
      'th-old': { id: 'th-old', title: 'antiga', resourceId: 'org-1', createdAt: '2026-01-01' },
    };

    it('membro so lista as conversas do proprio perfil', async () => {
      memoryWith(threads);
      const result = await controller.getList(userOrg, { id: 'prof-A' } as Profile);
      expect(result.threads.map((t) => t.id)).toEqual(['th-A']);
    });

    it('admin lista as do perfil ativo e as antigas da org', async () => {
      memoryWith(threads);
      const result = await controller.getList(adminOrg, { id: 'prof-A' } as Profile);
      expect(result.threads.map((t) => t.id)).toEqual(['th-A', 'th-old']);
    });

    it('membro nao le mensagens de conversa de outro perfil', async () => {
      const memory = memoryWith(threads);
      const result = await controller.getMessagesList(userOrg, { id: 'prof-A' } as Profile, 'th-B');
      expect(result).toEqual({ uiMessages: [] });
      expect(memory.recall).not.toHaveBeenCalled();
    });

    it('membro le mensagens da propria conversa', async () => {
      const memory = memoryWith(threads);
      const result = await controller.getMessagesList(userOrg, { id: 'prof-A' } as Profile, 'th-A');
      expect(memory.recall).toHaveBeenCalledWith({ resourceId: 'org-1:prof-A', threadId: 'th-A' });
      expect(result.uiMessages).toHaveLength(1);
    });
  });
});
