jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: jest.fn(),
}));

import { FlowsService } from '../flows.service';
import { FlowsRepository } from '../flows.repository';
import {
  FlowStatus,
  FlowNodeType,
  FlowExecutionStatus,
  PendingPostbackStatus,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

const mockRepository = {
  getFlows: jest.fn(),
  getFlow: jest.fn(),
  getFlowById: jest.fn(),
  createFlow: jest.fn(),
  updateFlow: jest.fn(),
  deleteFlow: jest.fn(),
  saveCanvas: jest.fn(),
  updateFlowStatus: jest.fn(),
  getExecutions: jest.fn(),
  createExecution: jest.fn(),
  updateExecution: jest.fn(),
  findExistingExecution: jest.fn(),
  getActiveFlowsForIntegration: jest.fn(),
  findPendingNextPublicationFlows: jest.fn(),
  bindFlowTriggerToMedia: jest.fn(),
  createPendingPostback: jest.fn(),
  findPostbackByPayload: jest.fn(),
  findPostbackById: jest.fn(),
  consumePostback: jest.fn(),
  abandonPostback: jest.fn(),
  incrementPostbackAttempt: jest.fn(),
  markMetaMidIfUnconsumed: jest.fn(),
  expirePendingPostbacks: jest.fn(),
  // alias + inbox
  findAliasesByIntegrationAndMedia: jest.fn().mockResolvedValue([]),
  findFlowsByAlias: jest.fn().mockResolvedValue([]),
  createAlias: jest.fn(),
  deleteAliasForOrg: jest.fn(),
  listAliasesByFlow: jest.fn(),
  findIgnoredMedia: jest.fn().mockResolvedValue(null),
  upsertIgnoredMedia: jest.fn(),
  upsertUnmatchedComment: jest.fn().mockResolvedValue({ id: 'uc-1' }),
  findUnmatchedById: jest.fn(),
  findUnmatchedByIdInternal: jest.fn(),
  listUnmatchedByIntegration: jest.fn(),
  updateUnmatchedMetadata: jest.fn(),
  markUnmatchedBound: jest.fn(),
  markUnmatchedIgnored: jest.fn(),
  deleteUnmatchedOlderThan: jest.fn(),
} as any;

const mockWorkflowStart = jest.fn().mockResolvedValue({ workflowId: 'wf-1' });
const mockRawClient = {
  workflow: {
    start: mockWorkflowStart,
  },
};
const mockTemporalService = {
  client: {
    getRawClient: jest.fn().mockReturnValue(mockRawClient),
  },
  terminateWorkflow: jest.fn(),
} as any;

const mockEnsureWebhookSubscription = jest.fn().mockResolvedValue(true);
const mockIntegrationService = {
  getIntegrationById: jest.fn().mockResolvedValue({
    id: 'int-1',
    token: 'page-token',
    internalId: '123456',
    providerIdentifier: 'instagram',
    organizationId: 'org-1',
    profileId: null,
  }),
  getIntegrationsByInternalId: jest.fn(),
} as any;

const mockIntegrationManager = {
  getSocialIntegration: jest.fn().mockReturnValue({
    ensureWebhookSubscription: mockEnsureWebhookSubscription,
  }),
} as any;

const mockCredentialService = {
  getRaw: jest.fn().mockResolvedValue(null),
} as any;

const mockInstagramMessaging = {
  resolveIgUserToken: jest.fn().mockResolvedValue(null),
} as any;

const makeFlow = (overrides?: Record<string, any>): any => ({
  id: 'flow-1',
  organizationId: 'org-1',
  integrationId: 'int-1',
  name: 'Test Flow',
  status: FlowStatus.DRAFT,
  triggerPostIds: null as any,
  deletedAt: null as any,
  nodes: [] as any[],
  edges: [] as any[],
  ...overrides,
});

describe('FlowsService', () => {
  let service: FlowsService;

  beforeEach(() => {
    jest.resetAllMocks();
    // Re-setup mocks after resetAllMocks
    mockWorkflowStart.mockResolvedValue({ workflowId: 'wf-1' });
    mockTemporalService.client.getRawClient.mockReturnValue(mockRawClient);
    mockEnsureWebhookSubscription.mockResolvedValue(true);
    mockIntegrationService.getIntegrationById.mockResolvedValue({
      id: 'int-1',
      token: 'page-token',
      internalId: '123456',
      providerIdentifier: 'instagram',
      organizationId: 'org-1',
      profileId: null,
    });
    mockIntegrationManager.getSocialIntegration.mockReturnValue({
      ensureWebhookSubscription: mockEnsureWebhookSubscription,
    });
    mockCredentialService.getRaw.mockResolvedValue(null);
    mockInstagramMessaging.resolveIgUserToken.mockResolvedValue(null);
    // Defaults para alias/inbox (alguns specs sobrescrevem)
    mockRepository.findAliasesByIntegrationAndMedia.mockResolvedValue([]);
    mockRepository.findIgnoredMedia.mockResolvedValue(null);
    mockRepository.upsertUnmatchedComment.mockResolvedValue({ id: 'uc-1' });
    service = new FlowsService(
      mockRepository,
      mockTemporalService,
      mockIntegrationService,
      mockIntegrationManager,
      mockCredentialService,
      mockInstagramMessaging
    );
  });

  // --- Issue 1: roteamento de host/token via resolveIgRoute ---

  describe('getInstagramPostsByIntegration (host routing)', () => {
    const setProviderMedia = () => {
      const getRecentMedia = jest
        .fn()
        .mockResolvedValue({ posts: [], nextCursor: null });
      mockIntegrationManager.getSocialIntegration.mockReturnValue({
        getRecentMedia,
      });
      return getRecentMedia;
    };

    const igIntegration: any = {
      id: 'int-1',
      token: 'page-token',
      internalId: 'ig-123',
      providerIdentifier: 'instagram',
      organizationId: 'org-1',
      profileId: null,
    };

    it('usa graph.facebook.com + page token quando nao ha IG User Token', async () => {
      mockIntegrationService.getIntegrationById.mockResolvedValue(igIntegration);
      mockInstagramMessaging.resolveIgUserToken.mockResolvedValue(null);
      const getRecentMedia = setProviderMedia();

      await service.getInstagramPostsByIntegration('org-1', 'int-1');

      expect(getRecentMedia).toHaveBeenCalledWith(
        'ig-123',
        'page-token',
        'graph.facebook.com',
        25,
        undefined
      );
    });

    it('usa graph.instagram.com + IG User Token quando registrado', async () => {
      mockIntegrationService.getIntegrationById.mockResolvedValue(igIntegration);
      mockInstagramMessaging.resolveIgUserToken.mockResolvedValue('ig-user-token');
      const getRecentMedia = setProviderMedia();

      await service.getInstagramPostsByIntegration('org-1', 'int-1');

      expect(getRecentMedia).toHaveBeenCalledWith(
        'ig-123',
        'ig-user-token',
        'graph.instagram.com',
        25,
        undefined
      );
    });
  });

  describe('getInstagramStoriesByIntegration (host routing)', () => {
    it('roteia host/token via resolveIgRoute (IG User Token -> graph.instagram.com)', async () => {
      mockIntegrationService.getIntegrationById.mockResolvedValue({
        id: 'int-1',
        token: 'page-token',
        internalId: 'ig-123',
        providerIdentifier: 'instagram',
        organizationId: 'org-1',
        profileId: null,
      });
      mockInstagramMessaging.resolveIgUserToken.mockResolvedValue('ig-user-token');
      const getRecentStories = jest.fn().mockResolvedValue({ stories: [] });
      mockIntegrationManager.getSocialIntegration.mockReturnValue({
        getRecentStories,
      });

      await service.getInstagramStoriesByIntegration('org-1', 'int-1');

      expect(getRecentStories).toHaveBeenCalledWith(
        'ig-123',
        'ig-user-token',
        'graph.instagram.com'
      );
    });
  });

  // --- Issue 3: segredo de postback nao-publico ---

  describe('getPostbackSecret', () => {
    it('usa ENCRYPTION_KEY quando nao ha segredos dedicados (sem literal publico)', () => {
      const prev = {
        p: process.env.POSTBACK_SIGNING_SECRET,
        f: process.env.FACEBOOK_APP_SECRET,
        i: process.env.INSTAGRAM_APP_SECRET,
        e: process.env.ENCRYPTION_KEY,
      };
      delete process.env.POSTBACK_SIGNING_SECRET;
      delete process.env.FACEBOOK_APP_SECRET;
      delete process.env.INSTAGRAM_APP_SECRET;
      process.env.ENCRYPTION_KEY = 'enc-key-xyz';
      try {
        expect((service as any).getPostbackSecret()).toBe('enc-key-xyz');
        expect((service as any).getPostbackSecret()).not.toBe(
          'dev-only-fallback-postback-secret'
        );
      } finally {
        if (prev.p) process.env.POSTBACK_SIGNING_SECRET = prev.p;
        if (prev.f) process.env.FACEBOOK_APP_SECRET = prev.f;
        if (prev.i) process.env.INSTAGRAM_APP_SECRET = prev.i;
        if (prev.e !== undefined) process.env.ENCRYPTION_KEY = prev.e;
        else delete process.env.ENCRYPTION_KEY;
      }
    });
  });

  // --- CRUD delegation ---

  describe('getFlows', () => {
    it('should delegate to repository', async () => {
      mockRepository.getFlows.mockResolvedValue([]);
      await service.getFlows('org-1', 'profile-1');
      expect(mockRepository.getFlows).toHaveBeenCalledWith('org-1', 'profile-1');
    });
  });

  describe('createFlow', () => {
    it('should delegate to repository when webhook check passes', async () => {
      const body = { name: 'New Flow', integrationId: 'int-1' };
      mockRepository.createFlow.mockResolvedValue({ id: 'flow-1' });
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app',
        clientSecret: 'fb-secret',
      });
      const realFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              object: 'instagram',
              callback_url: 'https://x',
              active: true,
              fields: [{ name: 'comments' }, { name: 'messages' }],
            },
          ],
        }),
      }) as any;

      try {
        await service.createFlow('org-1', body, 'profile-1');
        expect(mockRepository.createFlow).toHaveBeenCalledWith('org-1', body, 'profile-1');
      } finally {
        global.fetch = realFetch;
      }
    });
  });

  describe('deleteFlow', () => {
    it('should delegate to repository', async () => {
      mockRepository.deleteFlow.mockResolvedValue({ id: 'flow-1' });
      await service.deleteFlow('org-1', 'flow-1');
      expect(mockRepository.deleteFlow).toHaveBeenCalledWith('org-1', 'flow-1', undefined);
    });
  });

  // --- Activation validation ---

  describe('updateFlowStatus', () => {
    it('should activate flow with trigger and action nodes', async () => {
      const flow = makeFlow({
        nodes: [
          { id: 'n1', type: FlowNodeType.TRIGGER },
          { id: 'n2', type: FlowNodeType.REPLY_COMMENT },
        ],
      });
      mockRepository.getFlow.mockResolvedValue(flow);
      mockRepository.updateFlowStatus.mockResolvedValue({ ...flow, status: FlowStatus.ACTIVE });

      await service.updateFlowStatus('org-1', 'flow-1', FlowStatus.ACTIVE);

      expect(mockRepository.updateFlowStatus).toHaveBeenCalledWith(
        'org-1',
        'flow-1',
        FlowStatus.ACTIVE,
        undefined
      );
    });

    it('should auto-subscribe to webhooks when activating', async () => {
      const flow = makeFlow({
        nodes: [
          { id: 'n1', type: FlowNodeType.TRIGGER },
          { id: 'n2', type: FlowNodeType.REPLY_COMMENT },
        ],
      });
      mockRepository.getFlow.mockResolvedValue(flow);
      mockRepository.updateFlowStatus.mockResolvedValue({ ...flow, status: FlowStatus.ACTIVE });

      await service.updateFlowStatus('org-1', 'flow-1', FlowStatus.ACTIVE);

      expect(mockIntegrationService.getIntegrationById).toHaveBeenCalledWith('org-1', 'int-1');
      expect(mockIntegrationManager.getSocialIntegration).toHaveBeenCalledWith('instagram');
      expect(mockEnsureWebhookSubscription).toHaveBeenCalledWith('page-token', '123456');
    });

    it('should not block activation if webhook subscription fails', async () => {
      const flow = makeFlow({
        nodes: [
          { id: 'n1', type: FlowNodeType.TRIGGER },
          { id: 'n2', type: FlowNodeType.SEND_DM },
        ],
      });
      mockRepository.getFlow.mockResolvedValue(flow);
      mockRepository.updateFlowStatus.mockResolvedValue({ ...flow, status: FlowStatus.ACTIVE });
      mockEnsureWebhookSubscription.mockRejectedValue(new Error('API error'));

      await service.updateFlowStatus('org-1', 'flow-1', FlowStatus.ACTIVE);

      // Should still activate the flow despite webhook failure
      expect(mockRepository.updateFlowStatus).toHaveBeenCalledWith(
        'org-1',
        'flow-1',
        FlowStatus.ACTIVE,
        undefined
      );
    });

    it('should reject activation when flow has no nodes', async () => {
      const flow = makeFlow({ nodes: [] });
      mockRepository.getFlow.mockResolvedValue(flow);

      await expect(
        service.updateFlowStatus('org-1', 'flow-1', FlowStatus.ACTIVE)
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject activation when flow has no trigger', async () => {
      const flow = makeFlow({
        nodes: [{ id: 'n1', type: FlowNodeType.REPLY_COMMENT }],
      });
      mockRepository.getFlow.mockResolvedValue(flow);

      await expect(
        service.updateFlowStatus('org-1', 'flow-1', FlowStatus.ACTIVE)
      ).rejects.toThrow('A automacao precisa ter pelo menos um no de Inicio (Gatilho)');
    });

    it('should reject activation when flow has no action node', async () => {
      const flow = makeFlow({
        nodes: [
          { id: 'n1', type: FlowNodeType.TRIGGER },
          { id: 'n2', type: FlowNodeType.CONDITION },
        ],
      });
      mockRepository.getFlow.mockResolvedValue(flow);

      await expect(
        service.updateFlowStatus('org-1', 'flow-1', FlowStatus.ACTIVE)
      ).rejects.toThrow('A automacao precisa ter pelo menos um no de acao');
    });

    it('should reject activation when flow not found', async () => {
      mockRepository.getFlow.mockResolvedValue(null);

      await expect(
        service.updateFlowStatus('org-1', 'flow-1', FlowStatus.ACTIVE)
      ).rejects.toThrow('Automacao nao encontrada');
    });

    it('should allow PAUSED status without validation', async () => {
      mockRepository.updateFlowStatus.mockResolvedValue({ id: 'flow-1' });

      await service.updateFlowStatus('org-1', 'flow-1', FlowStatus.PAUSED);

      expect(mockRepository.getFlow).not.toHaveBeenCalled();
      expect(mockRepository.updateFlowStatus).toHaveBeenCalledWith(
        'org-1',
        'flow-1',
        FlowStatus.PAUSED,
        undefined
      );
    });

    it('should accept SEND_DM as action node for activation', async () => {
      const flow = makeFlow({
        nodes: [
          { id: 'n1', type: FlowNodeType.TRIGGER },
          { id: 'n2', type: FlowNodeType.SEND_DM },
        ],
      });
      mockRepository.getFlow.mockResolvedValue(flow);
      mockRepository.updateFlowStatus.mockResolvedValue({ ...flow, status: FlowStatus.ACTIVE });

      await service.updateFlowStatus('org-1', 'flow-1', FlowStatus.ACTIVE);

      expect(mockRepository.updateFlowStatus).toHaveBeenCalled();
    });
  });

  // --- handleIncomingComment ---

  describe('handleIncomingComment', () => {
    const commentPayload = {
      integrationId: 'int-1',
      igCommentId: 'comment-1',
      igCommenterId: 'user-1',
      igCommenterName: 'john',
      igMediaId: 'media-1',
      commentText: 'Hello!',
      organizationId: 'org-1',
    };

    it('should find matching active flows and start Temporal workflow', async () => {
      const flow = makeFlow({
        nodes: [{ id: 'n1', type: FlowNodeType.TRIGGER }],
        triggerPostIds: null,
      });
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([flow]);
      mockRepository.findExistingExecution.mockResolvedValue(null);
      mockRepository.createExecution.mockResolvedValue({ id: 'exec-1' });

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.getActiveFlowsForIntegration).toHaveBeenCalledWith(
        'int-1',
        'media-1'
      );
      expect(mockRepository.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-1',
          igCommentId: 'comment-1',
        })
      );
      expect(mockWorkflowStart).toHaveBeenCalledWith(
        'flowExecutionWorkflow',
        expect.objectContaining({
          workflowId: 'flow-exec-flow-1-comment-1',
          taskQueue: 'main',
        })
      );
      expect(results).toHaveLength(1);
    });

    it('should skip duplicate executions (idempotency)', async () => {
      const flow = makeFlow();
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([flow]);
      mockRepository.findExistingExecution.mockResolvedValue({ id: 'existing-exec' });

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.createExecution).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });

    it('should filter flows by triggerPostIds', async () => {
      const flowMatching = makeFlow({
        id: 'flow-match',
        triggerPostIds: JSON.stringify(['media-1', 'media-2']),
      });
      const flowNotMatching = makeFlow({
        id: 'flow-no-match',
        triggerPostIds: JSON.stringify(['media-99']),
      });
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([
        flowMatching,
        flowNotMatching,
      ]);
      mockRepository.findExistingExecution.mockResolvedValue(null);
      mockRepository.createExecution.mockResolvedValue({ id: 'exec-1' });

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.createExecution).toHaveBeenCalledTimes(1);
      expect(mockRepository.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ flowId: 'flow-match' })
      );
      expect(results).toHaveLength(1);
    });

    it('should mark execution as FAILED when Temporal start fails', async () => {
      const flow = makeFlow();
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([flow]);
      mockRepository.findExistingExecution.mockResolvedValue(null);
      mockRepository.createExecution.mockResolvedValue({ id: 'exec-1' });
      mockWorkflowStart.mockRejectedValue(new Error('Temporal unavailable'));

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.updateExecution).toHaveBeenCalledWith('exec-1', {
        status: FlowExecutionStatus.FAILED,
        error: 'Temporal unavailable',
        completedAt: expect.any(Date),
      });
      expect(results).toHaveLength(1);
    });

    it('lazy binds pending next_publication flows before matching', async () => {
      const pendingFlow = makeFlow({
        id: 'flow-pending',
        triggerPostIds: null,
        nodes: [
          {
            id: 'trig-1',
            type: FlowNodeType.TRIGGER,
            data: JSON.stringify({ mode: 'next_publication' }),
          },
        ],
      });
      const boundFlow = {
        ...pendingFlow,
        triggerPostIds: JSON.stringify(['media-1']),
        nodes: [
          {
            id: 'trig-1',
            type: FlowNodeType.TRIGGER,
            data: JSON.stringify({ mode: 'specific', postIds: ['media-1'] }),
          },
        ],
      };

      mockRepository.getActiveFlowsForIntegration
        .mockResolvedValueOnce([pendingFlow])
        .mockResolvedValueOnce([boundFlow]);
      mockRepository.findPendingNextPublicationFlows.mockResolvedValue([pendingFlow]);
      mockRepository.bindFlowTriggerToMedia.mockResolvedValue(true);
      mockRepository.findExistingExecution.mockResolvedValue(null);
      mockRepository.createExecution.mockResolvedValue({ id: 'exec-1' });

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.findPendingNextPublicationFlows).toHaveBeenCalledWith('int-1');
      expect(mockRepository.bindFlowTriggerToMedia).toHaveBeenCalledWith(
        'flow-pending',
        'trig-1',
        expect.objectContaining({ mode: 'specific', postIds: ['media-1'] }),
        'media-1'
      );
      expect(mockRepository.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ flowId: 'flow-pending' })
      );
      expect(results).toHaveLength(1);
    });

    it('does not fire a still-pending next_publication flow if bind failed', async () => {
      const pendingFlow = makeFlow({
        id: 'flow-pending',
        triggerPostIds: null,
        nodes: [
          {
            id: 'trig-1',
            type: FlowNodeType.TRIGGER,
            data: JSON.stringify({ mode: 'next_publication' }),
          },
        ],
      });
      // Both calls return the pending flow — bind didn't take.
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([pendingFlow]);
      mockRepository.findPendingNextPublicationFlows.mockResolvedValue([pendingFlow]);
      mockRepository.bindFlowTriggerToMedia.mockResolvedValue(false);
      mockRepository.findExistingExecution.mockResolvedValue(null);

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.createExecution).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });

    it('marks execution as FAILED when Temporal client is null (orchestrator offline)', async () => {
      const flow = makeFlow();
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([flow]);
      mockRepository.findExistingExecution.mockResolvedValue(null);
      mockRepository.createExecution.mockResolvedValue({ id: 'exec-offline' });
      mockTemporalService.client.getRawClient.mockReturnValue(null);

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.updateExecution).toHaveBeenCalledWith('exec-offline', {
        status: FlowExecutionStatus.FAILED,
        error: 'Temporal client unavailable (orchestrator offline)',
        completedAt: expect.any(Date),
      });
      expect(mockWorkflowStart).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });
  });

  // --- handleIncomingStoryReply ---

  describe('handleIncomingStoryReply', () => {
    const storyPayload = {
      integrationId: 'int-1',
      organizationId: 'org-1',
      igMessageId: 'msg-1',
      igSenderId: 'user-1',
      igSenderName: 'jane',
      igStoryId: 'story-1',
      messageText: 'reply text',
    };

    it('marks execution as FAILED when Temporal client is null (orchestrator offline)', async () => {
      const storyFlow = makeFlow({
        nodes: [
          {
            id: 'trig-1',
            type: FlowNodeType.TRIGGER,
            label: 'story_reply',
            data: JSON.stringify({ triggerType: 'story_reply' }),
          },
        ],
      });
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([storyFlow]);
      mockRepository.findExistingExecutionByMessage = jest.fn().mockResolvedValue(null);
      mockRepository.createExecution.mockResolvedValue({ id: 'exec-story-offline' });
      mockTemporalService.client.getRawClient.mockReturnValue(null);

      const results = await service.handleIncomingStoryReply(storyPayload);

      expect(mockRepository.updateExecution).toHaveBeenCalledWith('exec-story-offline', {
        status: FlowExecutionStatus.FAILED,
        error: 'Temporal client unavailable (orchestrator offline)',
        completedAt: expect.any(Date),
      });
      expect(mockWorkflowStart).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });
  });

  // --- bindPendingFlowsToPost ---

  describe('bindPendingFlowsToPost', () => {
    it('binds only flows whose trigger mode is next_publication', async () => {
      const pending = makeFlow({
        id: 'flow-p',
        triggerPostIds: null,
        nodes: [
          {
            id: 'trig-p',
            type: FlowNodeType.TRIGGER,
            data: JSON.stringify({ mode: 'next_publication', keywords: ['preço'] }),
          },
        ],
      });
      const allMode = makeFlow({
        id: 'flow-all',
        triggerPostIds: null,
        nodes: [
          {
            id: 'trig-all',
            type: FlowNodeType.TRIGGER,
            data: JSON.stringify({ mode: 'all' }),
          },
        ],
      });
      mockRepository.findPendingNextPublicationFlows.mockResolvedValue([
        pending,
        allMode,
      ]);
      mockRepository.bindFlowTriggerToMedia.mockResolvedValue(true);

      const count = await service.bindPendingFlowsToPost('int-1', 'media-xyz');

      expect(count).toBe(1);
      expect(mockRepository.bindFlowTriggerToMedia).toHaveBeenCalledTimes(1);
      expect(mockRepository.bindFlowTriggerToMedia).toHaveBeenCalledWith(
        'flow-p',
        'trig-p',
        expect.objectContaining({
          mode: 'specific',
          postIds: ['media-xyz'],
          keywords: ['preço'],
        }),
        'media-xyz'
      );
    });

    it('is idempotent when no pending flows remain', async () => {
      mockRepository.findPendingNextPublicationFlows.mockResolvedValue([]);
      const count = await service.bindPendingFlowsToPost('int-1', 'media-xyz');
      expect(count).toBe(0);
      expect(mockRepository.bindFlowTriggerToMedia).not.toHaveBeenCalled();
    });

    it('returns 0 and does not throw on repository errors', async () => {
      mockRepository.findPendingNextPublicationFlows.mockRejectedValue(
        new Error('db down')
      );
      const count = await service.bindPendingFlowsToPost('int-1', 'media-xyz');
      expect(count).toBe(0);
    });

    it('no-ops when integrationId or mediaId is empty', async () => {
      expect(await service.bindPendingFlowsToPost('', 'm')).toBe(0);
      expect(await service.bindPendingFlowsToPost('i', '')).toBe(0);
      expect(mockRepository.findPendingNextPublicationFlows).not.toHaveBeenCalled();
    });
  });

  // --- Follow-gate postback handling ---

  describe('createPendingPostback', () => {
    it('generates a signed payload and persists via repository', async () => {
      process.env.POSTBACK_SIGNING_SECRET = 'unit-test-secret';
      mockRepository.createPendingPostback.mockImplementation(async (data: any) => ({
        id: 'pb-1',
        ...data,
      }));

      const row = await service.createPendingPostback({
        flowId: 'flow-1',
        originExecutionId: 'exec-1',
        integrationId: 'int-1',
        organizationId: 'org-1',
        igSenderId: 'sender-1',
      });

      expect(mockRepository.createPendingPostback).toHaveBeenCalledTimes(1);
      const arg = mockRepository.createPendingPostback.mock.calls[0][0] as any;
      expect(arg.payload).toMatch(/^pb_[A-Za-z0-9_-]{12}_[a-f0-9]{16}$/);
      expect(arg.payloadHmac).toHaveLength(16);
      expect(arg.expiresAt).toBeInstanceOf(Date);
      // expires ~23h in the future (tolerate a couple seconds of drift)
      const deltaMs = arg.expiresAt.getTime() - Date.now();
      expect(deltaMs).toBeGreaterThan(22 * 60 * 60 * 1000);
      expect(deltaMs).toBeLessThanOrEqual(23 * 60 * 60 * 1000 + 5000);
      expect((row as any).payload).toBe(arg.payload);
    });

    it('generated payload passes verifyPostbackPayload (round-trip)', async () => {
      process.env.POSTBACK_SIGNING_SECRET = 'unit-test-secret';
      mockRepository.createPendingPostback.mockImplementation(async (data: any) => ({
        id: 'pb-1',
        ...data,
      }));

      await service.createPendingPostback({
        flowId: 'flow-1',
        originExecutionId: 'exec-1',
        integrationId: 'int-1',
        organizationId: 'org-1',
        igSenderId: 'sender-1',
      });
      const { payload } = mockRepository.createPendingPostback.mock.calls[0][0] as any;

      const handled = await service.handlePostbackClick({
        payload,
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });
      // handlePostbackClick with no matching row logs warn but does not throw
      expect(handled).toBeUndefined();
      expect(mockRepository.findPostbackByPayload).toHaveBeenCalledWith(payload);
    });
  });

  describe('handlePostbackClick', () => {
    beforeEach(() => {
      process.env.POSTBACK_SIGNING_SECRET = 'unit-test-secret';
    });

    const makeValidPayload = () => {
      const crypto = require('crypto');
      const shortId = crypto.randomBytes(9).toString('base64url');
      const hmac = crypto
        .createHmac('sha256', 'unit-test-secret')
        .update(shortId)
        .digest('hex')
        .slice(0, 16);
      return `pb_${shortId}_${hmac}`;
    };

    it('ignores payloads without the pb_ prefix (outside traffic)', async () => {
      await service.handlePostbackClick({
        payload: 'GET_STARTED',
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });
      expect(mockRepository.findPostbackByPayload).not.toHaveBeenCalled();
      expect(mockWorkflowStart).not.toHaveBeenCalled();
    });

    it('ignores payloads with invalid HMAC (spoofing attempt)', async () => {
      await service.handlePostbackClick({
        // formato valido (16 hex) mas HMAC incorreto -> rejeitado pela assinatura
        payload: 'pb_abcdefghijkl_deadbeefdeadbeef',
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });
      expect(mockRepository.findPostbackByPayload).not.toHaveBeenCalled();
      expect(mockWorkflowStart).not.toHaveBeenCalled();
    });

    it('no-ops when the pending row does not exist', async () => {
      const payload = makeValidPayload();
      mockRepository.findPostbackByPayload.mockResolvedValue(null);

      await service.handlePostbackClick({
        payload,
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });

      expect(mockRepository.findPostbackByPayload).toHaveBeenCalledWith(payload);
      expect(mockWorkflowStart).not.toHaveBeenCalled();
    });

    it('no-ops when the pending row is not PENDING', async () => {
      const payload = makeValidPayload();
      mockRepository.findPostbackByPayload.mockResolvedValue({
        id: 'pb-1',
        status: PendingPostbackStatus.CONSUMED,
        expiresAt: new Date(Date.now() + 60_000),
        organizationId: 'org-1',
        originExecutionId: 'exec-1',
      } as any);

      await service.handlePostbackClick({
        payload,
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });

      expect(mockWorkflowStart).not.toHaveBeenCalled();
    });

    it('marks expired rows and skips dispatch when past expiresAt', async () => {
      const payload = makeValidPayload();
      mockRepository.findPostbackByPayload.mockResolvedValue({
        id: 'pb-1',
        status: PendingPostbackStatus.PENDING,
        expiresAt: new Date(Date.now() - 60_000),
        organizationId: 'org-1',
        originExecutionId: 'exec-1',
      } as any);
      mockRepository.expirePendingPostbacks.mockResolvedValue(1);

      await service.handlePostbackClick({
        payload,
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });

      expect(mockRepository.expirePendingPostbacks).toHaveBeenCalledTimes(1);
      expect(mockWorkflowStart).not.toHaveBeenCalled();
    });

    it('dedupes by metaMid: duplicate delivery is a no-op', async () => {
      const payload = makeValidPayload();
      mockRepository.findPostbackByPayload.mockResolvedValue({
        id: 'pb-1',
        status: PendingPostbackStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        organizationId: 'org-1',
        originExecutionId: 'exec-1',
      } as any);
      mockRepository.markMetaMidIfUnconsumed.mockResolvedValue(false);

      await service.handlePostbackClick({
        payload,
        metaMid: 'mid-dup',
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });

      expect(mockRepository.markMetaMidIfUnconsumed).toHaveBeenCalledWith(
        payload,
        'mid-dup'
      );
      expect(mockWorkflowStart).not.toHaveBeenCalled();
    });

    it('dispatches followGateResolveWorkflow on the happy path', async () => {
      const payload = makeValidPayload();
      mockRepository.findPostbackByPayload.mockResolvedValue({
        id: 'pb-1',
        status: PendingPostbackStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        organizationId: 'org-1',
        originExecutionId: 'exec-1',
      } as any);
      mockRepository.markMetaMidIfUnconsumed.mockResolvedValue(true);

      await service.handlePostbackClick({
        payload,
        metaMid: 'mid-first',
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });

      expect(mockWorkflowStart).toHaveBeenCalledWith(
        'followGateResolveWorkflow',
        expect.objectContaining({
          workflowId: 'follow-gate-resolve-pb-1',
          taskQueue: 'main',
          args: [{ pendingPostbackId: 'pb-1' }],
        })
      );
    });

    it('swallows WorkflowAlreadyStarted errors (concurrent retry)', async () => {
      const payload = makeValidPayload();
      mockRepository.findPostbackByPayload.mockResolvedValue({
        id: 'pb-1',
        status: PendingPostbackStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        organizationId: 'org-1',
        originExecutionId: 'exec-1',
      } as any);
      mockRepository.markMetaMidIfUnconsumed.mockResolvedValue(true);
      mockWorkflowStart.mockRejectedValue(
        new Error('WorkflowAlreadyStarted: duplicate')
      );

      await expect(
        service.handlePostbackClick({
          payload,
          metaMid: 'mid-first',
          senderIgsid: 'sender-1',
          igAccountId: 'acct-1',
        })
      ).resolves.toBeUndefined();
    });

    it('logs and exits without dispatching when Temporal client is null (orchestrator offline)', async () => {
      const payload = makeValidPayload();
      mockRepository.findPostbackByPayload.mockResolvedValue({
        id: 'pb-offline',
        status: PendingPostbackStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        organizationId: 'org-1',
        originExecutionId: 'exec-1',
      } as any);
      mockRepository.markMetaMidIfUnconsumed.mockResolvedValue(true);
      mockTemporalService.client.getRawClient.mockReturnValue(null);

      await service.handlePostbackClick({
        payload,
        metaMid: 'mid-offline',
        senderIgsid: 'sender-1',
        igAccountId: 'acct-1',
      });

      expect(mockWorkflowStart).not.toHaveBeenCalled();
    });
  });

  // --- Webhook integration check ---

  describe('checkIntegrationWebhook', () => {
    const ORIGINAL_ENV = process.env;
    const fetchMock = jest.fn();
    const realFetch = global.fetch;

    const igSubscriptionOk = {
      object: 'instagram',
      callback_url: 'https://example.com/cb',
      active: true,
      fields: [{ name: 'comments' }, { name: 'messages' }],
    };

    const respond = (data: any) => ({
      ok: true,
      json: async () => ({ data }),
    });

    const respondError = (error: { message: string }) => ({
      ok: false,
      json: async () => ({ error }),
    });

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
      delete process.env.FACEBOOK_APP_ID;
      delete process.env.FACEBOOK_APP_SECRET;
      delete process.env.INSTAGRAM_APP_ID;
      delete process.env.INSTAGRAM_APP_SECRET;
      fetchMock.mockReset();
      global.fetch = fetchMock as any;
      mockIntegrationService.getIntegrationById.mockResolvedValue({
        id: 'int-1',
        token: 'page-token',
        internalId: '123456',
        providerIdentifier: 'instagram',
        organizationId: 'org-1',
        profileId: null,
      });
    });

    afterEach(() => {
      process.env = ORIGINAL_ENV;
      global.fetch = realFetch;
    });

    it('queries graph.facebook.com when only clientId/clientSecret are configured (Facebook app)', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app-1',
        clientSecret: 'fb-secret-1',
      });
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain('graph.facebook.com/v25.0/fb-app-1/subscriptions');
      expect(url).toContain('access_token=fb-app-1|fb-secret-1');
    });

    it('queries graph.instagram.com when instagramAppId is set (Instagram-only app)', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app-1',
        clientSecret: 'fb-secret-1',
        instagramAppId: 'ig-app-2',
        instagramAppSecret: 'ig-secret-2',
      });
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain('graph.instagram.com/v25.0/ig-app-2/subscriptions');
      expect(url).toContain('access_token=ig-app-2|ig-secret-2');
    });

    it('falls back to graph.facebook.com when graph.instagram.com errors (e.g. wrong field filled)', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        instagramAppId: 'wrong-host-app',
        instagramAppSecret: 'wrong-host-secret',
      });
      // First attempt (graph.instagram.com) errors with the Meta system error.
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            message:
              'Error validating application. Cannot get application info due to a system error.',
          },
        }),
      });
      // Fallback (graph.facebook.com) returns the valid IG subscription.
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((fetchMock.mock.calls[0] as any[])[0]).toContain(
        'graph.instagram.com'
      );
      expect((fetchMock.mock.calls[1] as any[])[0]).toContain(
        'graph.facebook.com'
      );
    });

    it('falls back to the other host when primary returns subs without an instagram one', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-only-page',
        clientSecret: 'fb-secret',
      });
      // graph.facebook.com has only a page subscription (no instagram).
      fetchMock.mockResolvedValueOnce(
        respond([
          {
            object: 'page',
            callback_url: 'https://x',
            active: true,
            fields: [{ name: 'feed' }],
          },
        ])
      );
      // graph.instagram.com has the IG subscription.
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('queries graph.instagram.com when only INSTAGRAM_APP_ID env is set', async () => {
      mockCredentialService.getRaw.mockResolvedValue(null);
      process.env.INSTAGRAM_APP_ID = 'env-ig-app';
      process.env.INSTAGRAM_APP_SECRET = 'env-ig-secret';
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      await service.checkIntegrationWebhook('org-1', 'int-1');

      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain('graph.instagram.com/v25.0/env-ig-app/subscriptions');
      expect(url).toContain('access_token=env-ig-app|env-ig-secret');
    });

    it('queries graph.facebook.com when only FACEBOOK_APP_ID env is set', async () => {
      mockCredentialService.getRaw.mockResolvedValue(null);
      process.env.FACEBOOK_APP_ID = 'env-fb-app';
      process.env.FACEBOOK_APP_SECRET = 'env-fb-secret';
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      await service.checkIntegrationWebhook('org-1', 'int-1');

      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain('graph.facebook.com/v25.0/env-fb-app/subscriptions');
    });

    it('passes integration.profileId to CredentialService.getRaw for per-profile credentials', async () => {
      mockIntegrationService.getIntegrationById.mockResolvedValueOnce({
        id: 'int-1',
        providerIdentifier: 'instagram',
        organizationId: 'org-1',
        profileId: 'profile-42',
      });
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app',
        clientSecret: 'fb-secret',
      });
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(mockCredentialService.getRaw).toHaveBeenCalledWith(
        'org-1',
        'facebook',
        'profile-42'
      );
    });

    it('returns clear error when no Meta credentials exist anywhere (replaces silent ok:true)', async () => {
      mockCredentialService.getRaw.mockResolvedValue(null);

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Credenciais');
      expect(result.error).toContain('Configura');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('lists subscriptions actually present on both hosts when instagram object is missing', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app-x',
        clientSecret: 'fb-secret-x',
      });
      // Primary (graph.facebook.com) has only page subscription.
      fetchMock.mockResolvedValueOnce(
        respond([
          {
            object: 'page',
            callback_url: 'https://x',
            active: true,
            fields: [{ name: 'feed' }, { name: 'messages' }],
          },
        ])
      );
      // Fallback (graph.instagram.com) has nothing.
      fetchMock.mockResolvedValueOnce(respond([]));

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('fb-app-x');
      expect(result.error).toContain('page');
      expect(result.error).toContain('instagram');
      expect(result.error).toContain('graph.facebook.com');
      expect(result.error).toContain('graph.instagram.com');
    });

    it('reports inactive subscription with appId context', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app-y',
        clientSecret: 'fb-secret-y',
      });
      fetchMock.mockResolvedValueOnce(
        respond([
          {
            object: 'instagram',
            callback_url: 'https://example.com/cb',
            active: false,
            fields: [{ name: 'comments' }, { name: 'messages' }],
          },
        ])
      );

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('inativ');
      expect(result.error).toContain('fb-app-y');
    });

    it('reports missing fields (comments/messages) with appId context', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app-z',
        clientSecret: 'fb-secret-z',
      });
      fetchMock.mockResolvedValueOnce(
        respond([
          {
            object: 'instagram',
            callback_url: 'https://x',
            active: true,
            fields: [{ name: 'comments' }],
          },
        ])
      );

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('messages');
      expect(result.error).toContain('fb-app-z');
    });

    it('fails open when both hosts return Meta API errors (cannot verify, do not block)', async () => {
      // Reproduces the Instagram-only app scenario where Meta refuses to
      // validate the app access token on both graph.instagram.com ("Access
      // token does not contain a valid app ID") and graph.facebook.com
      // ("Cannot get application info"). Blocking flow creation here would
      // be a false negative — the webhook may be working fine, the API
      // /{app_id}/subscriptions endpoint just isn't queryable for this app.
      mockCredentialService.getRaw.mockResolvedValue({
        instagramAppId: '2882877478718411',
        instagramAppSecret: 'ig-only-secret',
      });
      fetchMock.mockResolvedValueOnce(
        respondError({
          message: 'Access token does not contain a valid app ID',
        })
      );
      fetchMock.mockResolvedValueOnce(
        respondError({
          message:
            'Error validating application. Cannot get application info due to a system error.',
        })
      );

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(true);
    });

    it('blocks when subscriptions are readable on at least one host but no instagram object exists anywhere', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app-readable',
        clientSecret: 'fb-secret-readable',
      });
      // graph.facebook.com readable: page subscription, no IG.
      fetchMock.mockResolvedValueOnce(
        respond([
          {
            object: 'page',
            callback_url: 'https://x',
            active: true,
            fields: [{ name: 'feed' }],
          },
        ])
      );
      // graph.instagram.com readable but empty.
      fetchMock.mockResolvedValueOnce(respond([]));

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('fb-app-readable');
      expect(result.error).toContain('instagram');
    });

    it('fails open when one host errors and the other returns no IG subscription (inconclusive)', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'fb-app-mixed',
        clientSecret: 'fb-secret-mixed',
      });
      fetchMock.mockResolvedValueOnce(
        respondError({ message: 'Some Meta error' })
      );
      fetchMock.mockResolvedValueOnce(respond([]));

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(true);
    });

    it('returns error when integration is not Instagram', async () => {
      mockIntegrationService.getIntegrationById.mockResolvedValueOnce({
        id: 'int-1',
        providerIdentifier: 'facebook',
        organizationId: 'org-1',
        profileId: null,
      });

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Instagram');
    });

    it('returns error when integration does not exist', async () => {
      mockIntegrationService.getIntegrationById.mockResolvedValueOnce(null);

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('nao encontrada');
    });

    it('does not url-encode the pipe in the app access token (Meta rejects %7C)', async () => {
      mockCredentialService.getRaw.mockResolvedValue({
        clientId: 'pipe-app',
        clientSecret: 'pipe-secret',
      });
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      await service.checkIntegrationWebhook('org-1', 'int-1');

      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain('access_token=pipe-app|pipe-secret');
      expect(url).not.toContain('%7C');
    });

    it('handles Instagram-only app (Instagram API with Instagram Login) on graph.instagram.com', async () => {
      // Reproduces the exact scenario reported by the user: app registered as
      // "API do Instagram com login do Instagram" — querying graph.facebook.com
      // returns "Error validating application. Cannot get application info due
      // to a system error" because that domain doesn't recognize Instagram-only
      // app IDs. The check must hit graph.instagram.com directly.
      mockCredentialService.getRaw.mockResolvedValue({
        instagramAppId: '2882877478718411',
        instagramAppSecret: 'ig-only-secret',
      });
      fetchMock.mockResolvedValueOnce(respond([igSubscriptionOk]));

      const result = await service.checkIntegrationWebhook('org-1', 'int-1');

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain(
        'graph.instagram.com/v25.0/2882877478718411/subscriptions'
      );
    });
  });

  // --- handleIncomingComment: alias + unmatched persistence -----------

  describe('handleIncomingComment alias + UnmatchedComment', () => {
    const commentPayload = {
      integrationId: 'int-1',
      igCommentId: 'comment-99',
      igCommenterId: 'user-77',
      igCommenterName: 'jose',
      igMediaId: 'media-DARK',
      commentText: 'GOSTEI',
      organizationId: 'org-1',
    };

    it('deve disparar flow via alias (sem triggerPostIds match)', async () => {
      const flow = makeFlow({
        id: 'flow-alias',
        triggerPostIds: JSON.stringify(['media-OTHER']),
        nodes: [
          {
            id: 'n-1',
            type: FlowNodeType.TRIGGER,
            label: null,
            data: JSON.stringify({ mode: 'specific' }),
          },
        ],
      });
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([flow]);
      mockRepository.findAliasesByIntegrationAndMedia.mockResolvedValue([
        { id: 'a-1', flowId: 'flow-alias' },
      ]);
      mockRepository.findExistingExecution.mockResolvedValue(null);
      mockRepository.createExecution.mockResolvedValue({ id: 'exec-1' });

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.findAliasesByIntegrationAndMedia).toHaveBeenCalledWith(
        'int-1',
        'media-DARK'
      );
      expect(mockRepository.upsertUnmatchedComment).not.toHaveBeenCalled();
      expect(mockRepository.createExecution).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });

    it('deve persistir UnmatchedComment quando nenhum flow matcha (nem por trigger, nem por alias)', async () => {
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([]);
      mockRepository.findAliasesByIntegrationAndMedia.mockResolvedValue([]);

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.upsertUnmatchedComment).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationId: 'int-1',
          organizationId: 'org-1',
          igMediaId: 'media-DARK',
          igCommentId: 'comment-99',
          commentText: 'GOSTEI',
        })
      );
      expect(mockWorkflowStart).toHaveBeenCalledWith(
        'enrichUnmatchedCommentWorkflow',
        expect.objectContaining({
          workflowId: 'enrich-unmatched-uc-1',
          taskQueue: 'main',
          args: ['uc-1'],
        })
      );
      expect(results).toEqual([]);
    });

    it('NAO deve persistir UnmatchedComment quando media esta em IgnoredMedia', async () => {
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([]);
      mockRepository.findAliasesByIntegrationAndMedia.mockResolvedValue([]);
      mockRepository.findIgnoredMedia.mockResolvedValue({
        id: 'im-1',
        igMediaId: 'media-DARK',
      });

      const results = await service.handleIncomingComment(commentPayload);

      expect(mockRepository.upsertUnmatchedComment).not.toHaveBeenCalled();
      expect(mockWorkflowStart).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it('deve gravar enrichmentError quando orchestrator offline', async () => {
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([]);
      mockRepository.findAliasesByIntegrationAndMedia.mockResolvedValue([]);
      mockTemporalService.client.getRawClient.mockReturnValueOnce(null);

      await service.handleIncomingComment(commentPayload);

      expect(mockRepository.upsertUnmatchedComment).toHaveBeenCalled();
      expect(mockRepository.updateUnmatchedMetadata).toHaveBeenCalledWith(
        'uc-1',
        expect.objectContaining({
          enrichmentError: expect.stringContaining('orchestrator offline'),
        })
      );
    });

    it('webhook duplicado faz upsert idempotente — sem criar 2 unmatched', async () => {
      mockRepository.getActiveFlowsForIntegration.mockResolvedValue([]);
      mockRepository.findAliasesByIntegrationAndMedia.mockResolvedValue([]);

      await service.handleIncomingComment(commentPayload);
      await service.handleIncomingComment(commentPayload);

      expect(mockRepository.upsertUnmatchedComment).toHaveBeenCalledTimes(2);
      // Como eh upsert, a 2a chamada nao explode, e o DB nao duplica
      // (validado pelo repositorio com @@unique(integrationId, igCommentId))
    });
  });

  describe('addManualAlias', () => {
    it('deve criar alias MANUAL', async () => {
      mockRepository.getFlow.mockResolvedValue({
        id: 'f-1',
        integrationId: 'int-1',
      });
      mockRepository.createAlias.mockResolvedValue({ id: 'a-1' });

      const result = await service.addManualAlias('org-1', 'f-1', 'media-X', 'u-1');

      expect(mockRepository.createAlias).toHaveBeenCalledWith({
        flowId: 'f-1',
        integrationId: 'int-1',
        aliasMediaId: 'media-X',
        source: 'MANUAL',
        boundBy: 'u-1',
      });
      expect(result).toEqual({ id: 'a-1' });
    });

    it('deve ser idempotente em P2002', async () => {
      mockRepository.getFlow.mockResolvedValue({
        id: 'f-1',
        integrationId: 'int-1',
      });
      const p2002 = new Error('Unique') as any;
      p2002.code = 'P2002';
      mockRepository.createAlias.mockRejectedValue(p2002);
      mockRepository.findAliasesByIntegrationAndMedia.mockResolvedValue([
        { id: 'a-existing', flowId: 'f-1' },
      ]);

      const result = await service.addManualAlias('org-1', 'f-1', 'media-X');

      expect(result).toEqual({ id: 'a-existing', flowId: 'f-1' });
    });
  });

  describe('removeAlias', () => {
    it('deve retornar deleted=true quando alias existe na org', async () => {
      mockRepository.deleteAliasForOrg = jest.fn().mockResolvedValue(true);

      const result = await service.removeAlias('org-1', 'a-1');

      expect(mockRepository.deleteAliasForOrg).toHaveBeenCalledWith(
        'org-1',
        'a-1'
      );
      expect(result).toEqual({ deleted: true });
    });

    it('deve lancar BadRequest quando alias nao pertence a org', async () => {
      mockRepository.deleteAliasForOrg = jest.fn().mockResolvedValue(false);

      await expect(
        service.removeAlias('org-1', 'a-other-org')
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('lookupAliasFlows', () => {
    it('deve propagar orgId para o repo (org guard)', async () => {
      mockRepository.findFlowsByAlias = jest.fn().mockResolvedValue([
        { id: 'a-1', flowId: 'f-1', flow: { id: 'f-1', name: 'Flow A' } },
      ]);

      const result = await service.lookupAliasFlows(
        'org-1',
        'int-1',
        'media-X'
      );

      expect(mockRepository.findFlowsByAlias).toHaveBeenCalledWith(
        'org-1',
        'int-1',
        'media-X'
      );
      expect(result).toHaveLength(1);
    });
  });
});
