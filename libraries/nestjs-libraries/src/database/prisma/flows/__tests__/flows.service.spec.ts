jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: jest.fn(),
}));

import { FlowsService } from '../flows.service';
import { FlowsRepository } from '../flows.repository';
import { FlowStatus, FlowNodeType, FlowExecutionStatus } from '@prisma/client';
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
  });
});
