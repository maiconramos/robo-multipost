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
} as unknown as jest.Mocked<FlowsRepository>;

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
  }),
  getIntegrationsByInternalId: jest.fn(),
} as any;

const mockIntegrationManager = {
  getSocialIntegration: jest.fn().mockReturnValue({
    ensureWebhookSubscription: mockEnsureWebhookSubscription,
  }),
} as any;

const makeFlow = (overrides?: Record<string, any>) => ({
  id: 'flow-1',
  organizationId: 'org-1',
  integrationId: 'int-1',
  name: 'Test Flow',
  status: FlowStatus.DRAFT,
  triggerPostIds: null,
  deletedAt: null,
  nodes: [],
  edges: [],
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
    });
    mockIntegrationManager.getSocialIntegration.mockReturnValue({
      ensureWebhookSubscription: mockEnsureWebhookSubscription,
    });
    service = new FlowsService(
      mockRepository,
      mockTemporalService,
      mockIntegrationService,
      mockIntegrationManager
    );
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
    it('should delegate to repository', async () => {
      const body = { name: 'New Flow', integrationId: 'int-1' };
      mockRepository.createFlow.mockResolvedValue({ id: 'flow-1' });

      await service.createFlow('org-1', body, 'profile-1');
      expect(mockRepository.createFlow).toHaveBeenCalledWith('org-1', body, 'profile-1');
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
      expect(arg.payload).toMatch(/^pb_[A-Za-z0-9_-]{12}_[a-f0-9]{8}$/);
      expect(arg.payloadHmac).toHaveLength(8);
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
        .slice(0, 8);
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
        payload: 'pb_abcdefghijkl_deadbeef',
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
  });
});
