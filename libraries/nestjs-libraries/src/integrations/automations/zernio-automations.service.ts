import { HttpException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FlowStatus } from '@prisma/client';
import { ZernioAutomationsRepository } from '../../database/prisma/zernio-automations/zernio-automations.repository';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { OrganizationService } from '../../database/prisma/organizations/organization.service';
import type { FlowScope } from '../../dtos/flows/flow-v2.dto';
import type { AutomationConfiguration } from '../../dtos/flows/automation-management.dto';
import type { AutomationHistoryQueryDto } from '../../dtos/flows/automation-history.dto';
import { validateAutomationConfiguration } from './automation-management.contract';
import {
  ZernioAutomationClient,
  ZernioAutomationError,
} from './zernio-automation.client';
import {
  object,
  zernioDefinition,
  zernioFail,
  zernioPayload,
  type ZernioDefinition,
} from './zernio-automation.contract';
import { zernioHistory } from './zernio-automation.history';
type Row = Awaited<ReturnType<ZernioAutomationsRepository['get']>>;
const idString = (v: unknown) =>
  typeof v === 'string'
    ? v
    : typeof object(v)._id === 'string'
    ? (object(v)._id as string)
    : '';
const remoteId = (v: unknown) =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
@Injectable()
export class ZernioAutomationsService {
  constructor(
    private readonly repo: ZernioAutomationsRepository,
    private readonly api: ZernioAutomationClient,
    private readonly profiles: ProfileService,
    private readonly organizations: OrganizationService
  ) {}
  channels(scope: FlowScope) {
    return this.repo.channels(scope);
  }
  private async context(scope: FlowScope, integrationId: string) {
    const integration = await this.repo.integration(scope, integrationId);
    const profile = await this.profiles.getProfileById(
      scope.organizationId,
      scope.profileId
    );
    if (!profile) zernioFail('PROFILE_NOT_FOUND', 404);
    let meta: Record<string, any>;
    try {
      meta = object(JSON.parse(integration.customInstanceDetails || '{}'));
    } catch {
      zernioFail('ZERNIO_RECONNECT_REQUIRED', 412);
    }
    const accountId = meta.zernioAccountId,
      profileId = meta.zernioProfileId;
    if (!remoteId(accountId) || !remoteId(profileId))
      zernioFail('ZERNIO_RECONNECT_REQUIRED', 412);
    let key = await this.profiles.getDecryptedZernioApiKey(scope.profileId);
    if (
      !key &&
      (profile.isDefault ||
        (
          await this.organizations.getShareZernioWithProfiles(
            scope.organizationId
          )
        )?.shareZernioWithProfiles)
    )
      key = await this.organizations.getDecryptedZernioApiKey(
        scope.organizationId
      );
    if (!key) zernioFail('ZERNIO_KEY_REQUIRED', 412);
    let cursor = '';
    for (let page = 0; page < 5; page++) {
      const result = await this.api.request(
        key,
        '/accounts',
        'GET',
        undefined,
        {
          profileId,
          platform: 'instagram',
          limit: '100',
          ...(cursor ? { cursor } : {}),
        }
      );
      if (!Array.isArray(result.accounts))
        zernioFail('ZERNIO_INVALID_RESPONSE', 502);
      const account = result.accounts.find(
        (a: unknown) => idString(object(a)._id) === accountId
      );
      if (account) {
        if (
          account.platform !== 'instagram' ||
          idString(account.profileId) !== profileId
        )
          zernioFail('ZERNIO_ACCOUNT_MISMATCH', 412);
        if (account.isActive !== true || account.needsReconnection === true)
          zernioFail('ZERNIO_AUTHORIZATION_REQUIRED', 412);
        if (
          Array.isArray(account.scopeAreas) &&
          !['comments', 'messaging'].every((x) =>
            account.scopeAreas.includes(x)
          )
        )
          zernioFail('ZERNIO_AUTHORIZATION_REQUIRED', 412);
        return {
          integration,
          key,
          accountId: accountId as string,
          profileId: profileId as string,
        };
      }
      cursor =
        typeof result.pagination?.nextCursor === 'string'
          ? result.pagination.nextCursor
          : '';
      if (!cursor) break;
    }
    zernioFail('ZERNIO_ACCOUNT_MISMATCH', 412);
  }
  async readiness(scope: FlowScope, id: string) {
    try {
      await this.context(scope, id);
      return { ready: true, checkedAt: new Date().toISOString() };
    } catch (error) {
      const reason =
        error instanceof HttpException &&
        typeof error.getResponse() === 'string'
          ? String(error.getResponse())
          : 'ZERNIO_UNAVAILABLE';
      return { ready: false, reason, checkedAt: new Date().toISOString() };
    }
  }
  async posts(scope: FlowScope, id: string) {
    const context = await this.context(scope, id);
    const response = await this.api.request(
      context.key,
      `/accounts/${context.accountId}/posts`
    );
    if (!Array.isArray(response.posts))
      zernioFail('ZERNIO_INVALID_RESPONSE', 502);
    const safeUrl = (v: unknown) =>
      typeof v === 'string' && /^https:\/\//.test(v)
        ? v.slice(0, 2048)
        : undefined;
    return {
      data: response.posts
        .filter(
          (p: unknown) =>
            typeof object(p).id === 'string' && /^\d{1,30}$/.test(object(p).id)
        )
        .map((p: Record<string, any>) => ({
          id: p.id,
          caption:
            typeof p.message === 'string' ? p.message.slice(0, 2200) : '',
          thumbnailUrl: safeUrl(p.picture),
          permalink: safeUrl(p.permalink),
          timestamp: p.createdTime,
        })),
      paging: {},
    };
  }
  private view(row: Row) {
    const d = zernioDefinition(row.definition);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      revision: row.revision,
      updatedAt: row.updatedAt?.toISOString(),
      executionVersion: 3 as const,
      engine: 'zernio' as const,
      integrationId: row.integrationId,
      integration: row.integration,
      quickEditable: true,
      configuration: d.configuration,
      syncState: d.sync.state,
      errorCode: d.sync.errorCode,
      channels: [
        {
          integrationId: row.integrationId,
          platform: 'instagram',
          postMode: d.configuration.postMode,
          postIds: d.configuration.postIds || [],
        },
      ],
    };
  }
  async get(scope: FlowScope, id: string) {
    return this.view(await this.repo.get(scope, id));
  }
  async list(scope: FlowScope, integrationId?: string) {
    return (await this.repo.list(scope, integrationId)).map((row) =>
      this.view(row)
    );
  }
  private configuration(input: unknown) {
    const c = validateAutomationConfiguration(input);
    zernioPayload(c);
    return c;
  }
  async create(scope: FlowScope, input: unknown) {
    const c = this.configuration(input);
    await this.repo.integration(scope, c.integrationId);
    const row = await this.repo.create(scope, { ...c, activate: false });
    if (c.activate === false) return this.view(row);
    try {
      return await this.status(scope, row.id, row.revision, 'ACTIVE');
    } catch (error) {
      return {
        ...(await this.get(scope, row.id)),
        saved: true,
        activationError: this.code(error),
        message: 'AUTOMATION_SAVED_REVIEW_BEFORE_RETRY',
      };
    }
  }
  private revision(row: Row, expected?: number) {
    if (!Number.isInteger(expected)) zernioFail('REVISION_REQUIRED');
    if (row.revision !== expected) zernioFail('REVISION_CONFLICT', 409);
    if (row.status === 'ARCHIVED') zernioFail('FLOW_NOT_FOUND', 404);
  }
  async update(
    scope: FlowScope,
    id: string,
    input: { configuration: unknown; expectedRevision?: number }
  ) {
    const row = await this.repo.get(scope, id);
    this.revision(row, input.expectedRevision);
    const old = zernioDefinition(row.definition),
      patch = object(input.configuration);
    if (
      patch.activate !== undefined ||
      (patch.integrationId !== undefined &&
        patch.integrationId !== row.integrationId) ||
      (patch.platform !== undefined && patch.platform !== 'instagram') ||
      (patch.triggerType !== undefined &&
        patch.triggerType !== 'comment_on_post')
    )
      zernioFail('IMMUTABLE_AUTOMATION_ORIGIN');
    const c = this.configuration({ ...old.configuration, ...patch });
    if (old.sync.state !== 'idle') return this.reconcile(scope, row);
    if (!old.remote)
      return this.view(
        await this.repo.write(scope, id, row.revision, {
          ...old,
          configuration: c,
        })
      );
    return this.mutate(
      scope,
      row,
      c,
      row.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      'update'
    );
  }
  async status(
    scope: FlowScope,
    id: string,
    expected: number | undefined,
    status: string
  ) {
    if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status))
      zernioFail('ZERNIO_STATUS_UNSUPPORTED');
    const row = await this.repo.get(scope, id);
    this.revision(row, expected);
    const d = zernioDefinition(row.definition);
    if (d.sync.state !== 'idle') return this.reconcile(scope, row);
    if (!d.remote && status !== 'ACTIVE')
      return this.view(
        await this.repo.write(scope, id, row.revision, d, status as FlowStatus)
      );
    return this.mutate(
      scope,
      row,
      d.configuration,
      status as 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
      'status'
    );
  }
  private code(error: unknown) {
    const body = error instanceof HttpException ? error.getResponse() : null;
    return typeof body === 'string' && /^[A-Z][A-Z0-9_]{1,100}$/.test(body)
      ? body
      : 'ZERNIO_OUTCOME_UNKNOWN';
  }
  private async remote(
    context: Awaited<ReturnType<ZernioAutomationsService['context']>>,
    d: ZernioDefinition
  ) {
    const b = d.remote;
    if (
      !b ||
      b.accountId !== context.accountId ||
      b.profileId !== context.profileId ||
      !remoteId(b.automationId)
    )
      zernioFail('ZERNIO_ACCOUNT_MISMATCH', 412);
    const result = await this.api.request(
      context.key,
      `/comment-automations/${b.automationId}`
    );
    const a = object(result.automation);
    if (
      a.id !== b.automationId ||
      idString(a.accountId) !== context.accountId ||
      a.platform !== 'instagram'
    )
      zernioFail('ZERNIO_ACCOUNT_MISMATCH', 412);
    return a;
  }
  private async mutate(
    scope: FlowScope,
    row: Row,
    c: AutomationConfiguration,
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    type: 'update' | 'status'
  ) {
    let d = zernioDefinition(row.definition);
    const context = await this.context(scope, row.integrationId);
    if (d.remote) await this.remote(context, d);
    const confirmedTarget =
      d.remote &&
      d.configuration.postMode === 'specific' &&
      d.configuration.postIds?.[0] === c.postIds?.[0];
    // The provider only lists recent posts. An already confirmed target does not
    // become invalid merely because it aged out of that discovery window.
    if (c.postMode === 'specific' && !confirmedTarget) {
      const posts = await this.posts(scope, row.integrationId);
      if (!posts.data.some((p: { id: string }) => p.id === c.postIds![0]))
        zernioFail('ZERNIO_POST_UNAVAILABLE', 412);
    }
    let operation = {
      phase: 'create_paused' as 'create_paused' | 'apply',
      id: randomUUID(),
      type: d.remote ? type : ('create' as const),
      startedAt: new Date().toISOString(),
      desiredStatus: status,
      configuration: c,
    };
    let reserved = await this.repo.write(scope, row.id, row.revision, {
      ...d,
      sync: { state: 'pending', operation },
    });
    d = zernioDefinition(reserved.definition);
    let phase: string = d.remote ? 'patch' : 'create';
    try {
      if (!d.remote) {
        const result = await this.api.request(
          context.key,
          '/comment-automations',
          'POST',
          {
            ...zernioPayload(c),
            name: `${c.name} [MultiPost:${row.id}]`,
            profileId: context.profileId,
            accountId: context.accountId,
            isActive: false,
          }
        );
        const id = object(result.automation).id;
        if (!remoteId(id))
          throw new ZernioAutomationError('ZERNIO_OUTCOME_UNKNOWN', 502, true);
        phase = 'persist';
        d = {
          ...d,
          remote: {
            automationId: id,
            accountId: context.accountId,
            profileId: context.profileId,
          },
        };
        reserved = await this.repo.write(scope, row.id, reserved.revision, d);
        await this.remote(context, d);
      }
      operation = { ...operation, phase: 'apply' };
      d = { ...d, sync: { state: 'pending', operation } };
      phase = 'persist';
      reserved = await this.repo.write(scope, row.id, reserved.revision, d);
      phase = 'patch';
      await this.api.request(
        context.key,
        `/comment-automations/${d.remote!.automationId}`,
        'PATCH',
        { ...zernioPayload(c), isActive: status === 'ACTIVE' }
      );
      phase = 'verify';
      const remote = await this.remote(context, d);
      if (remote.isActive !== (status === 'ACTIVE'))
        throw new ZernioAutomationError('ZERNIO_OUTCOME_UNKNOWN', 502, true);
      return this.view(
        await this.repo.write(
          scope,
          row.id,
          reserved.revision,
          { ...d, configuration: c, sync: { state: 'idle' } },
          status
        )
      );
    } catch (error) {
      const uncertain =
        !(error instanceof ZernioAutomationError) ||
        error.uncertain ||
        !['create', 'patch'].includes(phase);
      let revision = reserved.revision;
      try {
        const failed = await this.repo.write(scope, row.id, revision, {
          ...d,
          sync: {
            state: uncertain ? 'unknown' : 'idle',
            ...(uncertain ? { operation } : {}),
            errorCode: this.code(error),
          },
        });
        revision = failed.revision;
      } catch {
        /* Durable reservation remains pending if persistence is unavailable. Never retry the POST. */
      }
      throw new HttpException(
        {
          message: uncertain ? 'ZERNIO_OUTCOME_UNKNOWN' : this.code(error),
          id: row.id,
          executionVersion: 3,
          revision,
          saved: true,
          syncState: uncertain ? 'unknown' : 'idle',
        },
        uncertain
          ? 502
          : error instanceof HttpException
          ? error.getStatus()
          : 502
      );
    }
  }
  private matches(a: Record<string, any>, c: AutomationConfiguration) {
    const p = zernioPayload(c);
    return [
      'trigger',
      'keywords',
      'matchMode',
      'platformPostId',
      'dmMessage',
      'dmMessageVariations',
      'buttons',
      'commentReply',
      'commentReplyVariations',
    ].every(
      (k) =>
        JSON.stringify(
          a[k] ?? (Array.isArray(p[k]) ? [] : p[k] === null ? null : '')
        ) === JSON.stringify(p[k])
    );
  }
  private async reconcile(scope: FlowScope, row: Row): Promise<never> {
    const d = zernioDefinition(row.definition),
      op = d.sync.operation;
    if (
      d.sync.state === 'pending' ||
      !op ||
      Date.now() - new Date(op.startedAt).getTime() < 30000
    )
      zernioFail('ZERNIO_OPERATION_IN_PROGRESS', 409);
    const context = await this.context(scope, row.integrationId);
    let bound = d;
    if (!d.remote) {
      const result = await this.api.request(
        context.key,
        '/comment-automations',
        'GET',
        undefined,
        { profileId: context.profileId }
      );
      const matches = Array.isArray(result.automations)
        ? result.automations.filter(
            (a: Record<string, any>) =>
              a.name === `${op.configuration.name} [MultiPost:${row.id}]` &&
              idString(a.accountId) === context.accountId &&
              a.platform === 'instagram' &&
              this.matches(a, op.configuration)
          )
        : [];
      if (matches.length !== 1 || !remoteId(matches[0].id))
        zernioFail('ZERNIO_RECONCILIATION_REQUIRED', 409);
      bound = {
        ...d,
        remote: {
          automationId: matches[0].id,
          accountId: context.accountId,
          profileId: context.profileId,
        },
      };
    }
    const remote = await this.remote(context, bound);
    const expected = op.desiredStatus === 'ACTIVE';
    const createdPaused =
      op.type === 'create' &&
      op.phase === 'create_paused' &&
      remote.isActive === false;
    if (
      !this.matches(remote, op.configuration) ||
      (!createdPaused && remote.isActive !== expected)
    )
      zernioFail('ZERNIO_RECONCILIATION_REQUIRED', 409);
    const recovered = await this.repo.write(
      scope,
      row.id,
      row.revision,
      { ...bound, configuration: op.configuration, sync: { state: 'idle' } },
      createdPaused ? 'PAUSED' : op.desiredStatus
    );
    throw new HttpException(
      {
        message: 'ZERNIO_RECOVERED_RETRY_ACTION',
        id: row.id,
        revision: recovered.revision,
        executionVersion: 3,
        recovered: true,
        actionApplied: false,
      },
      409
    );
  }
  private async logContext(scope: FlowScope, id: string) {
    const row = await this.repo.get(scope, id),
      d = zernioDefinition(row.definition);
    const ctx = await this.context(scope, row.integrationId);
    if (d.remote) await this.remote(ctx, d);
    return { row, d, ctx };
  }
  async history(
    scope: FlowScope,
    id: string,
    query: AutomationHistoryQueryDto,
    executionId?: string
  ) {
    const { row, d, ctx } = await this.logContext(scope, id);
    if (!d.remote) {
      if (executionId) zernioFail('EXECUTION_NOT_FOUND', 404);
      return { items: [], nextCursor: null };
    }
    return zernioHistory({
      scope,
      flowId: id,
      integrationId: row.integrationId,
      accountName: ctx.integration.name,
      query,
      executionId,
      read: (skip, limit) =>
        this.api.request(
          ctx.key,
          `/comment-automations/${d.remote!.automationId}/logs`,
          'GET',
          undefined,
          { skip: String(skip), limit: String(limit) }
        ),
    });
  }
}
