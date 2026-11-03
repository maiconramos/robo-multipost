import { parseFragment } from 'parse5';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  PostManagementRepository,
  ManagedPostSnapshot,
  ManagedPostWrite,
  guardPostWindow,
  postError,
} from './post-management.repository';
import { PostsService } from './posts.service';
import { ProfileService } from '../profiles/profile.service';
import { ShortLinkService } from '../../../short-linking/short.link.service';
import {
  managedPostActionSchema,
  managedPostListSchema,
  managedPostOptionsSchema,
  managedPostPatchSchema,
  type PostScope,
  type ManagedPostConfiguration,
} from '../../../dtos/posts/post-management.dto';
import type { CreatePostDto } from '../../../dtos/posts/create.post.dto';
import { isAllowedMediaPath, isRemoteMediaPath } from './media.path.guard';
import { checkPublicHttpsUrl } from '../../../dtos/validators/is-public-https-url.validator';
import { socialIntegrationList } from '../../../integrations/integration.manager';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import {
  countPostContent,
  countLengthUnit,
} from '@gitroom/helpers/utils/count.length';
import {
  coerceJsonSettingValue,
  stringKeysOf,
} from '../../../chat/tools/settings.value.coercion';

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) postError('INVALID_POST_MANAGEMENT_INPUT');
  return result.data;
}
function object(raw: string | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    return postError('POST_STORED_CONFIG_INVALID', 409);
  }
}
function media(raw: string | null) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.map((m) => ({
      id: String(m.id || ''),
      path: String(m.path || ''),
      ...(m.alt !== undefined ? { alt: m.alt } : {}),
      ...(m.thumbnail ? { thumbnail: m.thumbnail } : {}),
    }));
  } catch {
    return postError('POST_STORED_MEDIA_INVALID', 409);
  }
}
@Injectable()
export class PostManagementService {
  constructor(
    private readonly repo: PostManagementRepository,
    private readonly posts: PostsService,
    private readonly profiles: ProfileService,
    private readonly shortLinks: ShortLinkService
  ) {}
  async scope(organizationId: string, profileId?: string): Promise<PostScope> {
    if (!organizationId) postError('ORGANIZATION_REQUIRED', 401);
    const profile = profileId
      ? await this.profiles.getProfileById(organizationId, profileId)
      : await this.profiles.getDefaultProfile(organizationId);
    if (!profile) postError('PROFILE_NOT_FOUND', 404);
    return { organizationId, profileId: profile.id };
  }
  capabilities() {
    return {
      contractVersion: 1,
      configurationFields: Object.keys(
        managedPostPatchSchema.shape.configuration.shape
      ),
      actions: managedPostActionSchema.shape.operation.options,
      concurrency:
        'expectedVersion from detail; includes full message chain and tags',
      scope:
        'one destination validated against organization/profile; REST legacy without profile resolves Default; MCP organization credential must select profile per client operation, with a separate organization-wide read list',
      messages:
        'Full chain when provided. Root ID and existing child IDs are retained. New children omit id.',
      settings:
        'key/value JSON strings; merge by default; removeSettingKeys explicitly deletes optional fields',
      shortLink:
        'transformation of supplied messages, not persisted state; false does not undo URLs',
      publishedEditing:
        'localOnly=true; no remote edit and no automatic republish',
      recurrence:
        'unpublished interval editable; published local edit never restarts recurrence; cancel stops future cycles; explicit schedule/publish_now with republish=true restarts',
      deletion:
        'local soft delete of this destination chain; remote content and automation targets retained',
      queueProtectionSeconds: 60,
      scheduleSync:
        'Serialized between managed operations; real Temporal RPC deadline; saved=true on partial failure. In-flight remote publication cannot be undone.',
      limits: {
        list: 100,
        messages: 100,
        mediaPerMessage: 100,
        settings: 100,
        tags: 100,
      },
      providerDiscovery:
        'GET /public/v1/integration-settings/:id or MCP integrationSchema',
      unsupported: [
        'Remote editing/deletion of already published social content',
        'Marketplace orders, client approval and billing administration',
      ],
    };
  }
  private project(snapshot: ManagedPostSnapshot) {
    const root = snapshot.rows[0];
    const settings = object(root.settings);
    return {
      id: root.id,
      deleted: !!root.deletedAt,
      version: snapshot.version,
      state: root.state,
      profile: root.profile || null,
      profileId: root.profileId,
      integrationId: root.integrationId,
      integration: {
        id: root.integration.id,
        name: root.integration.name,
        providerIdentifier: root.integration.providerIdentifier,
        picture: root.integration.picture,
      },
      group: root.group,
      updatedAt: root.updatedAt.toISOString(),
      releaseId: root.releaseId,
      releaseURL: root.releaseURL,
      hasError: !!root.error,
      configuration: {
        date: root.publishDate.toISOString(),
        messages: snapshot.rows.map((row) => ({
          id: row.id,
          content: row.content,
          delay: row.delay,
          media: media(row.image),
        })),
        settings: Object.entries(settings)
          .filter(([key]) => key !== '__type')
          .map(([key, value]) => ({ key, value: JSON.stringify(value) })),
        tags: root.tags.map((t) => ({ value: t.tag.id, label: t.tag.name })),
        intervalInDays: root.intervalInDays,
      },
    };
  }
  async detail(scope: PostScope, id: string, includeDeleted = false) {
    return this.project(
      await this.repo.detail(scope, id, undefined, includeDeleted)
    );
  }
  async list(scope: PostScope, raw: unknown) {
    const q = parse(managedPostListSchema, raw);
    if (q.startDate && q.endDate && new Date(q.startDate) > new Date(q.endDate))
      postError('INVALID_POST_DATE_RANGE');
    if (q.integrationId && !(await this.repo.channel(scope, q.integrationId)))
      postError('CHANNEL_NOT_FOUND', 404);
    if (q.cursor) await this.repo.detail(scope, q.cursor);
    const result = await this.repo.list(scope, q);
    return this.projectList(result);
  }
  async listOrganization(organizationId: string, raw: unknown) {
    if (!organizationId) postError('ORGANIZATION_REQUIRED', 401);
    const q = parse(managedPostListSchema, raw);
    if (q.startDate && q.endDate && new Date(q.startDate) > new Date(q.endDate))
      postError('INVALID_POST_DATE_RANGE');
    if (q.integrationId)
      await this.repo.assertOrganizationChannel(
        organizationId,
        q.integrationId
      );
    if (q.cursor)
      await this.repo.assertOrganizationCursor(organizationId, q.cursor, q);
    return this.projectList(
      await this.repo.listOrganization(organizationId, q)
    );
  }
  private projectList(
    result: Awaited<ReturnType<PostManagementRepository['list']>>
  ) {
    return {
      posts: result.rows.map((row) => ({
        id: row.id,
        profile: row.profile || null,
        profileId: row.profileId,
        state: row.state,
        date: row.publishDate.toISOString(),
        content: row.content,
        integration: {
          id: row.integration.id,
          name: row.integration.name,
          providerIdentifier: row.integration.providerIdentifier,
          picture: row.integration.picture,
        },
        group: row.group,
        releaseId: row.releaseId,
        releaseURL: row.releaseURL,
        intervalInDays: row.intervalInDays,
      })),
      nextCursor: result.nextCursor,
    };
  }
  async options(scope: PostScope, raw: unknown) {
    const q = parse(managedPostOptionsSchema, raw);
    if (q.resource === 'capabilities') return this.capabilities();
    if (q.resource === 'tags') return this.repo.tags(scope);
    if (!q.integrationId || !(await this.repo.channel(scope, q.integrationId)))
      postError('CHANNEL_NOT_FOUND', 404);
    return {
      date: await this.posts.findFreeDateTime(
        scope.organizationId,
        q.integrationId,
        scope.profileId
      ),
    };
  }
  async assertAnalyticsScope(
    scope: PostScope,
    target: 'channel' | 'post',
    id: string
  ) {
    if (target === 'channel') {
      if (!(await this.repo.channel(scope, id)))
        postError('CHANNEL_NOT_FOUND', 404);
    } else await this.repo.detail(scope, id);
  }
  async assertMediaScope(
    scope: PostScope,
    media: Array<{ id?: string; path?: string; thumbnail?: string }>,
    settings: Record<string, unknown>,
    contents: string[] = []
  ) {
    const refs: Array<{ id?: string; path?: string }> = [];
    const queue: unknown[] = [media, settings];
    let inspected = 0;
    while (queue.length) {
      if (++inspected > 50000) postError('POST_MEDIA_REFERENCES_LIMIT');
      const value = queue.pop();
      if (
        typeof value === 'string' &&
        (/^https?:\/\//.test(value) || value.startsWith('/'))
      )
        refs.push({ path: value });
      else if (Array.isArray(value)) queue.push(...value);
      else if (value && typeof value === 'object') {
        const item = value as Record<string, unknown>;
        if (typeof item.id === 'string' && typeof item.path === 'string')
          refs.push({ id: item.id, path: item.path });
        queue.push(...Object.values(item));
      }
    }
    const nodes: any[] = contents.map((content) => parseFragment(content));
    while (nodes.length) {
      const node = nodes.pop();
      if (node.nodeName === 'img') {
        const path = node.attrs?.find(
          (a: { name: string }) => a.name === 'src'
        )?.value;
        if (path) refs.push({ path });
      }
      if (node.childNodes) nodes.push(...node.childNodes);
    }
    await this.repo.assertMediaScope(scope, refs);
  }
  private current(
    snapshot: ManagedPostSnapshot,
    expected: string,
    enforceWindow = true
  ) {
    if (snapshot.version !== expected) postError('POST_VERSION_CONFLICT', 409);
    if (enforceWindow) guardPostWindow(snapshot.rows[0]);
  }
  private async validate(
    scope: PostScope,
    old: ManagedPostSnapshot,
    patch: ManagedPostConfiguration,
    schedule = false
  ): Promise<ManagedPostWrite> {
    const root = old.rows[0];
    const oldSettings = object(root.settings);
    const settings = { ...oldSettings };
    const provider = socialIntegrationList.find(
      (p) => p.identifier === root.integration.providerIdentifier
    );
    if (!provider) postError('UNSUPPORTED_PROVIDER');
    const stringKeys = stringKeysOf(provider.dto);
    const seen = new Set<string>();
    for (const field of patch.settings || []) {
      if (
        ['__type', '__proto__', 'prototype', 'constructor'].includes(
          field.key
        ) ||
        seen.has(field.key)
      )
        postError('POST_SETTING_KEY_INVALID');
      seen.add(field.key);
      settings[field.key] = coerceJsonSettingValue(
        stringKeys,
        field.key,
        field.value
      );
    }
    for (const key of patch.removeSettingKeys || []) {
      if (
        ['__type', '__proto__', 'prototype', 'constructor'].includes(key) ||
        seen.has(key)
      )
        postError('POST_SETTING_KEY_INVALID');
      delete settings[key];
    }
    settings.__type = root.integration.providerIdentifier;
    const messages = patch.messages || this.project(old).configuration.messages;
    if (patch.shortLink && !patch.messages)
      postError('POST_MESSAGES_REQUIRED_FOR_SHORTLINK');
    for (const message of messages)
      for (const item of message.media || []) {
        if (
          !isAllowedMediaPath(item.path) ||
          (isRemoteMediaPath(item.path) && checkPublicHttpsUrl(item.path)) ||
          (item.thumbnail && checkPublicHttpsUrl(item.thumbnail))
        )
          postError('POST_MEDIA_PATH_INVALID');
      }
    if (patch.messages || patch.settings)
      await this.assertMediaScope(
        scope,
        patch.messages?.flatMap((m) => m.media) || [],
        settings,
        patch.messages?.map((m) => m.content) || []
      );
    const contents = patch.shortLink
      ? await this.shortLinks.convertTextToShortLinks(
          scope.organizationId,
          messages.map((m) => m.content)
        )
      : messages.map((m) => m.content);
    const raw = {
      type: schedule || root.state !== 'DRAFT' ? 'schedule' : 'draft',
      date: patch.date || root.publishDate.toISOString(),
      shortLink: false,
      tags: patch.tags || this.project(old).configuration.tags,
      posts: [
        {
          integration: { id: root.integrationId },
          settings,
          value: messages.map((m, i) => ({
            id: m.id,
            content: contents[i],
            delay: m.delay || 0,
            image: m.media,
          })),
        },
      ],
    } as CreatePostDto;
    const validated = await this.posts.mapTypeToPost(raw, scope.organizationId);
    const value = validated.posts[0];
    let verified = false;
    try {
      verified =
        JSON.parse(root.integration.additionalSettings || '[]')?.find(
          (field: { title?: string; value?: unknown }) =>
            field.title === 'Verified'
        )?.value === true;
    } catch {
      /* Missing legacy metadata uses the regular provider limit. */
    }
    for (const [index, message] of value.value.entries()) {
      const length = countPostContent(
        provider.identifier,
        message.content,
        value.settings,
        index
      );
      if (
        length >
        (provider.maxLength(
          verified,
          index === 0 ? value.settings : undefined
        ) || 1000000)
      )
        postError(
          countLengthUnit(provider.identifier) === 'bytes'
            ? 'POST_CONTENT_TOO_LONG_BYTES'
            : 'POST_CONTENT_TOO_LONG'
        );
    }
    return {
      ...(patch.date ? { date: patch.date } : {}),
      ...(patch.messages
        ? {
            messages: value.value.map((m) => ({
              id: m.id,
              content: m.content,
              delay: m.delay,
              media: m.image,
            })),
          }
        : {}),
      ...(patch.settings || patch.removeSettingKeys
        ? { settings: value.settings as unknown as Record<string, unknown> }
        : {}),
      ...(patch.tags ? { tagIds: patch.tags.map((t) => t.value) } : {}),
      ...(patch.intervalInDays !== undefined
        ? { intervalInDays: patch.intervalInDays }
        : {}),
    };
  }
  private async synchronize(
    scope: PostScope,
    snapshot: ManagedPostSnapshot,
    stopOnly = false
  ) {
    const root = snapshot.rows[0];
    const provider = root.integration.providerIdentifier;
    await this.posts.startWorkflow(
      provider.startsWith('zernio-')
        ? 'main'
        : provider.split('-')[0].toLowerCase(),
      root.id,
      scope.organizationId,
      root.state,
      { id: root.integrationId, providerIdentifier: provider },
      { strict: true, ...(stopOnly ? { stopOnly: true } : {}) }
    );
  }
  private async result(
    scope: PostScope,
    saved: ManagedPostSnapshot,
    sync: boolean,
    stopOnly = false,
    assertLease: () => Promise<void> = async () => {}
  ) {
    const detail = this.project(saved);
    try {
      if (sync) {
        await assertLease();
        await this.synchronize(scope, saved, stopOnly);
      }
    } catch {
      return {
        ...detail,
        saved: true,
        synchronizationError: 'POST_SCHEDULE_SYNC_FAILED',
        recovery:
          saved.rows[0].state === 'PUBLISHED' || saved.rows[0].deletedAt
            ? 'get detail with includeDeleted if needed, then call stop with current version'
            : saved.rows[0].state === 'QUEUE' &&
              saved.rows[0].publishDate.getTime() <= Date.now() + 60000
            ? 'inspect remote result before retry_publish with explicit republish=true; stop remains available'
            : 'get current detail and call sync; never recreate this post',
      };
    }
    return {
      ...detail,
      saved: true,
      ...(sync ? { scheduleSynchronized: true } : { localOnly: true }),
    };
  }
  async update(scope: PostScope, id: string, raw: unknown) {
    const input = parse(managedPostPatchSchema, raw);
    if (!Object.keys(input.configuration).length) postError('POST_PATCH_EMPTY');
    return this.repo.lock(scope, id, async (assertLease = async () => {}) => {
      const old = await this.repo.detail(scope, id);
      this.current(old, input.expectedVersion);
      const root = old.rows[0];
      if (root.state === 'PUBLISHED' && input.localOnly !== true)
        postError('PUBLISHED_POST_LOCAL_ONLY');
      if (
        root.state === 'PUBLISHED' &&
        input.configuration.intervalInDays !== undefined &&
        input.configuration.intervalInDays !== root.intervalInDays
      )
        postError('RESCHEDULE_REQUIRED_FOR_RECURRENCE');
      if (
        input.configuration.date &&
        new Date(input.configuration.date).getTime() <= Date.now() + 60000 &&
        root.state === 'QUEUE'
      )
        postError('POST_SCHEDULE_DATE_TOO_CLOSE');
      const change = await this.validate(scope, old, input.configuration);
      await assertLease();
      const saved = await this.repo.write(
        scope,
        id,
        input.expectedVersion,
        change
      );
      return this.result(
        scope,
        saved,
        root.state === 'QUEUE',
        false,
        assertLease
      );
    });
  }
  async action(scope: PostScope, id: string, raw: unknown) {
    const input = parse(managedPostActionSchema, raw);
    if (
      (input.date && input.operation !== 'schedule') ||
      (input.republish !== undefined &&
        !['schedule', 'publish_now', 'retry_publish'].includes(input.operation))
    )
      postError('POST_ACTION_OPTION_UNSUPPORTED');
    return this.repo.lock(scope, id, async (assertLease = async () => {}) => {
      const old = await this.repo.detail(
        scope,
        id,
        undefined,
        input.operation === 'stop'
      );
      this.current(
        old,
        input.expectedVersion,
        !['stop', 'sync', 'retry_publish'].includes(input.operation)
      );
      const root = old.rows[0];
      if (input.operation === 'stop') {
        // Persist the stop before terminating Temporal: the missing-post
        // recovery must not recreate a workflow for a still-queued record.
        await assertLease();
        const saved = root.deletedAt
          ? old
          : await this.repo.write(scope, id, input.expectedVersion, {
              ...(root.state !== 'PUBLISHED' ? { state: 'DRAFT' } : {}),
              intervalInDays: null,
              allowPublicationWindow: true,
            });
        return {
          ...(await this.result(scope, saved, true, true, assertLease)),
          inFlightPublicationMayComplete: true,
        };
      }
      if (input.operation === 'sync') {
        if (!['QUEUE', 'DRAFT'].includes(root.state))
          postError('POST_SYNC_STATE_UNSUPPORTED');
        if (
          root.state === 'QUEUE' &&
          root.publishDate.getTime() <= Date.now() + 60000
        )
          return {
            ...this.project(old),
            saved: true,
            synchronizationError: 'POST_PUBLICATION_OUTCOME_REVIEW_REQUIRED',
            recovery:
              'inspect remote result; stop can terminate future execution, retry_publish requires explicit republish=true intent',
          };
        return this.result(
          scope,
          old,
          true,
          root.state === 'DRAFT',
          assertLease
        );
      }
      if (
        ['schedule', 'publish_now', 'retry_publish'].includes(input.operation)
      ) {
        if (
          (root.state === 'PUBLISHED' || input.operation === 'retry_publish') &&
          input.republish !== true
        )
          postError('REPUBLISH_REQUIRES_EXPLICIT_INTENT');
        if (root.integration.disabled || root.integration.deletedAt)
          postError('POST_CHANNEL_UNAVAILABLE', 412);
        if (
          input.operation === 'schedule' &&
          (!input.date || new Date(input.date).getTime() <= Date.now() + 60000)
        )
          postError('POST_SCHEDULE_DATE_TOO_CLOSE');
        const date =
          input.operation !== 'schedule'
            ? new Date().toISOString()
            : input.date;
        await this.validate(scope, old, { date }, true);
        await assertLease();
        const saved = await this.repo.write(scope, id, input.expectedVersion, {
          date,
          state: 'QUEUE',
          resetRelease: true,
          ...(input.operation === 'retry_publish'
            ? { allowPublicationWindow: true }
            : {}),
        });
        return this.result(scope, saved, true, false, assertLease);
      }
      const deleted = input.operation === 'delete';
      await assertLease();
      const saved = await this.repo.write(scope, id, input.expectedVersion, {
        ...(deleted
          ? { deleted: true }
          : root.state !== 'PUBLISHED'
          ? { state: 'DRAFT' }
          : {}),
        intervalInDays: null,
      });
      const result = await this.result(scope, saved, true, true, assertLease);
      return {
        ...result,
        ...(deleted
          ? { deleted: true, remotePostDeleted: false }
          : { cancelled: true }),
        inFlightPublicationMayComplete: true,
      };
    });
  }
}
