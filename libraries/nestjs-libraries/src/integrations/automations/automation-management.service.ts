import { HttpException, Injectable } from '@nestjs/common';
import { FlowStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AutomationHistoryService } from '../../database/prisma/automation-history/automation-history.service';
import {
  automationHistoryQuerySchema,
  type AutomationHistoryQueryDto,
  type HistoryEngine,
} from '../../dtos/flows/automation-history.dto';
import { FlowsService } from '../../database/prisma/flows/flows.service';
import { SharedFlowsService } from '../../database/prisma/flows-v2/shared-flows.service';
import { ScheduledPostsService } from '../../database/prisma/scheduled-automations/scheduled-posts.service';
import { IntegrationService } from '../../database/prisma/integrations/integration.service';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { RepostService } from '../../database/prisma/repost/repost.service';
import {
  simpleDefinition,
  getTriggerType,
  normalizeDefinition,
  type CommentDefinition,
} from '../../database/prisma/flows-v2/flow-definition';
import {
  AutomationCanvasDto,
  AutomationConfiguration,
  automationConfigurationSchema,
  automationOptionsSchema,
  automationAliasesSchema,
  automationCanvasSchema,
  repostRequestSchema,
  repostConfigurationSchema,
} from '../../dtos/flows/automation-management.dto';
import type { FlowScope, SharedFlowView } from '../../dtos/flows/flow-v2.dto';
import type { QuickCreateFlowDto } from '../../dtos/flows/flow.dto';
import {
  CreateRepostRuleDto,
  UpdateRepostRuleDto,
} from '../../dtos/repost/repost.rule.dto';
import {
  failAutomation,
  isQuickGraph,
  legacyConfiguration,
  parseObject,
  validateAutomationConfiguration,
  validateLegacyCanvas,
} from './automation-management.contract';
import { checkPublicHttpsUrl } from '../../dtos/validators/is-public-https-url.validator';

export function automationErrorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    const message =
      typeof body === 'string' ? body : (body as { message?: unknown }).message;
    return typeof message === 'string' &&
      /^[A-Z][A-Z0-9_]{1,100}$/.test(message)
      ? message
      : `HTTP_${error.getStatus()}`;
  }
  return 'AUTOMATION_OPERATION_FAILED';
}
@Injectable()
export class AutomationManagementService {
  constructor(
    private readonly flows: FlowsService,
    private readonly shared: SharedFlowsService,
    private readonly scheduled: ScheduledPostsService,
    private readonly profiles: ProfileService,
    private readonly repostService: RepostService,
    private readonly executionHistoryService: AutomationHistoryService,
    private readonly integrations: IntegrationService
  ) {}
  async scope(organizationId: string, profileId?: string): Promise<FlowScope> {
    if (!organizationId) failAutomation('ORGANIZATION_REQUIRED', 401);
    const profile = profileId
      ? await this.profiles.getProfileById(organizationId, profileId)
      : await this.profiles.getDefaultProfile(organizationId);
    if (!profile) failAutomation('PROFILE_NOT_FOUND', 404);
    return { organizationId, profileId: profile.id };
  }
  capabilities() {
    const common = [
      'name',
      'integrationId',
      'keywords',
      'matchMode',
      'dmMessage',
      'dmMessages',
      'dmVariants',
      'dmButtonText',
      'dmButtonUrl',
    ];
    const targets = ['postMode', 'postIds', 'scheduledPostId'];
    return {
      contractVersion: 1,
      separateAutomationPerDestination: true,
      executionHistory: {
        normalized: true,
        operations: ['list', 'detail'],
        executionVersions: [1, 2],
        filters: ['status', 'from', 'to'],
        pagination: 'cursor',
        defaultLimit: 25,
        maxLimit: 50,
        noReplay: true,
        acceptanceIsNotDelivery: true,
      },
      triggers: [
        {
          platform: 'instagram',
          triggerType: 'comment_on_post',
          executionVersion: 1,
          postModes: ['all', 'specific', 'next_publication', 'scheduled'],
          fields: [
            ...common,
            ...targets,
            'aliasMediaIds',
            'replyMessage',
            'replyMessages',
            'requireFollow',
            'followGateMessage',
            'openingDmMessage',
            'openingDmButtonText',
            'alreadyFollowedButtonText',
            'gateExhaustedMessage',
            'maxGateAttempts',
          ],
          variables: [
            '{commenter_name}',
            '{commenter_id}',
            '{comment_text}',
            '{media_id}',
          ],
          buttonTextMax: 80,
        },
        {
          platform: 'instagram',
          triggerType: 'story_reply',
          executionVersion: 1,
          postModes: ['all', 'specific', 'next_publication'],
          fields: [
            ...common,
            'postMode',
            'storyIds',
            'matchReactions',
            'requireFollow',
            'followGateMessage',
          ],
          variables: [
            '{commenter_name}',
            '{commenter_id}',
            '{comment_text}',
            '{media_id}',
          ],
          buttonTextMax: 80,
        },
        {
          platform: 'facebook',
          triggerType: 'comment_on_post',
          executionVersion: 2,
          postModes: ['all', 'specific', 'next_publication', 'scheduled'],
          fields: [...common, ...targets, 'replyMessage', 'replyMessages'],
          variables: [
            '{{comment_name}}',
            '{{comment_text}}',
            '{{comment_id}}',
            '{{media_id}}',
          ],
          buttonTextMax: 20,
          dmTextMax: 2000,
          dmWithButtonMax: 640,
        },
        {
          platform: 'facebook',
          triggerType: 'messenger_message',
          executionVersion: 2,
          postModes: ['all'],
          fields: [...common, 'priority'],
          keywordsRequired: true,
          priority: {
            min: 1,
            max: 1000,
            default: 10,
            winner: 'lowest_number; equal_matching_priorities_rejected',
          },
          variables: [
            '{{comment_name}}',
            '{{comment_text}}',
            '{{comment_id}}',
            '{{media_id}}',
          ],
          buttonTextMax: 20,
          dmTextMax: 2000,
          dmWithButtonMax: 640,
        },
      ],
      graph: {
        nodeTypes: [
          'TRIGGER',
          'CONDITION',
          'REPLY_COMMENT',
          'SEND_DM',
          'DELAY',
        ],
        conditionHandles: ['match', 'no_match'],
        dataEncoding: 'JSON string',
        nodeFields: {
          TRIGGER: [
            'triggerType',
            'keywords',
            'matchMode',
            'priority (Messenger only)',
            'mode/postIds/storyIds/scheduledPostId (V1 only)',
            'matchReactions/requireFollow/followGateMessage/openingDmMessage/openingDmButtonText/alreadyFollowedButtonText/gateExhaustedMessage/maxGateAttempts (Instagram only)',
          ],
          CONDITION: ['keywords', 'matchMode'],
          REPLY_COMMENT: ['message', 'messages'],
          SEND_DM: [
            'variants',
            'message',
            'messages',
            'buttonText',
            'buttonUrl',
          ],
          DELAY: ['duration', 'unit'],
        },
        delayUnits: ['seconds', 'minutes', 'hours'],
        v1Concurrency: 'expectedUpdatedAt',
        v2Concurrency: 'expectedRevision',
      },
      limits: {
        keywords: 50,
        keywordLength: 100,
        publishedTargets: 100,
        scheduledTargets: 1,
        publicReplyVariants: 10,
        publicReplyLength: 2200,
        privateReplyVariants: 10,
        privateReplyVariantButton: true,
        privateReplyVariantButtonTitleLength: 20,
        privateReplyLength: 2000,
        privateReplyVariantsWithButtonLength: 640,
        facebookPrivateReplyWithButtonLength: 640,
        facebookButtonTitleLength: 20,
      },
      controls: {
        create: ['activate'],
        edit: ['expectedUpdatedAt (V1)', 'expectedRevision (V2)'],
        aliases: 'Separate explicit list/add/remove operation for updates.',
      },
      scheduledTarget:
        'Internal Post.id per destination; retained after publication. Never a remote Meta ID.',
      unsupported: [
        'Facebook Story attribution',
        'Facebook follow gate',
        'QR code triggers',
        'Messenger reference links',
      ],
      repost: {
        separateResource: true,
        fields: Object.keys(repostConfigurationSchema.shape),
        sourceTypes: ['INSTAGRAM_STORY', 'INSTAGRAM_POST'],
        operations: repostRequestSchema.shape.operation.options,
      },
      credentials:
        'Use configured account credentials (login or compatible system user). These operations never return tokens or configure app secrets.',
    };
  }
  private async channel(
    scope: FlowScope,
    integrationId: string,
    platform?: string
  ) {
    const channel = (await this.shared.listChannels(scope)).find(
      (c) => c.id === integrationId
    );
    if (
      !channel ||
      (platform &&
        (channel.providerIdentifier === 'facebook'
          ? 'facebook'
          : 'instagram') !== platform)
    )
      failAutomation('CHANNEL_NOT_FOUND', 404);
    return channel;
  }
  private legacyInput(c: AutomationConfiguration): QuickCreateFlowDto {
    const { platform, priority, aliasMediaIds, ...input } = c;
    return input as QuickCreateFlowDto;
  }
  private sharedInput(c: AutomationConfiguration, expectedRevision?: number) {
    const definition = simpleDefinition({
      triggerType:
        c.triggerType === 'messenger_message'
          ? 'messenger_message'
          : 'comment_on_post',
      keywords: c.keywords,
      matchMode: c.matchMode,
      priority: c.priority,
      message: c.dmMessage || '',
      dmMessages: c.dmMessages,
      dmVariants: c.dmVariants?.map((v) => ({
        message: v.message,
        ...(v.buttonText !== undefined ? { buttonText: v.buttonText } : {}),
        ...(v.buttonUrl !== undefined ? { buttonUrl: v.buttonUrl } : {}),
      })),
      reply: c.replyMessage,
      replyMessages: c.replyMessages,
      buttonText: c.dmButtonText,
      buttonUrl: c.dmButtonUrl,
    });
    if (
      !c.dmMessage?.trim() &&
      !c.dmMessages?.length &&
      !c.dmVariants?.length
    ) {
      definition.nodes = definition.nodes.filter((n) => n.type !== 'SEND_DM');
      const ids = new Set(definition.nodes.map((n) => n.id));
      definition.edges = definition.edges.filter(
        (e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId)
      );
    }
    return {
      name: c.name,
      expectedRevision,
      channels: [
        {
          integrationId: c.integrationId,
          postMode: c.postMode || 'specific',
          postIds: c.postIds || [],
          ...(c.scheduledPostId ? { scheduledPostId: c.scheduledPostId } : {}),
        },
      ],
      definition,
    };
  }
  async create(scope: FlowScope, input: unknown) {
    const c = validateAutomationConfiguration(input);
    await this.channel(scope, c.integrationId, c.platform);
    let id: string | undefined;
    const version = c.platform === 'facebook' ? 2 : 1;
    try {
      if (version === 2) {
        const draft = await this.shared.save(scope, this.sharedInput(c));
        id = draft.id;
        if (c.activate !== false)
          await this.shared.status(scope, id, draft.revision, 'ACTIVE');
      } else {
        const draft = await this.flows.createDraftFlow(
          scope.organizationId,
          { name: c.name, integrationId: c.integrationId },
          scope.profileId
        );
        id = draft.id;
        for (const alias of c.aliasMediaIds || [])
          await this.flows.addManualAlias(scope.organizationId, id, alias);
        await this.flows.quickUpdateFlow(
          scope.organizationId,
          id,
          { ...this.legacyInput(c), activate: false },
          scope.profileId
        );
        if (c.activate !== false) await this.status(scope, id, 1, 'ACTIVE');
      }
      return await this.detail(scope, id, version);
    } catch (error) {
      if (!id) throw error;
      return {
        id,
        executionVersion: version,
        saved: true,
        activationError: automationErrorCode(error),
        message: 'AUTOMATION_SAVED_REVIEW_BEFORE_RETRY',
      };
    }
  }
  private async assertChannelOwners(scope: FlowScope, ids: string[]) {
    for (const id of new Set(ids)) {
      const channel = await this.integrations.getIntegrationById(
        scope.organizationId,
        id
      );
      if (
        !channel ||
        channel.deletedAt ||
        channel.profileId !== scope.profileId
      )
        failAutomation('CHANNEL_NOT_FOUND', 404);
    }
  }
  private async assertOwnership(scope: FlowScope, id: string, version: number) {
    if (version === 2) {
      const flow = await this.shared.get(scope, id);
      await this.assertChannelOwners(
        scope,
        flow.channels.map((c) => c.integrationId)
      );
    } else if (version === 1) {
      const flow = await this.flows.getFlow(
        scope.organizationId,
        id,
        scope.profileId
      );
      if (!flow) failAutomation('FLOW_NOT_FOUND', 404);
      await this.assertChannelOwners(scope, [flow.integrationId]);
    } else failAutomation('INVALID_EXECUTION_VERSION');
  }
  async detail(scope: FlowScope, id: string, version: number) {
    if (version === 2) {
      const flow = await this.shared.get(scope, id);
      await this.assertChannelOwners(
        scope,
        flow.channels.map((c) => c.integrationId)
      );
      const config = this.sharedConfiguration(flow);
      return { ...flow, quickEditable: !!config, configuration: config };
    }
    if (version !== 1) failAutomation('INVALID_EXECUTION_VERSION');
    const flow = await this.flows.getFlow(
      scope.organizationId,
      id,
      scope.profileId
    );
    if (!flow) failAutomation('FLOW_NOT_FOUND', 404);
    await this.assertChannelOwners(scope, [flow.integrationId]);
    const aliases = await this.flows.listAliases(scope.organizationId, id);
    let config: AutomationConfiguration | null = null;
    try {
      config = legacyConfiguration(
        flow,
        aliases.map((a) => a.aliasMediaId)
      );
    } catch {
      /* A damaged legacy graph must remain inspectable and repairable explicitly. */
    }
    return {
      id: flow.id,
      name: flow.name,
      status: flow.status,
      revision: flow.revision,
      updatedAt: flow.updatedAt?.toISOString(),
      executionVersion: 1,
      integrationId: flow.integrationId,
      quickEditable: !!config,
      configuration: config,
      aliases: aliases.map((a) => ({
        id: a.id,
        aliasMediaId: a.aliasMediaId,
        source: a.source,
      })),
      canvas: {
        nodes: flow.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          ...(n.label != null ? { label: n.label } : {}),
          data: n.data || '{}',
          positionX: n.positionX,
          positionY: n.positionY,
        })),
        edges: flow.edges.map((e) => ({
          id: e.id,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          ...(e.sourceHandle != null ? { sourceHandle: e.sourceHandle } : {}),
        })),
      },
    };
  }
  private sharedConfiguration(
    flow: SharedFlowView
  ): AutomationConfiguration | null {
    if (flow.channels.length !== 1 || !isQuickGraph(flow.definition))
      return null;
    const channel = flow.channels[0];
    const trigger = parseObject(
      flow.definition.nodes.find((n) => n.type === 'TRIGGER')?.data
    );
    const reply = flow.definition.nodes.find((n) => n.type === 'REPLY_COMMENT');
    const dm = flow.definition.nodes.find((n) => n.type === 'SEND_DM');
    const r = reply ? parseObject(reply.data) : {};
    const d = dm ? parseObject(dm.data) : {};
    return {
      name: flow.name,
      integrationId: channel.integrationId,
      platform: channel.platform as 'facebook' | 'instagram',
      postMode: channel.postMode,
      postIds: channel.postIds,
      ...(channel.scheduledPostId
        ? { scheduledPostId: channel.scheduledPostId }
        : {}),
      ...trigger,
      ...(reply ? { replyMessages: r.messages || [r.message] } : {}),
      ...(dm
        ? {
            ...(d.variants
              ? { dmVariants: d.variants }
              : d.messages
              ? { dmMessages: d.messages }
              : { dmMessage: d.message }),
            dmButtonText: d.buttonText,
            dmButtonUrl: d.buttonUrl,
          }
        : {}),
    } as AutomationConfiguration;
  }
  async update(
    scope: FlowScope,
    id: string,
    version: number,
    input: {
      configuration: unknown;
      expectedRevision?: number;
      expectedUpdatedAt?: string;
    }
  ) {
    const patch = automationConfigurationSchema
      .partial()
      .strict()
      .safeParse(input.configuration);
    if (!patch.success || !Object.keys(patch.data).length)
      failAutomation('INVALID_AUTOMATION_PATCH');
    if (
      [
        patch.data.dmMessage,
        patch.data.dmMessages,
        patch.data.dmVariants,
      ].filter((v) => v !== undefined).length > 1 ||
      (patch.data.dmVariants !== undefined &&
        (patch.data.dmButtonText !== undefined ||
          patch.data.dmButtonUrl !== undefined))
    )
      failAutomation('AMBIGUOUS_PRIVATE_REPLY');
    const old = await this.detail(scope, id, version);
    if (!old.configuration) failAutomation('CANVAS_EDIT_REQUIRED', 409);
    if (
      old.configuration.dmVariants &&
      patch.data.dmVariants === undefined &&
      patch.data.dmMessage === undefined &&
      patch.data.dmMessages === undefined &&
      (patch.data.dmButtonText !== undefined ||
        patch.data.dmButtonUrl !== undefined)
    )
      failAutomation('AMBIGUOUS_PRIVATE_REPLY');
    if (
      patch.data.integrationId &&
      patch.data.integrationId !== old.configuration.integrationId
    )
      failAutomation('INTEGRATION_IMMUTABLE');
    if (
      (patch.data.platform &&
        patch.data.platform !== old.configuration.platform) ||
      (patch.data.triggerType &&
        patch.data.triggerType !==
          (old.configuration.triggerType || 'comment_on_post'))
    )
      failAutomation('TRIGGER_IMMUTABLE');
    if (patch.data.activate !== undefined)
      failAutomation('USE_STATUS_OPERATION');
    const c = validateAutomationConfiguration({
      ...old.configuration,
      ...patch.data,
      ...(patch.data.dmVariants !== undefined
        ? {
            dmMessage: undefined,
            dmMessages: undefined,
            dmButtonText: undefined,
            dmButtonUrl: undefined,
          }
        : patch.data.dmMessages !== undefined
        ? { dmMessage: undefined, dmVariants: undefined }
        : patch.data.dmMessage !== undefined
        ? { dmMessages: undefined, dmVariants: undefined }
        : {}),
      activate: false,
    });
    if (version === 2) {
      if (!input.expectedRevision) failAutomation('REVISION_REQUIRED');
      const body = this.sharedInput(c, input.expectedRevision);
      for (const node of body.definition.nodes) {
        const previous = (old as SharedFlowView).definition.nodes.find(
          (n) => n.type === node.type
        );
        if (previous)
          Object.assign(node, {
            label: previous.label,
            positionX: previous.positionX,
            positionY: previous.positionY,
          });
      }
      await this.shared.save(scope, body, id);
    } else {
      if (!input.expectedUpdatedAt) failAutomation('UPDATED_AT_REQUIRED');
      if (input.expectedUpdatedAt !== old.updatedAt)
        failAutomation('REVISION_CONFLICT', 409);
      if (
        patch.data.aliasMediaIds &&
        JSON.stringify([...patch.data.aliasMediaIds].sort()) !==
          JSON.stringify([...(old.configuration.aliasMediaIds || [])].sort())
      )
        failAutomation('USE_ALIAS_OPERATION');
      await this.flows.quickUpdateFlow(
        scope.organizationId,
        id,
        { ...this.legacyInput(c), expectedUpdatedAt: input.expectedUpdatedAt },
        scope.profileId
      );
    }
    return this.detail(scope, id, version);
  }
  async list(scope: FlowScope, version?: number, integrationId?: string) {
    if (integrationId) {
      const channel = await this.integrations.getIntegrationById(
        scope.organizationId,
        integrationId
      );
      if (
        !channel ||
        channel.deletedAt ||
        channel.profileId !== scope.profileId
      )
        failAutomation('CHANNEL_NOT_FOUND', 404);
    }
    const result: Array<Record<string, unknown>> = [];
    if (!version || version === 1)
      for (const f of await this.flows.getFlows(
        scope.organizationId,
        scope.profileId
      ))
        if (!integrationId || f.integrationId === integrationId)
          result.push({
            id: f.id,
            name: f.name,
            status: f.status,
            integrationId: f.integrationId,
            executionVersion: 1,
            updatedAt: f.updatedAt,
            revision: f.revision,
            trigger: f.nodes[0] ? parseObject(f.nodes[0].data) : {},
          });
    if (!version || version === 2)
      for (const f of await this.shared.list(scope))
        if (
          !integrationId ||
          f.channels.some((c) => c.integrationId === integrationId)
        )
          result.push({
            id: f.id,
            name: f.name,
            status: f.status,
            revision: f.revision,
            executionVersion: 2,
            triggerType: getTriggerType(f.definition),
            channels: f.channels,
          });
    return result;
  }
  async listOrganization(
    organizationId: string,
    version?: number,
    integrationId?: string
  ) {
    if (!organizationId) failAutomation('ORGANIZATION_REQUIRED', 401);
    const profiles = await this.profiles.getProfilesByOrgId(organizationId);
    const results: Array<Record<string, unknown>> = [];
    const channel = integrationId
      ? await this.integrations.getIntegrationById(
          organizationId,
          integrationId
        )
      : null;
    if (
      integrationId &&
      (!channel ||
        channel.deletedAt ||
        !profiles.some((p) => p.id === channel.profileId))
    )
      failAutomation('CHANNEL_NOT_FOUND', 404);
    for (const profile of profiles) {
      const scope = { organizationId, profileId: profile.id };
      if (channel && channel.profileId !== profile.id) continue;
      for (const flow of await this.list(scope, version, integrationId))
        results.push({
          ...flow,
          profile: { id: profile.id, name: profile.name },
          profileId: profile.id,
        });
    }
    return results;
  }
  async status(
    scope: FlowScope,
    id: string,
    version: number,
    status: string,
    expectedRevision?: number
  ) {
    if (!['ACTIVE', 'PAUSED', 'ARCHIVED', 'DRAFT'].includes(status))
      failAutomation('INVALID_STATUS');
    if (version === 2) {
      if (status === 'DRAFT') failAutomation('V2_STATUS_UNSUPPORTED');
      if (!expectedRevision) failAutomation('REVISION_REQUIRED');
      await this.assertOwnership(scope, id, version);
      return this.shared.status(
        scope,
        id,
        expectedRevision,
        status as 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
      );
    }
    const old = await this.detail(scope, id, version);
    if (status === 'ACTIVE') {
      const integrationId =
        'integrationId' in old ? old.integrationId : undefined;
      await this.channel(scope, integrationId, 'instagram');
      const check = await this.flows.checkIntegrationWebhook(
        scope.organizationId,
        integrationId
      );
      if (!check.ok) failAutomation('CONNECTION_CHECK_REQUIRED', 412);
    }
    const f = await this.flows.updateFlowStatus(
      scope.organizationId,
      id,
      status as FlowStatus,
      scope.profileId
    );
    return { id: f.id, status: f.status, executionVersion: 1 };
  }
  async options(scope: FlowScope, raw: unknown) {
    const parsed = automationOptionsSchema.safeParse(raw);
    if (!parsed.success) failAutomation('INVALID_OPTIONS_QUERY');
    const q = parsed.data;
    if (q.resource === 'capabilities') return this.capabilities();
    if (q.resource === 'channels')
      return (await this.shared.listChannels(scope)).filter(
        (c) =>
          !q.platform ||
          (c.providerIdentifier === 'facebook' ? 'facebook' : 'instagram') ===
            q.platform
      );
    if (!q.integrationId) failAutomation('INTEGRATION_REQUIRED');
    const channel = await this.channel(scope, q.integrationId, q.platform);
    const facebook = channel.providerIdentifier === 'facebook';
    if (q.resource === 'scheduled_posts')
      return this.scheduled.list(
        scope,
        q.integrationId,
        q.cursor,
        q.selectedId
      );
    if (q.resource === 'posts')
      return facebook
        ? this.shared.posts(scope, q.integrationId, q.cursor)
        : this.flows.getInstagramPostsByIntegration(
            scope.organizationId,
            q.integrationId,
            q.cursor
          );
    if (q.resource === 'stories') {
      if (facebook) failAutomation('INSTAGRAM_STORIES_ONLY');
      return this.flows.getInstagramStoriesByIntegration(
        scope.organizationId,
        q.integrationId
      );
    }
    if (q.resource === 'resolve_post') {
      if (!facebook || !q.reference)
        failAutomation('FACEBOOK_REFERENCE_REQUIRED');
      return this.shared.resolvePost(scope, q.integrationId, q.reference);
    }
    if (facebook)
      return this.shared.readiness(scope, q.integrationId, q.triggerType);
    const state = await this.flows.checkIntegrationWebhook(
      scope.organizationId,
      q.integrationId
    );
    return {
      ready: state.ok,
      reason: state.ok ? undefined : 'INSTAGRAM_CONNECTION_CHECK_REQUIRED',
    };
  }
  private historyEngine(version: number): HistoryEngine {
    if (version !== 1 && version !== 2)
      failAutomation('INVALID_EXECUTION_VERSION');
    return version === 1 ? 'instagram' : 'shared';
  }
  async executionHistory(
    scope: FlowScope,
    id: string,
    version: number,
    query: AutomationHistoryQueryDto
  ) {
    const engine = this.historyEngine(version);
    const parsed = automationHistoryQuerySchema.safeParse(query);
    if (!parsed.success) failAutomation('INVALID_HISTORY_QUERY');
    await this.assertOwnership(scope, id, version);
    return this.executionHistoryService.list(scope, engine, id, parsed.data);
  }
  async executionDetail(
    scope: FlowScope,
    id: string,
    version: number,
    executionId: string
  ) {
    const engine = this.historyEngine(version);
    await this.assertOwnership(scope, id, version);
    return this.executionHistoryService.detail(scope, engine, id, executionId);
  }
  async history(
    scope: FlowScope,
    id: string,
    version: number,
    page = 1,
    limit = 20
  ) {
    await this.detail(scope, id, version);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      failAutomation('INVALID_PAGINATION');
    return version === 2
      ? this.shared.history(scope, id)
      : this.flows.getExecutions(scope.organizationId, id, page, limit);
  }
  async aliases(scope: FlowScope, id: string, raw: unknown) {
    const parsed = automationAliasesSchema.safeParse(raw);
    if (!parsed.success) failAutomation('INVALID_ALIAS_OPERATION');
    const flow = await this.flows.getFlow(
      scope.organizationId,
      id,
      scope.profileId
    );
    if (!flow) failAutomation('FLOW_NOT_FOUND', 404);
    await this.assertChannelOwners(scope, [flow.integrationId]);
    const q = parsed.data;
    const current = await this.flows.listAliases(scope.organizationId, id);
    if (q.operation === 'list')
      return current.map((a) => ({
        id: a.id,
        aliasMediaId: a.aliasMediaId,
        source: a.source,
      }));
    if (q.operation === 'add') {
      const trigger = flow.nodes.find((n) => n.type === 'TRIGGER');
      if (
        !trigger ||
        trigger.label === 'story_reply' ||
        parseObject(trigger.data).triggerType === 'story_reply'
      )
        failAutomation('INSTAGRAM_COMMENT_ALIASES_ONLY');
      await this.channel(scope, flow.integrationId, 'instagram');
      if (!q.aliasMediaId) failAutomation('ALIAS_MEDIA_ID_REQUIRED');
      const alias = await this.flows.addManualAlias(
        scope.organizationId,
        id,
        q.aliasMediaId
      );
      return { id: alias.id, aliasMediaId: q.aliasMediaId };
    }
    if (!q.aliasId || !current.some((a) => a.id === q.aliasId))
      failAutomation('ALIAS_NOT_FOUND', 404);
    return this.flows.removeAlias(scope.organizationId, q.aliasId);
  }
  async canvas(scope: FlowScope, id: string, version: number, raw: unknown) {
    const parsed = automationCanvasSchema.safeParse(raw);
    if (!parsed.success) failAutomation('INVALID_GRAPH');
    const body = parsed.data as AutomationCanvasDto;
    const old = await this.detail(scope, id, version);
    if (version === 2) {
      if (!body.expectedRevision) failAutomation('REVISION_REQUIRED');
      const definition = normalizeDefinition({
        nodes: body.nodes,
        edges: body.edges.map((e, i) => ({ ...e, id: e.id || `edge-${i}` })),
      } as CommentDefinition);
      for (const node of definition.nodes) {
        const cfg = parseObject(node.data);
        if (cfg.buttonUrl && checkPublicHttpsUrl(String(cfg.buttonUrl)))
          failAutomation('INVALID_BUTTON');
      }
      await this.shared.save(
        scope,
        {
          name: body.name || old.name,
          expectedRevision: body.expectedRevision,
          definition,
          channels:
            body.channels ||
            (old as SharedFlowView).channels.map((c) => ({
              integrationId: c.integrationId,
              postMode: c.postMode,
              postIds: c.postIds,
              scheduledPostId: c.scheduledPostId,
            })),
        },
        id
      );
    } else {
      if (body.channels) failAutomation('V1_CHANNELS_UNSUPPORTED');
      if (!body.expectedUpdatedAt) failAutomation('UPDATED_AT_REQUIRED');
      if (body.expectedUpdatedAt !== old.updatedAt)
        failAutomation('REVISION_CONFLICT', 409);
      validateLegacyCanvas(
        body,
        old.configuration?.aliasMediaIds ||
          ('aliases' in old ? old.aliases.map((a) => a.aliasMediaId) : [])
      );
      await this.flows.saveCanvas(
        scope.organizationId,
        id,
        body,
        scope.profileId
      );
    }
    return this.detail(scope, id, version);
  }
  async repost(scope: FlowScope, raw: unknown) {
    const parsed = repostRequestSchema.safeParse(raw);
    if (!parsed.success) failAutomation('INVALID_REPOST_REQUEST');
    const q = parsed.data;
    const s = this.repostService;
    if (q.operation === 'sources')
      return s.sourceCandidates(scope.organizationId, scope.profileId);
    if (q.operation === 'destinations')
      return s.destinationCandidates(
        scope.organizationId,
        q.sourceType,
        scope.profileId
      );
    if (q.operation === 'list')
      return s.getRules(scope.organizationId, scope.profileId);
    if (q.operation === 'create') {
      const c = repostConfigurationSchema.safeParse(q.configuration);
      if (!c.success) failAutomation('INVALID_REPOST_CONFIG');
      return s.createRule(
        scope.organizationId,
        scope.profileId,
        this.validateRepostDto(CreateRepostRuleDto, c.data)
      );
    }
    if (!q.ruleId) failAutomation('RULE_ID_REQUIRED');
    if (q.operation === 'get')
      return s.getRule(scope.organizationId, q.ruleId, scope.profileId);
    if (q.operation === 'update') {
      if (!q.configuration || !Object.keys(q.configuration).length)
        failAutomation('INVALID_REPOST_CONFIG');
      return s.updateRule(
        scope.organizationId,
        q.ruleId,
        this.validateRepostDto(UpdateRepostRuleDto, q.configuration),
        scope.profileId
      );
    }
    if (q.operation === 'toggle') {
      if (q.enabled === undefined) failAutomation('ENABLED_REQUIRED');
      return s.toggleRule(
        scope.organizationId,
        q.ruleId,
        q.enabled,
        scope.profileId
      );
    }
    if (q.operation === 'archive')
      return s.deleteRule(scope.organizationId, q.ruleId, scope.profileId);
    if (q.operation === 'run_now')
      return s.runNow(scope.organizationId, q.ruleId, scope.profileId);
    if (q.operation === 'reset_checkpoint')
      return s.resetCheckpoint(scope.organizationId, q.ruleId, scope.profileId);
    return s.getLogs(
      scope.organizationId,
      q.ruleId,
      q.page || 1,
      q.limit || 20,
      scope.profileId
    );
  }
  private validateRepostDto<T extends object>(
    type: new () => T,
    data: unknown
  ): T {
    const dto = plainToInstance(type, data);
    if (
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length
    )
      failAutomation('INVALID_REPOST_CONFIG');
    return dto;
  }
}
