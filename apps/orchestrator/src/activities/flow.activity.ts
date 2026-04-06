import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { FlowExecutionStatus } from '@prisma/client';
import type { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';

@Injectable()
@Activity()
export class FlowActivity {
  constructor(
    private _flowsService: FlowsService,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager
  ) {}

  @ActivityMethod()
  async getFlowWithNodes(flowId: string) {
    return this._flowsService.getFlowById(flowId);
  }

  @ActivityMethod()
  async replyToComment(
    integrationId: string,
    orgId: string,
    commentId: string,
    mediaId: string,
    message: string
  ) {
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const provider = this._integrationManager.getSocialIntegration('instagram') as unknown as InstagramProvider;
    if (!provider) {
      throw new Error('Instagram provider not found');
    }

    // Threaded reply to the specific comment (not a new top-level comment on the media).
    await provider.replyToComment(integration.token, commentId, message);
  }

  @ActivityMethod()
  async sendDirectMessage(
    integrationId: string,
    orgId: string,
    igUserId: string,
    message: string,
    commentId?: string
  ): Promise<{ recipientId: string }> {
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const provider = this._integrationManager.getSocialIntegration('instagram') as unknown as InstagramProvider;
    if (!provider) {
      throw new Error('Instagram provider not found');
    }

    if (commentId) {
      // Private reply: DM triggered by a comment — supported for 7 days.
      // Only ONE private reply per comment is allowed by Meta.
      const result = await provider.sendPrivateReply(
        integration.token,
        integration.internalId,
        commentId,
        message
      );
      return { recipientId: result.recipientId };
    } else {
      // Follow-up DM using the IG-scoped user ID (from a previous private reply).
      const result = await provider.sendDM(integration.token, igUserId, message);
      return { recipientId: result.recipientId };
    }
  }

  @ActivityMethod()
  async evaluateCondition(
    nodeData: string,
    commentText: string
  ): Promise<boolean> {
    try {
      const config = JSON.parse(nodeData);
      const keywords: string[] = config.keywords || [];
      const matchMode: string = config.matchMode || 'any';

      if (keywords.length === 0) return true;

      const lowerComment = commentText.toLowerCase();

      if (matchMode === 'all') {
        return keywords.every((kw) =>
          lowerComment.includes(kw.toLowerCase())
        );
      }

      if (matchMode === 'exact') {
        return keywords.some(
          (kw) => lowerComment === kw.toLowerCase()
        );
      }

      // Default: 'any' — at least one keyword matches
      return keywords.some((kw) =>
        lowerComment.includes(kw.toLowerCase())
      );
    } catch {
      return false;
    }
  }

  @ActivityMethod()
  async updateExecution(
    executionId: string,
    data: {
      status?: FlowExecutionStatus;
      currentNodeId?: string;
      error?: string;
      completedAt?: Date;
    }
  ) {
    return this._flowsService.updateExecution(executionId, data);
  }
}
