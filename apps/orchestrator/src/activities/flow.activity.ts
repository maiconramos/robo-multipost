import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';
import { resolveIgRoute } from '@gitroom/nestjs-libraries/integrations/social/instagram-route.resolver';
import { FlowExecutionStatus } from '@prisma/client';
import type { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import type { InstagramDmButton } from '@gitroom/nestjs-libraries/integrations/social/instagram-dm-button.type';

const GATE_FALLBACK_MESSAGE =
  'Olá! Esse conteúdo é exclusivo para seguidores. Me segue aqui e clica no botão abaixo 💙';
const GATE_EXHAUSTED_MESSAGE =
  'Não consegui confirmar que você está seguindo. Tente novamente mais tarde 😉';

@Injectable()
@Activity()
export class FlowActivity {
  private readonly _logger = new Logger(FlowActivity.name);

  constructor(
    private _flowsService: FlowsService,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _instagramMessagingService: InstagramMessagingService
  ) {}

  private resolveIgRoute(integration: {
    token: string;
    providerIdentifier?: string | null;
    organizationId: string;
    profileId?: string | null;
    internalId: string;
  }) {
    return resolveIgRoute(integration, this._instagramMessagingService);
  }

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

    const route = await this.resolveIgRoute(integration);
    this._logger.log(
      `replyToComment: integration=${integrationId} provider=${integration.providerIdentifier} igAccount=${integration.internalId} commentId=${commentId} route.source=${route.source} route.host=${route.host}`
    );
    // Threaded reply to the specific comment (not a new top-level comment on the media).
    try {
      await provider.replyToComment(route.token, commentId, message, route.host);
    } catch (e) {
      // IG User Tokens cadastrados em Settings sao gerados pelo aluno com
      // escopos de messaging em mente (instagram_business_manage_messages)
      // e frequentemente nao incluem instagram_business_manage_comments.
      // O endpoint /{comment-id}/replies devolve code=100 subcode=33
      // quando o token nao tem esse escopo. Quando a integration veio do
      // fluxo Facebook Login, o Page Access Token tem instagram_manage_comments
      // com Standard Access para testers/admins do app — fallback funciona
      // em dev mode sem App Review.
      if (
        route.source === 'ig-user-token' &&
        integration.token &&
        integration.token !== route.token
      ) {
        this._logger.warn(
          `replyToComment: ig-user-token route failed (${(e as Error).message}); falling back to Page Access Token on graph.facebook.com`
        );
        await provider.replyToComment(
          integration.token,
          commentId,
          message,
          'graph.facebook.com'
        );
        return;
      }
      throw e;
    }
  }

  @ActivityMethod()
  async sendDirectMessage(
    integrationId: string,
    orgId: string,
    _igUserId: string,
    message: string,
    commentId: string,
    buttonText?: string,
    buttonUrl?: string
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

    const button =
      buttonText && buttonUrl
        ? ({ kind: 'url', title: buttonText, url: buttonUrl } as const)
        : undefined;

    const { token, host } = await this.resolveIgRoute(integration);
    // Always use private reply (recipient: { comment_id }).
    // This is the ONLY way to DM a commenter without advanced access
    // to instagram_manage_messages. Limited to ONE per comment, so the
    // workflow collects all DM messages and sends them combined here.
    await provider.sendPrivateReply(
      token,
      integration.internalId,
      commentId,
      message,
      button,
      host
    );
  }

  @ActivityMethod()
  async sendStoryDirectMessage(
    integrationId: string,
    orgId: string,
    igScopedUserId: string,
    message: string,
    buttonText?: string,
    buttonUrl?: string
  ) {
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const button =
      buttonText && buttonUrl
        ? ({ kind: 'url', title: buttonText, url: buttonUrl } as const)
        : undefined;

    // Messaging uses a token configured in Settings > Credenciais (Meta
    // System User Token or per-account IG User Token), NOT the integration
    // token used for posting. The service resolves the right token, does
    // lazy refresh, and calls the right Meta endpoint.
    await this._instagramMessagingService.sendStoryReply({
      organizationId: integration.organizationId,
      profileId: integration.profileId || null,
      igBusinessAccountId: integration.internalId,
      recipientIgsid: igScopedUserId,
      message,
      button,
      integrationName: integration.name || undefined,
    });
  }

  @ActivityMethod()
  async checkIgFollowStatus(
    integrationId: string,
    orgId: string,
    igUserId: string,
    source: 'story_reply' | 'comment' = 'story_reply'
  ): Promise<boolean> {
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration) {
      return true;
    }

    // Comment-based flows resolvem token via resolveIgRoute — prefere
    // IG User Token (standalone OAuth ou cadastrado em Settings >
    // Credenciais) sobre Page Access Token, ja que is_user_follow_business
    // so tem Standard Access em graph.instagram.com.
    let follows: boolean | null;
    if (source === 'comment' && integration.token) {
      const route = await this.resolveIgRoute(integration);
      follows = await this._instagramMessagingService.isFollowingByToken(
        route.token,
        igUserId,
        route.useIgGraph
      );
    } else {
      follows = await this._instagramMessagingService.isUserFollowingBusiness({
        organizationId: integration.organizationId,
        profileId: integration.profileId || null,
        igBusinessAccountId: integration.internalId,
        recipientIgsid: igUserId,
        integrationName: integration.name || undefined,
      });
    }

    // Null = Meta did not answer (common for commenters with no prior DM
    // context). Behavior diverges by source:
    //  - comment_on_post: user explicitly opted in to the follow gate, so
    //    err on the side of sending the gate message. Followers might see
    //    it by mistake, but non-followers reliably do. Trade-off accepted.
    //  - story_reply: the messaging token normally has context, so errors
    //    are unusual. Fail-open to avoid blocking legitimate flows.
    if (follows === null) {
      return source !== 'comment';
    }
    return follows;
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

  @ActivityMethod()
  async appendExecutionLog(
    executionId: string,
    entry: { nodeId: string; nodeType: string; status: string; timestamp: string; error?: string }
  ) {
    return this._flowsService.appendExecutionLog(executionId, entry);
  }

  // --- Follow-gate em 2 etapas (postback) ---

  @ActivityMethod()
  async createPendingPostback(input: {
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
  }) {
    return this._flowsService.createPendingPostback(input);
  }

  @ActivityMethod()
  async getPendingPostback(id: string) {
    return this._flowsService.getPendingPostback(id);
  }

  @ActivityMethod()
  async consumePendingPostback(id: string) {
    return this._flowsService.consumePendingPostback(id);
  }

  @ActivityMethod()
  async expirePendingPostbacks() {
    return this._flowsService.expirePendingPostbacks();
  }

  /**
   * Envia a DM inicial ao comentarista com um botao postback. Usa
   * private reply (recipient: { comment_id }) porque o usuario ainda
   * nao abriu janela de messaging conosco. Unica oportunidade de DM
   * para aquele commentId.
   */
  @ActivityMethod()
  async sendOpeningDmWithPostback(pendingPostbackId: string) {
    const pb = await this._flowsService.getPendingPostback(pendingPostbackId);
    if (!pb) throw new Error(`PendingPostback ${pendingPostbackId} not found`);
    if (!pb.igCommentId) {
      throw new Error(
        `PendingPostback ${pendingPostbackId} has no igCommentId — opening DM requires private reply`
      );
    }

    const integration = await this._integrationService.getIntegrationById(
      pb.organizationId,
      pb.integrationId
    );
    if (!integration) {
      throw new Error(`Integration ${pb.integrationId} not found`);
    }

    const provider = this._integrationManager.getSocialIntegration(
      'instagram'
    ) as unknown as InstagramProvider;
    if (!provider) throw new Error('Instagram provider not found');

    const message = pb.openingDmMessage?.trim() || GATE_FALLBACK_MESSAGE;
    const button: InstagramDmButton = {
      kind: 'postback',
      title: pb.openingDmButtonText?.trim() || 'Quero o link',
      payload: pb.payload,
    };

    const { token, host } = await this.resolveIgRoute(integration);
    await provider.sendPrivateReply(
      token,
      integration.internalId,
      pb.igCommentId,
      message,
      button,
      host
    );
  }

  /**
   * Envia a DM final (link prometido) apos confirmacao de follow.
   * Usa o messaging service porque o usuario ja abriu janela de 24h
   * ao clicar no botao postback inicial — DM normal funciona dentro
   * dessa janela. Requer messaging token configurado no workspace.
   */
  @ActivityMethod()
  async sendFinalDm(pendingPostbackId: string) {
    const pb = await this._flowsService.getPendingPostback(pendingPostbackId);
    if (!pb) throw new Error(`PendingPostback ${pendingPostbackId} not found`);

    const integration = await this._integrationService.getIntegrationById(
      pb.organizationId,
      pb.integrationId
    );
    if (!integration) {
      throw new Error(`Integration ${pb.integrationId} not found`);
    }

    const message = pb.snapshotFinalDm?.trim();
    if (!message) {
      // Nothing to send — flow didn't configure a final DM. Just no-op.
      return;
    }

    const button: InstagramDmButton | undefined =
      pb.snapshotFinalBtnText && pb.snapshotFinalBtnUrl
        ? {
            kind: 'url',
            title: pb.snapshotFinalBtnText,
            url: pb.snapshotFinalBtnUrl,
          }
        : undefined;

    // Integrations via Instagram Login API ja possuem IG User Token no
    // integration.token — dispensa messaging token separado em Settings.
    if (integration.providerIdentifier === 'instagram-standalone') {
      await this._instagramMessagingService.sendDmWithToken({
        token: integration.token,
        recipientIgsid: pb.igSenderId,
        message,
        button,
        useInstagramGraph: true,
      });
      return;
    }

    await this._instagramMessagingService.sendStoryReply({
      organizationId: integration.organizationId,
      profileId: integration.profileId || null,
      igBusinessAccountId: integration.internalId,
      recipientIgsid: pb.igSenderId,
      message,
      button,
      integrationName: integration.name || undefined,
    });
  }

  /**
   * Quando o usuario clicou no botao postback mas a Meta confirmou que
   * ele nao segue a conta. Dois modos:
   *   exhausted=false: incrementa a tentativa, cria um NOVO PendingPostback
   *     (kind='already_followed') com botao "Ja segui!" e envia o gate DM.
   *   exhausted=true: envia mensagem final de desistencia sem botao e
   *     abandona o pending atual.
   */
  @ActivityMethod()
  async sendAlreadyFollowedGate(
    pendingPostbackId: string,
    opts: { exhausted: boolean }
  ) {
    const pb = await this._flowsService.getPendingPostback(pendingPostbackId);
    if (!pb) throw new Error(`PendingPostback ${pendingPostbackId} not found`);

    const integration = await this._integrationService.getIntegrationById(
      pb.organizationId,
      pb.integrationId
    );
    if (!integration) {
      throw new Error(`Integration ${pb.integrationId} not found`);
    }

    const isStandalone =
      integration.providerIdentifier === 'instagram-standalone';

    if (opts.exhausted) {
      // Apologetic message, no button. Avoids locking the user in a button
      // loop when they'll never follow.
      const exhaustedMessage =
        pb.snapshotExhaustedMessage?.trim() || GATE_EXHAUSTED_MESSAGE;
      if (isStandalone) {
        await this._instagramMessagingService.sendDmWithToken({
          token: integration.token,
          recipientIgsid: pb.igSenderId,
          message: exhaustedMessage,
          useInstagramGraph: true,
        });
      } else {
        await this._instagramMessagingService.sendStoryReply({
          organizationId: integration.organizationId,
          profileId: integration.profileId || null,
          igBusinessAccountId: integration.internalId,
          recipientIgsid: pb.igSenderId,
          message: exhaustedMessage,
          integrationName: integration.name || undefined,
        });
      }
      return;
    }

    // Create a new pending (kind='already_followed') carrying forward the
    // same snapshots so a future click resolves to the same final DM.
    const newPending = await this._flowsService.createPendingPostback({
      flowId: pb.flowId,
      originExecutionId: pb.originExecutionId,
      integrationId: pb.integrationId,
      organizationId: pb.organizationId,
      igSenderId: pb.igSenderId,
      igCommenterName: pb.igCommenterName || undefined,
      igMediaId: pb.igMediaId || undefined,
      igCommentId: pb.igCommentId || undefined,
      kind: 'already_followed',
      attemptCount: pb.attemptCount + 1,
      maxAttempts: pb.maxAttempts,
      snapshotFinalDm: pb.snapshotFinalDm || undefined,
      snapshotFinalBtnText: pb.snapshotFinalBtnText || undefined,
      snapshotFinalBtnUrl: pb.snapshotFinalBtnUrl || undefined,
      snapshotGateDm: pb.snapshotGateDm || undefined,
      snapshotAlreadyBtnText: pb.snapshotAlreadyBtnText || undefined,
      snapshotExhaustedMessage: pb.snapshotExhaustedMessage || undefined,
      openingDmMessage: pb.openingDmMessage || undefined,
      openingDmButtonText: pb.openingDmButtonText || undefined,
    });

    // Consume the current pending — it has served its purpose (this click)
    // and the new pending carries the next attempt.
    await this._flowsService.consumePendingPostback(pb.id);

    const gateMessage =
      pb.snapshotGateDm?.trim() || GATE_FALLBACK_MESSAGE;
    const button: InstagramDmButton = {
      kind: 'postback',
      title: pb.snapshotAlreadyBtnText?.trim() || 'Ja segui!',
      payload: newPending.payload,
    };

    if (isStandalone) {
      await this._instagramMessagingService.sendDmWithToken({
        token: integration.token,
        recipientIgsid: pb.igSenderId,
        message: gateMessage,
        button,
        useInstagramGraph: true,
      });
      return;
    }

    await this._instagramMessagingService.sendStoryReply({
      organizationId: integration.organizationId,
      profileId: integration.profileId || null,
      igBusinessAccountId: integration.internalId,
      recipientIgsid: pb.igSenderId,
      message: gateMessage,
      button,
      integrationName: integration.name || undefined,
    });
  }
}
