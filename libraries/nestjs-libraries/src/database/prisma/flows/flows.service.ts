import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { FlowsRepository } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.repository';
import { FlowStatus, FlowNodeType, FlowExecutionStatus } from '@prisma/client';
import {
  CreateFlowDto,
  UpdateFlowDto,
  SaveCanvasDto,
} from '@gitroom/nestjs-libraries/dtos/flows/flow.dto';
import { TemporalService } from 'nestjs-temporal-core';
import {
  organizationId as orgSearchAttr,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { TypedSearchAttributes } from '@temporalio/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import type { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';

@Injectable()
export class FlowsService {
  private readonly _logger = new Logger(FlowsService.name);

  constructor(
    private _flowsRepository: FlowsRepository,
    private _temporalService: TemporalService,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager
  ) {}

  getFlows(orgId: string, profileId?: string) {
    return this._flowsRepository.getFlows(orgId, profileId);
  }

  getFlow(orgId: string, id: string, profileId?: string) {
    return this._flowsRepository.getFlow(orgId, id, profileId);
  }

  getFlowById(id: string) {
    return this._flowsRepository.getFlowById(id);
  }

  async createFlow(orgId: string, body: CreateFlowDto, profileId?: string) {
    const check = await this.checkIntegrationWebhook(orgId, body.integrationId);
    if (!check.ok) {
      throw new BadRequestException(check.error);
    }
    return this._flowsRepository.createFlow(orgId, body, profileId);
  }

  async checkIntegrationWebhook(
    orgId: string,
    integrationId: string
  ): Promise<{ ok: boolean; error?: string; subscribed?: boolean }> {
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration) {
      return { ok: false, error: 'Integracao nao encontrada' };
    }
    if (integration.providerIdentifier !== 'instagram') {
      return {
        ok: false,
        error: 'Apenas contas do Instagram suportam automacoes no momento',
      };
    }

    const provider = this._integrationManager.getSocialIntegration(
      'instagram'
    ) as unknown as InstagramProvider;
    if (!provider) {
      return { ok: false, error: 'Provider Instagram indisponivel' };
    }

    // In Meta's Instagram Use Cases model, the webhook is configured at the
    // APP level (not per-user). We check app-level subscriptions using the
    // app access token (app_id|app_secret) which exposes /{app_id}/subscriptions.
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      // Cannot verify — skip check (assume user knows what they're doing).
      return { ok: true };
    }

    try {
      const subs = await this.fetchAppSubscriptions(appId, appSecret);
      const igSub = subs.find((s) => s.object === 'instagram');
      if (!igSub) {
        return {
          ok: false,
          error:
            'Webhook Instagram nao configurado no app Meta. ' +
            'Abra Meta Developer Portal > seu app > Casos de uso > instagram_manage_comments > Configurar webhooks, ' +
            'cole a Callback URL e o Verify Token mostrados na tela de Automacoes.',
        };
      }
      if (!igSub.active) {
        return {
          ok: false,
          error:
            'Webhook Instagram esta inativo na Meta. Ative-o em Casos de uso > instagram_manage_comments.',
        };
      }
      const fieldNames = (igSub.fields || []).map((f) => f.name);
      const missing: string[] = [];
      if (!fieldNames.includes('comments')) missing.push('comments');
      if (!fieldNames.includes('messages')) missing.push('messages');
      if (missing.length > 0) {
        return {
          ok: false,
          error:
            `Webhook Instagram configurado, mas faltam os campos: ${missing.join(', ')}. ` +
            'Abra Casos de uso > instagram_manage_comments > Configurar webhooks e ative comments e messages ' +
            '(necessarios para responder comentarios e enviar DMs).',
        };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message.trim() : '';
      return {
        ok: false,
        error: msg
          ? `Nao foi possivel verificar o webhook. Detalhe: ${msg}`
          : 'Nao foi possivel verificar o webhook.',
      };
    }
  }

  private async fetchAppSubscriptions(
    appId: string,
    appSecret: string
  ): Promise<
    Array<{
      object: string;
      callback_url: string;
      active: boolean;
      fields: Array<{ name: string; version?: string }>;
    }>
  > {
    const token = `${appId}|${appSecret}`;
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${appId}/subscriptions?access_token=${token}`
    );
    const body = await res.json();
    if (body.error) {
      throw new Error(body.error.message || JSON.stringify(body.error));
    }
    return Array.isArray(body.data) ? body.data : [];
  }

  updateFlow(orgId: string, id: string, body: UpdateFlowDto, profileId?: string) {
    return this._flowsRepository.updateFlow(orgId, id, body, profileId);
  }

  deleteFlow(orgId: string, id: string, profileId?: string) {
    return this._flowsRepository.deleteFlow(orgId, id, profileId);
  }

  saveCanvas(orgId: string, id: string, body: SaveCanvasDto, profileId?: string) {
    return this._flowsRepository.saveCanvas(
      orgId,
      id,
      body.nodes,
      body.edges,
      profileId
    );
  }

  async updateFlowStatus(
    orgId: string,
    id: string,
    status: FlowStatus,
    profileId?: string
  ) {
    if (status === FlowStatus.ACTIVE) {
      const flow = await this._flowsRepository.getFlow(orgId, id, profileId);
      if (!flow) {
        throw new BadRequestException('Automacao nao encontrada');
      }

      const hasTrigger = flow.nodes.some(
        (n) => n.type === FlowNodeType.TRIGGER
      );
      const hasAction = flow.nodes.some(
        (n) =>
          n.type === FlowNodeType.REPLY_COMMENT ||
          n.type === FlowNodeType.SEND_DM
      );

      if (!hasTrigger) {
        throw new BadRequestException(
          'A automacao precisa ter pelo menos um no de Inicio (Gatilho)'
        );
      }
      if (!hasAction) {
        throw new BadRequestException(
          'A automacao precisa ter pelo menos um no de acao (Responder Comentario ou Enviar DM)'
        );
      }

      // Check for DM → DM direct connections (Meta only allows 1 private reply per comment)
      const dmNodeIds = new Set(
        flow.nodes
          .filter((n) => n.type === FlowNodeType.SEND_DM)
          .map((n) => n.id)
      );
      const hasDmToDm = flow.edges.some(
        (e) => dmNodeIds.has(e.sourceNodeId) && dmNodeIds.has(e.targetNodeId)
      );
      if (hasDmToDm) {
        throw new BadRequestException(
          'A Meta permite apenas 1 mensagem direta por comentario. ' +
            'Remova nos de DM consecutivos e use quebras de linha no campo de mensagem.'
        );
      }

      // Auto-subscribe to Instagram webhooks when activating
      await this.ensureWebhookSubscription(orgId, flow.integrationId);
    }

    return this._flowsRepository.updateFlowStatus(orgId, id, status, profileId);
  }

  private async ensureWebhookSubscription(
    orgId: string,
    integrationId: string
  ) {
    try {
      const integration = await this._integrationService.getIntegrationById(
        orgId,
        integrationId
      );
      if (!integration || integration.providerIdentifier !== 'instagram') {
        return;
      }

      const provider = this._integrationManager.getSocialIntegration(
        'instagram'
      ) as unknown as InstagramProvider;
      if (!provider) {
        this._logger.warn('Instagram provider not found, skipping webhook subscription');
        return;
      }

      await provider.ensureWebhookSubscription(
        integration.token,
        integration.internalId
      );

      this._logger.log(
        `Webhook subscription ensured for integration ${integrationId}`
      );
    } catch (err) {
      // Don't block flow activation if webhook subscription fails
      // The webhook may already be configured manually
      this._logger.warn(
        `Webhook subscription failed for integration ${integrationId}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    }
  }

  async getInstagramPosts(orgId: string, flowId: string, profileId?: string) {
    const flow = await this._flowsRepository.getFlow(orgId, flowId, profileId);
    if (!flow) {
      throw new BadRequestException('Automacao nao encontrada');
    }

    const integration = await this._integrationService.getIntegrationById(
      orgId,
      flow.integrationId
    );
    if (!integration || integration.providerIdentifier !== 'instagram') {
      return [];
    }

    const provider = this._integrationManager.getSocialIntegration(
      'instagram'
    ) as unknown as InstagramProvider;
    if (!provider) {
      return [];
    }

    try {
      return await provider.getRecentMedia(
        integration.internalId,
        integration.token
      );
    } catch (err) {
      this._logger.warn(
        `Failed to fetch Instagram posts: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
      return [];
    }
  }

  getExecutions(flowId: string, page?: number, limit?: number) {
    return this._flowsRepository.getExecutions(flowId, page, limit);
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
    return this._flowsRepository.updateExecution(id, data);
  }

  async handleIncomingComment(payload: {
    integrationId: string;
    igCommentId: string;
    igCommenterId: string;
    igCommenterName?: string;
    igMediaId: string;
    commentText: string;
    organizationId: string;
  }) {
    const activeFlows =
      await this._flowsRepository.getActiveFlowsForIntegration(
        payload.integrationId,
        payload.igMediaId
      );

    // Filter flows that monitor this specific media (or all posts)
    const matchingFlows = activeFlows.filter((flow) => {
      if (!flow.triggerPostIds) return true;
      try {
        const postIds: string[] = JSON.parse(flow.triggerPostIds);
        return postIds.length === 0 || postIds.includes(payload.igMediaId);
      } catch {
        return true;
      }
    });

    const results = [];
    for (const flow of matchingFlows) {
      // Idempotency: skip if already executed for this comment+flow
      const existing = await this._flowsRepository.findExistingExecution(
        flow.id,
        payload.igCommentId
      );
      if (existing) continue;

      const workflowId = `flow-exec-${flow.id}-${payload.igCommentId}`;

      const execution = await this._flowsRepository.createExecution({
        flowId: flow.id,
        temporalWorkflowId: workflowId,
        igCommentId: payload.igCommentId,
        igCommenterId: payload.igCommenterId,
        igCommenterName: payload.igCommenterName,
        igMediaId: payload.igMediaId,
        commentText: payload.commentText,
      });

      try {
        await this._temporalService.client
          .getRawClient()
          ?.workflow.start('flowExecutionWorkflow', {
            workflowId,
            taskQueue: 'main',
            args: [
              {
                executionId: execution.id,
                flowId: flow.id,
                igCommentId: payload.igCommentId,
                igCommenterId: payload.igCommenterId,
                igCommenterName: payload.igCommenterName,
                igMediaId: payload.igMediaId,
                commentText: payload.commentText,
                integrationId: payload.integrationId,
              },
            ],
            typedSearchAttributes: new TypedSearchAttributes([
              {
                key: orgSearchAttr,
                value: payload.organizationId,
              },
            ]),
          });
      } catch (err) {
        await this._flowsRepository.updateExecution(execution.id, {
          status: FlowExecutionStatus.FAILED,
          error: err instanceof Error ? err.message : 'Failed to start workflow',
          completedAt: new Date(),
        });
      }

      results.push(execution);
    }

    return results;
  }
}
