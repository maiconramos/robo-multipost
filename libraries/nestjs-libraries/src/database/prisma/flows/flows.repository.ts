import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { FlowStatus, FlowExecutionStatus } from '@prisma/client';
import { FlowNodeDto, FlowEdgeDto } from '@gitroom/nestjs-libraries/dtos/flows/flow.dto';

@Injectable()
export class FlowsRepository {
  constructor(
    private _flow: PrismaRepository<'flow'>,
    private _flowNode: PrismaRepository<'flowNode'>,
    private _flowEdge: PrismaRepository<'flowEdge'>,
    private _flowExecution: PrismaRepository<'flowExecution'>
  ) {}

  getFlows(orgId: string, profileId?: string) {
    return this._flow.model.flow.findMany({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
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
  }

  getFlow(orgId: string, id: string, profileId?: string) {
    return this._flow.model.flow.findFirst({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
      include: {
        integration: {
          select: { id: true, name: true, picture: true, providerIdentifier: true },
        },
        nodes: true,
        edges: true,
      },
    });
  }

  getFlowById(id: string) {
    return this._flow.model.flow.findFirst({
      where: { id, deletedAt: null },
      include: {
        nodes: true,
        edges: true,
      },
    });
  }

  createFlow(
    orgId: string,
    data: {
      name: string;
      description?: string;
      integrationId: string;
      triggerPostIds?: string[];
    },
    profileId?: string
  ) {
    return this._flow.model.flow.create({
      data: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        name: data.name,
        description: data.description,
        integrationId: data.integrationId,
        triggerPostIds: data.triggerPostIds
          ? JSON.stringify(data.triggerPostIds)
          : null,
      },
    });
  }

  updateFlow(
    orgId: string,
    id: string,
    data: {
      name?: string;
      description?: string;
      triggerPostIds?: string[];
    },
    profileId?: string
  ) {
    return this._flow.model.flow.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.triggerPostIds !== undefined
          ? { triggerPostIds: JSON.stringify(data.triggerPostIds) }
          : {}),
      },
    });
  }

  deleteFlow(orgId: string, id: string, profileId?: string) {
    return this._flow.model.flow.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        deletedAt: new Date(),
        status: FlowStatus.ARCHIVED,
      },
    });
  }

  updateFlowStatus(
    orgId: string,
    id: string,
    status: FlowStatus,
    profileId?: string
  ) {
    return this._flow.model.flow.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
      data: { status },
    });
  }

  async saveCanvas(
    orgId: string,
    flowId: string,
    nodes: FlowNodeDto[],
    edges: FlowEdgeDto[],
    profileId?: string
  ) {
    const flow = await this._flow.model.flow.findFirst({
      where: {
        id: flowId,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
    });

    if (!flow) {
      throw new Error('Flow not found');
    }

    // Delete existing nodes and edges, then recreate
    await this._flowEdge.model.flowEdge.deleteMany({
      where: { flowId },
    });
    await this._flowNode.model.flowNode.deleteMany({
      where: { flowId },
    });

    // Create nodes
    const createdNodes = await Promise.all(
      nodes.map((node) =>
        this._flowNode.model.flowNode.create({
          data: {
            flowId,
            type: node.type,
            label: node.label,
            data: node.data || '{}',
            positionX: node.positionX,
            positionY: node.positionY,
          },
        })
      )
    );

    // Build a map from temporary client IDs to real DB IDs
    const idMap = new Map<string, string>();
    nodes.forEach((node, index) => {
      if (node.id) {
        idMap.set(node.id, createdNodes[index].id);
      }
    });

    // Extract postIds from trigger nodes and sync to Flow.triggerPostIds
    const triggerPostIds: string[] = [];
    for (const node of nodes) {
      if (node.type === 'TRIGGER' && node.data) {
        try {
          const parsed = JSON.parse(node.data);
          if (Array.isArray(parsed.postIds)) {
            triggerPostIds.push(...parsed.postIds);
          }
        } catch {
          // ignore
        }
      }
    }
    await this._flow.model.flow.update({
      where: { id: flowId },
      data: {
        triggerPostIds: triggerPostIds.length
          ? JSON.stringify([...new Set(triggerPostIds)])
          : null,
      },
    });

    // Create edges with mapped node IDs
    const createdEdges = await Promise.all(
      edges.map((edge) =>
        this._flowEdge.model.flowEdge.create({
          data: {
            flowId,
            sourceNodeId: idMap.get(edge.sourceNodeId) || edge.sourceNodeId,
            targetNodeId: idMap.get(edge.targetNodeId) || edge.targetNodeId,
            sourceHandle: edge.sourceHandle,
          },
        })
      )
    );

    return { nodes: createdNodes, edges: createdEdges };
  }

  // --- Executions ---

  createExecution(data: {
    flowId: string;
    temporalWorkflowId?: string;
    triggerType?: string;
    igCommentId?: string;
    igCommenterId: string;
    igCommenterName?: string;
    igMediaId: string;
    igThreadId?: string;
    igMessageId?: string;
    commentText: string;
  }) {
    return this._flowExecution.model.flowExecution.create({ data });
  }

  updateExecution(
    id: string,
    data: {
      status?: FlowExecutionStatus;
      currentNodeId?: string;
      error?: string;
      completedAt?: Date;
    }
  ) {
    return this._flowExecution.model.flowExecution.update({
      where: { id },
      data,
    });
  }

  getExecution(id: string) {
    return this._flowExecution.model.flowExecution.findFirst({
      where: { id },
    });
  }

  getExecutions(flowId: string, page = 1, limit = 20) {
    return this._flowExecution.model.flowExecution.findMany({
      where: { flowId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async appendExecutionLog(
    id: string,
    entry: { nodeId: string; nodeType: string; status: string; timestamp: string; error?: string }
  ) {
    const execution = await this._flowExecution.model.flowExecution.findFirst({
      where: { id },
      select: { executionLog: true },
    });
    const log = execution?.executionLog
      ? JSON.parse(execution.executionLog)
      : [];
    log.push(entry);
    return this._flowExecution.model.flowExecution.update({
      where: { id },
      data: { executionLog: JSON.stringify(log) },
    });
  }

  findExistingExecution(flowId: string, igCommentId: string) {
    return this._flowExecution.model.flowExecution.findFirst({
      where: { flowId, igCommentId },
    });
  }

  findExistingExecutionByMessage(flowId: string, igMessageId: string) {
    return this._flowExecution.model.flowExecution.findFirst({
      where: { flowId, igMessageId },
    });
  }

  getActiveFlowsForIntegration(integrationId: string, mediaId?: string) {
    return this._flow.model.flow.findMany({
      where: {
        integrationId,
        status: FlowStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        nodes: true,
        edges: true,
      },
    });
  }

  findPendingNextPublicationFlows(integrationId: string) {
    // Returns active flows for the integration that have not been bound to a
    // specific mediaId yet (triggerPostIds IS NULL). Caller must still filter
    // in-memory by inspecting the TRIGGER node data for `mode === 'next_publication'`
    // — a flow with `mode === 'all'` also has triggerPostIds null and must not
    // be treated as pending.
    return this._flow.model.flow.findMany({
      where: {
        integrationId,
        status: FlowStatus.ACTIVE,
        deletedAt: null,
        triggerPostIds: null,
      },
      include: {
        nodes: true,
      },
    });
  }

  async bindFlowTriggerToMedia(
    flowId: string,
    triggerNodeId: string,
    newNodeData: Record<string, any>,
    mediaId: string
  ): Promise<boolean> {
    // Idempotent bind: the updateMany with `triggerPostIds: null` in WHERE
    // guarantees that only still-pending flows get updated. A concurrent
    // caller that already bound this flow will see 0 rows affected.
    const result = await this._flow.model.flow.updateMany({
      where: {
        id: flowId,
        triggerPostIds: null,
        deletedAt: null,
      },
      data: {
        triggerPostIds: JSON.stringify([mediaId]),
      },
    });

    if (result.count === 0) {
      return false;
    }

    await this._flowNode.model.flowNode.update({
      where: { id: triggerNodeId },
      data: {
        data: JSON.stringify(newNodeData),
      },
    });

    return true;
  }
}
