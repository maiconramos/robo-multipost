import { FlowsRepository } from '../flows.repository';
import { FlowStatus, FlowNodeType, FlowExecutionStatus } from '@prisma/client';

const mockFlowModel = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
};

const mockFlowNodeModel = {
  create: jest.fn(),
  deleteMany: jest.fn(),
};

const mockFlowEdgeModel = {
  create: jest.fn(),
  deleteMany: jest.fn(),
};

const mockFlowExecutionModel = {
  create: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn(),
  findFirst: jest.fn(),
};

const mockFlowPrisma = { model: { flow: mockFlowModel } } as any;
const mockFlowNodePrisma = { model: { flowNode: mockFlowNodeModel } } as any;
const mockFlowEdgePrisma = { model: { flowEdge: mockFlowEdgeModel } } as any;
const mockFlowExecutionPrisma = { model: { flowExecution: mockFlowExecutionModel } } as any;

describe('FlowsRepository', () => {
  let repository: FlowsRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new FlowsRepository(
      mockFlowPrisma,
      mockFlowNodePrisma,
      mockFlowEdgePrisma,
      mockFlowExecutionPrisma
    );
  });

  describe('getFlows', () => {
    it('should list flows for organization', async () => {
      const flows = [{ id: 'flow-1', name: 'Test Flow' }];
      mockFlowModel.findMany.mockResolvedValue(flows);

      const result = await repository.getFlows('org-1');

      expect(mockFlowModel.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
        },
        include: {
          integration: {
            select: { id: true, name: true, picture: true, providerIdentifier: true },
          },
          _count: {
            select: { nodes: true, executions: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(flows);
    });

    it('should filter by profileId when provided', async () => {
      mockFlowModel.findMany.mockResolvedValue([]);

      await repository.getFlows('org-1', 'profile-1');

      expect(mockFlowModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profileId: 'profile-1',
          }),
        })
      );
    });
  });

  describe('createFlow', () => {
    it('should create a flow with valid data', async () => {
      const created = { id: 'flow-1', name: 'My Flow', status: FlowStatus.DRAFT };
      mockFlowModel.create.mockResolvedValue(created);

      const result = await repository.createFlow('org-1', {
        name: 'My Flow',
        description: 'Test description',
        integrationId: 'int-1',
        triggerPostIds: ['post-1', 'post-2'],
      });

      expect(mockFlowModel.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'My Flow',
          description: 'Test description',
          integrationId: 'int-1',
          triggerPostIds: JSON.stringify(['post-1', 'post-2']),
        },
      });
      expect(result).toEqual(created);
    });

    it('should set triggerPostIds to null when not provided', async () => {
      mockFlowModel.create.mockResolvedValue({ id: 'flow-1' });

      await repository.createFlow('org-1', {
        name: 'My Flow',
        integrationId: 'int-1',
      });

      expect(mockFlowModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggerPostIds: null,
        }),
      });
    });

    it('should scope to profile when profileId provided', async () => {
      mockFlowModel.create.mockResolvedValue({ id: 'flow-1' });

      await repository.createFlow(
        'org-1',
        { name: 'Flow', integrationId: 'int-1' },
        'profile-1'
      );

      expect(mockFlowModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId: 'profile-1',
        }),
      });
    });
  });

  describe('deleteFlow', () => {
    it('should soft delete by setting deletedAt and status ARCHIVED', async () => {
      mockFlowModel.update.mockResolvedValue({ id: 'flow-1' });

      await repository.deleteFlow('org-1', 'flow-1');

      expect(mockFlowModel.update).toHaveBeenCalledWith({
        where: {
          id: 'flow-1',
          organizationId: 'org-1',
        },
        data: {
          deletedAt: expect.any(Date),
          status: FlowStatus.ARCHIVED,
        },
      });
    });
  });

  describe('saveCanvas', () => {
    it('should delete existing and recreate nodes and edges', async () => {
      mockFlowModel.findFirst.mockResolvedValue({ id: 'flow-1' });
      mockFlowEdgeModel.deleteMany.mockResolvedValue({ count: 0 });
      mockFlowNodeModel.deleteMany.mockResolvedValue({ count: 0 });
      mockFlowNodeModel.create
        .mockResolvedValueOnce({ id: 'node-db-1', type: FlowNodeType.TRIGGER })
        .mockResolvedValueOnce({ id: 'node-db-2', type: FlowNodeType.REPLY_COMMENT });
      mockFlowEdgeModel.create.mockResolvedValue({ id: 'edge-db-1' });

      const nodes = [
        { id: 'tmp-1', type: FlowNodeType.TRIGGER, positionX: 0, positionY: 0 },
        { id: 'tmp-2', type: FlowNodeType.REPLY_COMMENT, positionX: 200, positionY: 100 },
      ];
      const edges = [
        { sourceNodeId: 'tmp-1', targetNodeId: 'tmp-2' },
      ];

      const result = await repository.saveCanvas('org-1', 'flow-1', nodes, edges);

      expect(mockFlowEdgeModel.deleteMany).toHaveBeenCalledWith({ where: { flowId: 'flow-1' } });
      expect(mockFlowNodeModel.deleteMany).toHaveBeenCalledWith({ where: { flowId: 'flow-1' } });
      expect(mockFlowNodeModel.create).toHaveBeenCalledTimes(2);
      expect(mockFlowEdgeModel.create).toHaveBeenCalledTimes(1);
      // Edge should use mapped IDs
      expect(mockFlowEdgeModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          flowId: 'flow-1',
          sourceNodeId: 'node-db-1',
          targetNodeId: 'node-db-2',
        }),
      });
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
    });

    it('should throw if flow not found', async () => {
      mockFlowModel.findFirst.mockResolvedValue(null);

      await expect(
        repository.saveCanvas('org-1', 'flow-1', [], [])
      ).rejects.toThrow('Flow not found');
    });
  });

  describe('createExecution', () => {
    it('should create a flow execution record', async () => {
      const execution = {
        id: 'exec-1',
        flowId: 'flow-1',
        igCommentId: 'comment-1',
        status: FlowExecutionStatus.RUNNING,
      };
      mockFlowExecutionModel.create.mockResolvedValue(execution);

      const result = await repository.createExecution({
        flowId: 'flow-1',
        igCommentId: 'comment-1',
        igCommenterId: 'user-1',
        igMediaId: 'media-1',
        commentText: 'Hello!',
      });

      expect(mockFlowExecutionModel.create).toHaveBeenCalledWith({
        data: {
          flowId: 'flow-1',
          igCommentId: 'comment-1',
          igCommenterId: 'user-1',
          igMediaId: 'media-1',
          commentText: 'Hello!',
        },
      });
      expect(result).toEqual(execution);
    });
  });

  describe('updateExecution', () => {
    it('should update execution status', async () => {
      mockFlowExecutionModel.update.mockResolvedValue({ id: 'exec-1' });

      await repository.updateExecution('exec-1', {
        status: FlowExecutionStatus.COMPLETED,
        completedAt: new Date(),
      });

      expect(mockFlowExecutionModel.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: FlowExecutionStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('findExistingExecution', () => {
    it('should find execution by flowId and igCommentId', async () => {
      const existing = { id: 'exec-1' };
      mockFlowExecutionModel.findFirst.mockResolvedValue(existing);

      const result = await repository.findExistingExecution('flow-1', 'comment-1');

      expect(mockFlowExecutionModel.findFirst).toHaveBeenCalledWith({
        where: { flowId: 'flow-1', igCommentId: 'comment-1' },
      });
      expect(result).toEqual(existing);
    });

    it('should return null when no existing execution', async () => {
      mockFlowExecutionModel.findFirst.mockResolvedValue(null);

      const result = await repository.findExistingExecution('flow-1', 'comment-new');
      expect(result).toBeNull();
    });
  });

  describe('getActiveFlowsForIntegration', () => {
    it('should return active flows for integration', async () => {
      const flows = [{ id: 'flow-1', status: FlowStatus.ACTIVE }];
      mockFlowModel.findMany.mockResolvedValue(flows);

      const result = await repository.getActiveFlowsForIntegration('int-1');

      expect(mockFlowModel.findMany).toHaveBeenCalledWith({
        where: {
          integrationId: 'int-1',
          status: FlowStatus.ACTIVE,
          deletedAt: null,
        },
        include: {
          nodes: true,
          edges: true,
        },
      });
      expect(result).toEqual(flows);
    });
  });
});
