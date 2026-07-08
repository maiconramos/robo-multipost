import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import {
  FlowStatus,
  FlowExecutionStatus,
  PendingPostbackStatus,
  AliasSource,
  UnmatchedStatus,
} from '@prisma/client';
import { FlowNodeDto, FlowEdgeDto } from '@gitroom/nestjs-libraries/dtos/flows/flow.dto';

@Injectable()
export class FlowsRepository {
  constructor(
    private _flow: PrismaRepository<'flow'>,
    private _flowNode: PrismaRepository<'flowNode'>,
    private _flowEdge: PrismaRepository<'flowEdge'>,
    private _flowExecution: PrismaRepository<'flowExecution'>,
    private _pendingPostback: PrismaRepository<'pendingPostback'>,
    private _flowMediaAlias: PrismaRepository<'flowMediaAlias'>,
    private _unmatchedComment: PrismaRepository<'unmatchedComment'>,
    private _ignoredMedia: PrismaRepository<'ignoredMedia'>
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
        nodes: {
          where: { type: 'TRIGGER' },
          select: { id: true, type: true, data: true },
          take: 1,
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

  // Contexto mínimo (org/perfil/flow + snapshot do canal) para emitir o
  // StatusEvent AUTOMATION_FAILED. Lido SÓ na transição FAILED (rara) para não
  // onerar o `updateExecution`, chamado a cada nó do fluxo.
  //
  // Sem filtro de organizationId de propósito: `id` é um executionId INTERNO
  // (gerado por createExecution e propagado via Temporal/serviço), nunca vem de
  // um parâmetro de request — não há "org do chamador" a comparar. O evento é
  // gravado na própria org da execução (self-consistente). Se um dia esta rota
  // for exposta a um id vindo do cliente, adicionar `flow: { organizationId }`
  // ao where (ver getExecution logo abaixo, que já é escopado).
  getExecutionEventContext(id: string) {
    return this._flowExecution.model.flowExecution.findUnique({
      where: { id },
      select: {
        id: true,
        flow: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            profileId: true,
            integration: {
              select: {
                id: true,
                providerIdentifier: true,
                name: true,
                picture: true,
              },
            },
          },
        },
      },
    });
  }

  getExecution(id: string, orgId: string) {
    return this._flowExecution.model.flowExecution.findFirst({
      where: { id, flow: { organizationId: orgId } },
    });
  }

  getExecutions(flowId: string, orgId: string, page = 1, limit = 20) {
    return this._flowExecution.model.flowExecution.findMany({
      where: { flowId, flow: { organizationId: orgId } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /**
   * Execucoes de automacao (IG flows) que FALHARAM, CROSS-FLOW por org, para a
   * tela de Status (o `getExecutions` acima e por-flow). `profileId` opcional; o
   * perfil de origem vem via flow.profile. Limite defensivo pelos mais recentes.
   */
  getFailedExecutions(orgId: string, profileId?: string, limit = 50) {
    // Janela de 30 dias (espelha getErrorPosts): FAILED e terminal, entao sem
    // corte a tela de "Problemas" (estado ATUAL) acumularia execucoes antigas
    // indefinidamente.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this._flowExecution.model.flowExecution.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: since },
        flow: {
          organizationId: orgId,
          ...(profileId ? { profileId } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        error: true,
        createdAt: true,
        flow: {
          select: {
            id: true,
            name: true,
            profile: { select: { id: true, name: true } },
          },
        },
      },
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

  // --- Pending Postbacks (botões postback no fluxo de follow gate 2 etapas) ---

  createPendingPostback(data: {
    payload: string;
    payloadHmac: string;
    flowId: string;
    originExecutionId: string;
    integrationId: string;
    organizationId: string;
    igSenderId: string;
    igCommenterName?: string;
    igMediaId?: string;
    igCommentId?: string;
    kind?: string;
    attemptCount?: number;
    maxAttempts?: number;
    snapshotFinalDm?: string;
    snapshotFinalBtnText?: string;
    snapshotFinalBtnUrl?: string;
    snapshotGateDm?: string;
    snapshotAlreadyBtnText?: string;
    snapshotExhaustedMessage?: string;
    openingDmMessage?: string;
    openingDmButtonText?: string;
    expiresAt: Date;
  }) {
    return this._pendingPostback.model.pendingPostback.create({ data });
  }

  findPostbackByPayload(payload: string) {
    return this._pendingPostback.model.pendingPostback.findUnique({
      where: { payload },
    });
  }

  findPostbackById(id: string) {
    return this._pendingPostback.model.pendingPostback.findUnique({
      where: { id },
    });
  }

  /**
   * Marca o `consumedMetaMid` atomicamente. Retorna `true` se era a primeira
   * entrega (e consumiu), `false` se outro processo ja marcou — protege contra
   * re-entrega do webhook pela Meta. Nao altera o `status`: quem chama decide
   * se o postback vai para CONSUMED/ABANDONED/etc.
   */
  async markMetaMidIfUnconsumed(
    payload: string,
    metaMid: string
  ): Promise<boolean> {
    const result = await this._pendingPostback.model.pendingPostback.updateMany(
      {
        where: { payload, consumedMetaMid: null },
        data: { consumedMetaMid: metaMid },
      }
    );
    return result.count > 0;
  }

  consumePostback(id: string) {
    return this._pendingPostback.model.pendingPostback.update({
      where: { id },
      data: {
        status: PendingPostbackStatus.CONSUMED,
        consumedAt: new Date(),
      },
    });
  }

  abandonPostback(id: string) {
    return this._pendingPostback.model.pendingPostback.update({
      where: { id },
      data: {
        status: PendingPostbackStatus.ABANDONED,
        consumedAt: new Date(),
      },
    });
  }

  incrementPostbackAttempt(id: string) {
    return this._pendingPostback.model.pendingPostback.update({
      where: { id },
      data: { attemptCount: { increment: 1 } },
    });
  }

  /**
   * Marca todos os postbacks com `expiresAt < now AND status=PENDING` como
   * EXPIRED. Usado por uma activity periodica do Temporal.
   */
  async expirePendingPostbacks(now: Date = new Date()): Promise<number> {
    const result = await this._pendingPostback.model.pendingPostback.updateMany(
      {
        where: {
          status: PendingPostbackStatus.PENDING,
          expiresAt: { lt: now },
        },
        data: {
          status: PendingPostbackStatus.EXPIRED,
          consumedAt: now,
        },
      }
    );
    return result.count;
  }

  // ─── FlowMediaAlias ──────────────────────────────────────────────────

  findAliasesByIntegrationAndMedia(
    integrationId: string,
    aliasMediaId: string
  ) {
    return this._flowMediaAlias.model.flowMediaAlias.findMany({
      where: { integrationId, aliasMediaId },
      select: { id: true, flowId: true },
    });
  }

  findFlowsByAlias(
    orgId: string,
    integrationId: string,
    aliasMediaId: string
  ) {
    return this._flowMediaAlias.model.flowMediaAlias.findMany({
      where: {
        integrationId,
        aliasMediaId,
        flow: { organizationId: orgId, deletedAt: null },
      },
      select: {
        id: true,
        flowId: true,
        flow: { select: { id: true, name: true } },
      },
    });
  }

  createAlias(data: {
    flowId: string;
    integrationId: string;
    aliasMediaId: string;
    source: AliasSource;
    note?: string;
    boundBy?: string;
  }) {
    return this._flowMediaAlias.model.flowMediaAlias.create({ data });
  }

  async deleteAliasForOrg(orgId: string, aliasId: string) {
    const existing =
      await this._flowMediaAlias.model.flowMediaAlias.findFirst({
        where: { id: aliasId, flow: { organizationId: orgId } },
        select: { id: true },
      });
    if (!existing) return false;
    await this._flowMediaAlias.model.flowMediaAlias.delete({
      where: { id: aliasId },
    });
    return true;
  }

  listAliasesByFlow(orgId: string, flowId: string) {
    return this._flowMediaAlias.model.flowMediaAlias.findMany({
      where: {
        flowId,
        flow: { organizationId: orgId, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── IgnoredMedia ────────────────────────────────────────────────────

  findIgnoredMedia(integrationId: string, igMediaId: string) {
    return this._ignoredMedia.model.ignoredMedia.findUnique({
      where: { integrationId_igMediaId: { integrationId, igMediaId } },
    });
  }

  upsertIgnoredMedia(data: {
    integrationId: string;
    organizationId: string;
    igMediaId: string;
    reason?: string;
    ignoredBy?: string;
  }) {
    return this._ignoredMedia.model.ignoredMedia.upsert({
      where: {
        integrationId_igMediaId: {
          integrationId: data.integrationId,
          igMediaId: data.igMediaId,
        },
      },
      create: data,
      update: { reason: data.reason, ignoredBy: data.ignoredBy },
    });
  }

  // ─── UnmatchedComment ────────────────────────────────────────────────

  upsertUnmatchedComment(data: {
    integrationId: string;
    organizationId: string;
    igMediaId: string;
    igCommentId: string;
    igCommenterId: string;
    igCommenterName?: string;
    commentText: string;
  }) {
    return this._unmatchedComment.model.unmatchedComment.upsert({
      where: {
        integrationId_igCommentId: {
          integrationId: data.integrationId,
          igCommentId: data.igCommentId,
        },
      },
      create: data,
      update: {
        // Atualiza so o texto/nome caso Meta tenha reenviado com versao mais recente
        commentText: data.commentText,
        igCommenterName: data.igCommenterName,
      },
    });
  }

  findUnmatchedById(orgId: string, id: string) {
    return this._unmatchedComment.model.unmatchedComment.findFirst({
      where: { id, organizationId: orgId },
    });
  }

  /**
   * Lookup sem org guard — usado SOMENTE pela activity Temporal que
   * recebe o id de um dispatch interno do proprio backend.
   */
  findUnmatchedByIdInternal(id: string) {
    return this._unmatchedComment.model.unmatchedComment.findUnique({
      where: { id },
    });
  }

  async listUnmatchedByIntegration(
    orgId: string,
    integrationId: string,
    options: { status?: UnmatchedStatus; page?: number; limit?: number }
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = {
      organizationId: orgId,
      integrationId,
      ...(options.status ? { status: options.status } : {}),
    };
    const [items, total] = await Promise.all([
      this._unmatchedComment.model.unmatchedComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this._unmatchedComment.model.unmatchedComment.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  updateUnmatchedMetadata(
    id: string,
    data: {
      permalink?: string | null;
      caption?: string | null;
      thumbnailUrl?: string | null;
      mediaType?: string | null;
      isAd?: boolean | null;
      enrichedAt?: Date | null;
      enrichmentError?: string | null;
    }
  ) {
    return this._unmatchedComment.model.unmatchedComment.update({
      where: { id },
      data,
    });
  }

  markUnmatchedBound(id: string, flowId: string) {
    return this._unmatchedComment.model.unmatchedComment.update({
      where: { id },
      data: {
        status: UnmatchedStatus.BOUND,
        boundFlowId: flowId,
        boundAt: new Date(),
      },
    });
  }

  markUnmatchedIgnored(id: string) {
    return this._unmatchedComment.model.unmatchedComment.update({
      where: { id },
      data: { status: UnmatchedStatus.IGNORED, ignoredAt: new Date() },
    });
  }

  /**
   * Atualiza em massa todos os UnmatchedComment PENDING do mesmo media para
   * BOUND quando o user vincula UM comentario daquele media. Evita itens
   * "orfaos" aparecendo como pendentes depois que ja foi resolvido pra
   * aquela midia. Retorna count para o caller logar.
   */
  async markAllPendingBoundForMedia(
    integrationId: string,
    igMediaId: string,
    flowId: string,
    excludeId?: string
  ) {
    const result = await this._unmatchedComment.model.unmatchedComment.updateMany(
      {
        where: {
          integrationId,
          igMediaId,
          status: UnmatchedStatus.PENDING,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        data: {
          status: UnmatchedStatus.BOUND,
          boundFlowId: flowId,
          boundAt: new Date(),
        },
      }
    );
    return result.count;
  }

  async markAllPendingIgnoredForMedia(
    integrationId: string,
    igMediaId: string,
    excludeId?: string
  ) {
    const result = await this._unmatchedComment.model.unmatchedComment.updateMany(
      {
        where: {
          integrationId,
          igMediaId,
          status: UnmatchedStatus.PENDING,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        data: {
          status: UnmatchedStatus.IGNORED,
          ignoredAt: new Date(),
        },
      }
    );
    return result.count;
  }

  async deleteUnmatchedOlderThan(cutoff: Date) {
    const result = await this._unmatchedComment.model.unmatchedComment.deleteMany(
      {
        where: {
          status: UnmatchedStatus.PENDING,
          createdAt: { lt: cutoff },
        },
      }
    );
    return result.count;
  }
}
