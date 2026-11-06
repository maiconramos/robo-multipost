import { SharedFlowsRepository } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/shared-flows.repository';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  NotificationService,
  NotificationType,
} from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Integration, Post, State } from '@prisma/client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { ssrfSafeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  AuthTokenDetails,
  PendingCheckResponse,
  PostResponse,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { timer } from '@gitroom/helpers/utils/timer';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { ApplicationFailure, TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { decryptIntegrationToken } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';
import {
  setHeartbeatDetails,
  withHeartbeat,
} from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';
import { assertSafePendingData } from '@gitroom/nestjs-libraries/temporal/pending-post-state';
import { selectPostWorkflowVersion } from '@gitroom/nestjs-libraries/temporal/post-workflow-version';
import {
  BadBody,
  PublishedWithError,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';

@Injectable()
@Activity()
export class PostActivity {
  private readonly _logger = new Logger(PostActivity.name);

  constructor(
    private _postService: PostsService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _webhookService: WebhooksService,
    private _temporalService: TemporalService,
    private _subscriptionService: SubscriptionService,
    private _flowsService: FlowsService,
    private _encryption: EncryptionService,
    @Optional() private readonly sharedFlows?: SharedFlowsRepository
  ) {}

  private async assertSupportedThread(
    integration: Integration,
    posts: Post[],
    commenting = false
  ) {
    const error = await this._postService.unsupportedCommentThreadError(
      integration,
      posts,
      commenting
    );
    if (error)
      throw new BadBody(integration.providerIdentifier, '{}', '{}', error);
  }

  @ActivityMethod()
  async getIntegrationById(orgId: string, id: string) {
    return this._integrationService.getIntegrationById(orgId, id);
  }

  @ActivityMethod()
  async searchForMissingThreeHoursPosts() {
    const list = await this._postService.searchForMissingThreeHoursPosts();
    for (const post of list) {
      const workflowName = selectPostWorkflowVersion({
        integrationId: post.integration.id,
        providerIdentifier: post.integration.providerIdentifier,
      });
      await this._temporalService.client
        .getRawClient()
        .workflow.signalWithStart(workflowName, {
          workflowId: `post_${post.id}`,
          taskQueue: 'main',
          signal: 'poke',
          workflowIdConflictPolicy: 'USE_EXISTING',
          signalArgs: [],
          args: [
            {
              taskQueue: post.integration.providerIdentifier.startsWith(
                'zernio-'
              )
                ? 'main'
                : post.integration.providerIdentifier
                    .split('-')[0]
                    .toLowerCase(),
              postId: post.id,
              organizationId: post.organizationId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: postIdSearchParam,
              value: post.id,
            },
            {
              key: organizationId,
              value: post.organizationId,
            },
          ]),
        });
    }
  }

  @ActivityMethod()
  async updatePost(id: string, postId: string, releaseURL: string) {
    const result = await this._postService.updatePost(id, postId, releaseURL);

    // Bind any pending "next_publication" flows to this freshly published
    // media. Stories are excluded. Failures must never break the publish.
    try {
      if (!postId) return result;
      const post = await this._postService.getPostById(id);
      if (
        post &&
        process.env.SHARED_AUTOMATIONS_ENABLED === 'true' &&
        this.sharedFlows &&
        ['facebook', 'instagram', 'instagram-standalone'].includes(
          post.integration?.providerIdentifier
        )
      ) {
        let sharedSettings: { post_type?: string } = {};
        try {
          sharedSettings = JSON.parse(post.settings || '{}');
        } catch {}
        if (sharedSettings.post_type !== 'story')
          await this.sharedFlows.bindNext(post.integrationId, postId, post.id);
      }
      if (!post || post.integration?.providerIdentifier !== 'instagram') {
        return result;
      }
      let settings: any = {};
      try {
        settings = JSON.parse(post.settings || '{}');
      } catch {
        settings = {};
      }
      if (settings?.post_type === 'story') return result;
      await this._flowsService.bindPendingFlowsToPost(
        post.integrationId,
        postId,
        'comment_on_post',
        post.id
      );
    } catch {
      // ignore — bind errors must not fail the post publish
    }

    return result;
  }

  @ActivityMethod()
  async getPostV112(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return false;
      }
    }

    const [post] = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId,
      true
    );
    return post ? this.sanitizePostForWorkflow(post) : false;
  }

  @ActivityMethod()
  async getPostsList(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return [];
      }
    }

    const getPosts = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId
    );
    if (!getPosts || getPosts.length === 0 || getPosts[0].parentPostId) {
      return [];
    }

    return getPosts;
  }

  @ActivityMethod()
  async getPostsListV112(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return [];
      }
    }

    const getPosts = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId,
      true
    );
    if (!getPosts || getPosts.length === 0 || getPosts[0].parentPostId) {
      return [];
    }

    return getPosts.map((post) => this.sanitizePostForWorkflow(post));
  }

  @ActivityMethod()
  async isCommentable(integration: Integration) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return !!getIntegration.comment;
  }

  @ActivityMethod()
  async isCommentableForWorkflow(providerIdentifier: string) {
    const provider =
      this._integrationManager.getSocialIntegration(providerIdentifier);
    return !!provider.comment;
  }

  @ActivityMethod()
  async postComment(
    postId: string,
    lastPostId: string | undefined,
    integration: Integration,
    posts: Post[]
  ) {
    await this.assertChannelActive(integration);
    return withHeartbeat(async () => {
      const runtimeIntegration = this.withDecryptedToken(integration);
      const getIntegration = this._integrationManager.getSocialIntegration(
        runtimeIntegration.providerIdentifier
      );

      await this.assertSupportedThread(runtimeIntegration, posts, true);
      setHeartbeatDetails(`${runtimeIntegration.providerIdentifier}: comment`);
      const newPosts = await this._postService.updateTags(
        runtimeIntegration.organizationId,
        posts
      );

      return getIntegration.comment(
        runtimeIntegration.internalId,
        postId,
        lastPostId,
        runtimeIntegration.token,
        await this.mapPosts(getIntegration, newPosts || []),
        runtimeIntegration
      );
    });
  }

  @ActivityMethod()
  async postCommentV112(
    postId: string,
    lastPostId: string | undefined,
    organizationId: string,
    integrationId: string,
    posts: Post[]
  ) {
    return withHeartbeat(async () => {
      const runtimeIntegration = await this.loadRuntimeIntegration(
        organizationId,
        integrationId
      );
      const provider = this._integrationManager.getSocialIntegration(
        runtimeIntegration.providerIdentifier
      );

      await this.assertSupportedThread(runtimeIntegration, posts, true);
      setHeartbeatDetails(`${runtimeIntegration.providerIdentifier}: comment`);
      const newPosts = await this._postService.updateTags(
        runtimeIntegration.organizationId,
        posts
      );

      return provider.comment(
        runtimeIntegration.internalId,
        postId,
        lastPostId,
        runtimeIntegration.token,
        await this.mapPosts(provider, newPosts || []),
        runtimeIntegration
      );
    });
  }

  @ActivityMethod()
  async postSocialPending(
    organizationId: string,
    integrationId: string,
    posts: Post[]
  ): Promise<PostResponse[]> {
    return withHeartbeat(async () => {
      const runtimeIntegration = await this.loadRuntimeIntegration(
        organizationId,
        integrationId
      );
      const getIntegration = this._integrationManager.getSocialIntegration(
        runtimeIntegration.providerIdentifier
      );

      await this.assertSupportedThread(runtimeIntegration, posts, false);
      setHeartbeatDetails('update tags');
      const newPosts = await this._postService.updateTags(
        runtimeIntegration.organizationId,
        posts
      );
      setHeartbeatDetails('resolve media');
      const mappedPosts = await this.mapPosts(getIntegration, newPosts || []);
      setHeartbeatDetails(`${runtimeIntegration.providerIdentifier}: publish`);

      const response = await this.keepReleaseOnPublishedError(
        runtimeIntegration,
        () =>
          getIntegration.postPending
            ? getIntegration.postPending(
                runtimeIntegration.internalId,
                runtimeIntegration.token,
                mappedPosts,
                runtimeIntegration
              )
            : getIntegration.post(
                runtimeIntegration.internalId,
                runtimeIntegration.token,
                mappedPosts,
                runtimeIntegration
              )
      );

      const validated = response.map((item) =>
        item.status === 'pending'
          ? { ...item, pendingData: assertSafePendingData(item.pendingData) }
          : item
      );

      setHeartbeatDetails(
        `${runtimeIntegration.providerIdentifier}: published, streak`
      );
      try {
        await this.startStreak(runtimeIntegration.organizationId);
      } catch {
        // A notification/telemetry failure after publishing must not repeat it.
      }

      return validated;
    });
  }

  // Somente escrita: o aceite remoto ja foi registrado na history pelo retorno
  // de postSocialPending. Retry desta activity nunca reenvia para a rede.
  @ActivityMethod()
  async recordAcceptedPost(
    organizationId: string,
    postDbId: string,
    remoteId: string,
    releaseURL: string
  ) {
    await this._postService.updatePublishedRelease(
      postDbId,
      organizationId,
      remoteId,
      releaseURL
    );
  }

  @ActivityMethod()
  async checkPostStatus(
    organizationId: string,
    integrationId: string,
    pendingData: unknown
  ): Promise<PendingCheckResponse> {
    const runtimeIntegration = await this.loadRuntimeIntegration(
      organizationId,
      integrationId
    );
    const provider = this._integrationManager.getSocialIntegration(
      runtimeIntegration.providerIdentifier
    );
    if (!provider.checkPostStatus) {
      throw new Error('Provider does not implement checkPostStatus');
    }

    const result = await provider.checkPostStatus(
      runtimeIntegration.token,
      assertSafePendingData(pendingData),
      runtimeIntegration
    );
    return this.validatePendingCheckResponse(result);
  }

  @ActivityMethod()
  async finalizePost(
    organizationId: string,
    integrationId: string,
    pendingData: unknown
  ): Promise<PendingCheckResponse> {
    return withHeartbeat(async () => {
      const runtimeIntegration = await this.loadRuntimeIntegration(
        organizationId,
        integrationId
      );
      const provider = this._integrationManager.getSocialIntegration(
        runtimeIntegration.providerIdentifier
      );
      if (!provider.finalizePost) {
        throw new Error('Provider does not implement finalizePost');
      }

      setHeartbeatDetails(`${runtimeIntegration.providerIdentifier}: finalize`);
      const result = await provider.finalizePost(
        runtimeIntegration.token,
        assertSafePendingData(pendingData),
        runtimeIntegration
      );
      return this.validatePendingCheckResponse(result);
    });
  }

  @ActivityMethod()
  async postSocial(integration: Integration, posts: Post[]) {
    await this.assertChannelActive(integration);
    integration.token = decryptIntegrationToken(
      this._encryption,
      integration.token
    );
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    await this.assertSupportedThread(integration, posts);
    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const mappedPosts = await Promise.all(
      (newPosts || []).map(async (p) => ({
        id: p.id,
        message: stripHtmlValidation(
          getIntegration.editor,
          p.content,
          true,
          false,
          !/<\/?[a-z][\s\S]*>/i.test(p.content),
          getIntegration.mentionFormat,
          this.inlineImages(getIntegration, p.settings)
        ),
        settings: JSON.parse(p.settings || '{}'),
        media: await this._postService.updateMedia(
          p.id,
          JSON.parse(p.image || '[]'),
          getIntegration?.convertToJPEG || false
        ),
      }))
    );

    const postNow = await this.keepReleaseOnPublishedError(integration, () =>
      getIntegration.post(
        integration.internalId,
        integration.token,
        mappedPosts,
        integration
      )
    );

    await this._temporalService.client
      .getRawClient()
      .workflow.start('streakWorkflow', {
        args: [{ organizationId: integration.organizationId }],
        workflowId: `streak_${integration.organizationId}`,
        taskQueue: 'main',
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
        typedSearchAttributes: new TypedSearchAttributes([
          {
            key: organizationId,
            value: integration.organizationId,
          },
        ]),
      });

    return postNow;
  }

  // Post no ar com falha num passo seguinte (PublishedWithError): guarda o
  // id/URL na plataforma e falha como BadBody, como qualquer outro erro — o
  // calendario leva ao post publicado em vez de o usuario publicar de novo
  // (upstream 23beddcd).
  private async keepReleaseOnPublishedError<T>(
    integration: Integration,
    publish: () => Promise<T>
  ): Promise<T> {
    try {
      return await publish();
    } catch (err) {
      if (!(err instanceof PublishedWithError)) {
        throw err;
      }
      try {
        await this._postService.updatePublishedRelease(
          err.postDbId,
          integration.organizationId,
          err.releaseId,
          err.releaseURL
        );
      } catch (e) {
        // sem o link o usuario pode publicar de novo: precisa aparecer no log
        this._logger.error(
          `nao foi possivel guardar o link do post ${
            err.postDbId
          } publicado com erro: ${summarizeError(e)}`
        );
      }
      throw new BadBody(
        integration.providerIdentifier,
        JSON.stringify({}),
        Buffer.from('{}'),
        err.message
      );
    }
  }

  private withDecryptedToken(integration: Integration): Integration {
    return {
      ...integration,
      token: decryptIntegrationToken(this._encryption, integration.token),
    };
  }

  private async assertChannelActive(integration: Integration) {
    const live = await this._integrationService.getIntegrationById(
      integration.organizationId,
      integration.id
    );
    if (!live || live.deletedAt || live.disabled)
      throw ApplicationFailure.nonRetryable(
        'Channel unavailable',
        'ChannelUnavailable'
      );
  }

  private async loadRuntimeIntegration(
    organizationId: string,
    integrationId: string
  ): Promise<Integration> {
    return this.withDecryptedToken(
      await this.loadIntegration(organizationId, integrationId)
    );
  }

  private async loadIntegration(
    organizationId: string,
    integrationId: string
  ): Promise<Integration> {
    const integration = await this._integrationService.getIntegrationById(
      organizationId,
      integrationId
    );
    if (!integration || integration.disabled || integration.deletedAt) {
      throw ApplicationFailure.nonRetryable(
        'Channel unavailable',
        'ChannelUnavailable'
      );
    }
    return integration;
  }

  private sanitizePostForWorkflow(post: any) {
    const safePost: any = { ...post };
    delete safePost.error;
    delete safePost.childrenPost;
    if (!post.integration) {
      return safePost;
    }
    const integration = post.integration;
    return {
      ...safePost,
      integration: {
        id: integration.id,
        organizationId: integration.organizationId,
        profileId: integration.profileId,
        providerIdentifier: integration.providerIdentifier,
        name: integration.name,
        disabled: integration.disabled,
        refreshNeeded: integration.refreshNeeded,
      },
    };
  }

  // figuras no corpo so para quem as publica (WordPress, ListMonk); os outros
  // providers seguem recebendo o texto sem <img> (upstream 2aae02fe)
  private inlineImages(getIntegration: any, settings?: string | null) {
    return !!getIntegration?.inlineImages?.(JSON.parse(settings || '{}'));
  }

  private mapPosts(getIntegration: any, posts: Post[]) {
    return Promise.all(
      posts.map(async (post) => ({
        id: post.id,
        message: stripHtmlValidation(
          getIntegration.editor,
          post.content,
          true,
          false,
          !/<\/?[a-z][\s\S]*>/i.test(post.content),
          getIntegration.mentionFormat,
          this.inlineImages(getIntegration, post.settings)
        ),
        settings: JSON.parse(post.settings || '{}'),
        media: await this._postService.updateMedia(
          post.id,
          JSON.parse(post.image || '[]'),
          getIntegration?.convertToJPEG || false
        ),
      }))
    );
  }

  private validatePendingCheckResponse(
    response: PendingCheckResponse
  ): PendingCheckResponse {
    return response.status === 'completed'
      ? response
      : {
          ...response,
          pendingData: assertSafePendingData(response.pendingData),
        };
  }

  private startStreak(organizationIdValue: string) {
    return this._temporalService.client
      .getRawClient()
      .workflow.start('streakWorkflow', {
        args: [{ organizationId: organizationIdValue }],
        workflowId: `streak_${organizationIdValue}`,
        taskQueue: 'main',
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
        typedSearchAttributes: new TypedSearchAttributes([
          {
            key: organizationId,
            value: organizationIdValue,
          },
        ]),
      });
  }

  @ActivityMethod()
  async inAppNotification(
    orgId: string,
    payload: {
      subjectKey: string;
      messageKey: string;
      params?: Record<string, string | number | undefined>;
      profileId?: string | null;
    },
    sendEmail = false,
    digest = false,
    type: NotificationType = 'success'
  ) {
    return this._notificationService.inAppNotification(
      orgId,
      payload,
      sendEmail,
      digest,
      type
    );
  }

  @ActivityMethod()
  async globalPlugs(integration: Integration) {
    return this._postService.checkPlugs(
      integration.organizationId,
      integration.providerIdentifier,
      integration.id
    );
  }

  @ActivityMethod()
  async globalPlugsForWorkflow(organizationId: string, integrationId: string) {
    return this.globalPlugs(
      await this.loadIntegration(organizationId, integrationId)
    );
  }

  @ActivityMethod()
  async changeState(id: string, state: State, err?: any, body?: any) {
    return this._postService.changeState(id, state, err, body);
  }

  @ActivityMethod()
  async internalPlugs(integration: Integration, settings: any) {
    return this._postService.checkInternalPlug(
      integration,
      integration.organizationId,
      integration.id,
      settings
    );
  }

  @ActivityMethod()
  async internalPlugsForWorkflow(
    organizationId: string,
    integrationId: string,
    settings: any
  ) {
    return this.internalPlugs(
      await this.loadIntegration(organizationId, integrationId),
      settings
    );
  }

  @ActivityMethod()
  async sendWebhooks(postId: string, orgId: string, integrationId: string) {
    const webhooks = (await this._webhookService.getWebhooks(orgId)).filter(
      (f) => {
        return (
          f.integrations.length === 0 ||
          f.integrations.some((i) => i.integration.id === integrationId)
        );
      }
    );

    const post = await this._postService.getPostByForWebhookId(
      postId,
      integrationId
    );
    return Promise.all(
      webhooks.map(async (webhook) => {
        try {
          await ssrfSafeFetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(post),
          });
        } catch (e) {
          /**empty**/
        }
      })
    );
  }
  @ActivityMethod()
  async processPlug(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    return this._integrationService.processPlugs(data);
  }

  @ActivityMethod()
  async processInternalPlug(data: {
    post: string;
    originalIntegration: string;
    integration: string;
    plugName: string;
    orgId: string;
    delay: number;
    information: any;
  }) {
    return this._integrationService.processInternalPlug(data);
  }

  @ActivityMethod()
  async refreshToken(
    integration: Integration
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration);
      return false;
    }
  }

  @ActivityMethod()
  async refreshTokenWithCause(
    integration: Integration,
    cause: string
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration,
        cause
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration);
      return false;
    }
  }

  @ActivityMethod()
  async refreshTokenForWorkflow(
    organizationId: string,
    integrationId: string,
    cause: string
  ): Promise<boolean> {
    let integration: Integration;
    try {
      integration = await this.loadIntegration(organizationId, integrationId);
    } catch {
      return false;
    }
    return !!(await this.refreshTokenWithCause(integration, cause));
  }
}
