import { parseFacebookMessengerWebhook } from './facebook-messenger-webhook';
import {
  FacebookSystemUserService,
  FACEBOOK_SYSTEM_USER_PERMISSIONS,
} from './facebook-system-user.service';
import { SharedFlowEventsService } from '../../database/prisma/flows-v2/shared-flow-events.service';
import { HttpException, Injectable, Optional } from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { CredentialService } from '../../database/prisma/credentials/credential.service';
import { FacebookProvider } from '../social/facebook.provider';
import {
  FacebookAutomationSetupRepository,
  FacebookSetupConnection,
  FacebookSetupContext,
} from './facebook-automation-setup.repository';
import {
  MetaAutomationError,
  MetaAutomationGraphClient,
  record,
} from './meta-automation-graph.client';
import { FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS } from './facebook-comment-automation.adapter';
import { parseFacebookCommentWebhook } from './facebook-automation-webhook';
import { inspectFacebookMessengerWebhook } from './facebook-messenger-probe';
import { captureFacebookMessengerJson } from './facebook-messenger-full-capture';
import type {
  CompleteFacebookAutomationDto,
  FacebookSetupStage,
  FacebookSetupStatus,
  FacebookSetupView,
  FacebookAppWebhookView,
} from '../../dtos/integrations/facebook-automation.dto';

const WEBHOOK_CONNECTION_CACHE_MS = 60_000;
const WEBHOOK_CONNECTION_CACHE_MAX = 500;

@Injectable()
export class FacebookAutomationSetupService {
  constructor(
    private readonly repository: FacebookAutomationSetupRepository,
    private readonly credentials: CredentialService,
    private readonly provider: FacebookProvider,
    private readonly graph: MetaAutomationGraphClient,
    private readonly systemUser: FacebookSystemUserService,
    @Optional() private readonly sharedFlows?: SharedFlowEventsService
  ) {}

  private assertContext(context: FacebookSetupContext) {
    if (!context.organizationId || !context.profileId || !context.userId)
      throw new HttpException('PROFILE_REQUIRED', 403);
  }
  private async page(context: FacebookSetupContext, id: string) {
    this.assertContext(context);
    const page = await this.repository.getPage(context, id);
    if (!page || !/^\d{1,32}$/.test(page.internalId))
      throw new HttpException('PAGE_NOT_FOUND', 404);
    return page;
  }
  private async app(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>
  ) {
    const raw = await this.credentials.getRawShared(
      context.organizationId,
      'facebook',
      context.profileId
    );
    const client_id = raw?.clientId || process.env.FACEBOOK_APP_ID || '';
    const client_secret =
      raw?.clientSecret || process.env.FACEBOOK_APP_SECRET || '';
    if (!/^\d{1,32}$/.test(client_id) || !client_secret)
      throw new HttpException('APP_CREDENTIALS_REQUIRED', 412);
    return {
      client_id,
      client_secret,
      instanceUrl: '',
      facebookAutomation: true,
    };
  }
  private fingerprint(app: { client_id: string; client_secret: string }) {
    return createHash('sha256')
      .update(JSON.stringify([app.client_id, app.client_secret]))
      .digest('hex');
  }
  private connectionFingerprint(connection: FacebookSetupConnection) {
    return createHmac('sha256', connection.appSecret)
      .update(
        JSON.stringify([
          connection.appId,
          connection.pageId,
          connection.pageToken,
          this.callback(connection.appId),
          ...(connection.authorization ? [connection.authorization] : []),
        ])
      )
      .digest('hex');
  }
  private callback(appId: string) {
    const explicit = process.env.WEBHOOK_BASE_URL;
    const base = (explicit || process.env.FRONTEND_URL || '').replace(
      /\/+$/,
      ''
    );
    let url: URL;
    try {
      url = new URL(
        `${base}${explicit ? '' : '/api'}/public/facebook-automations/${appId}`
      );
    } catch {
      throw new HttpException('HTTPS_CALLBACK_REQUIRED', 412);
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new HttpException('HTTPS_CALLBACK_REQUIRED', 412);
    return url.toString();
  }
  private verifyToken(
    connection: Pick<FacebookSetupConnection, 'appId' | 'appSecret'>
  ) {
    return createHmac('sha256', connection.appSecret)
      .update(
        `multipost-facebook-webhook-v1:${this.callback(connection.appId)}`
      )
      .digest('hex');
  }
  private status(
    stage: FacebookSetupStage,
    reasons: string[] = [],
    missingPermissions: string[] = []
  ): FacebookSetupStatus {
    return {
      stage,
      reasons,
      missingPermissions,
      checkedAt: new Date().toISOString(),
      automaticRepliesAvailable: false,
    };
  }
  async viewWebhook(
    context: FacebookSetupContext
  ): Promise<FacebookAppWebhookView> {
    this.assertContext(context);
    const app = await this.app(context);
    const callbackUrl = this.callback(app.client_id);
    const pages = await this.repository.listPages(context);
    let authorized = false;
    for (const page of pages) {
      const connection = await this.repository.getConnection(
        context,
        app.client_id,
        page.internalId
      );
      if (
        connection?.organizationId === context.organizationId &&
        connection.profileId === context.profileId &&
        connection.integrationId === page.id &&
        connection.pageId === page.internalId &&
        connection.appId === app.client_id &&
        connection.appSecret === app.client_secret
      ) {
        authorized = true;
        break;
      }
    }
    return {
      appId: app.client_id,
      callbackUrl,
      verifyToken: authorized
        ? this.verifyToken({
            appId: app.client_id,
            appSecret: app.client_secret,
          })
        : null,
      authorizationRequired: !authorized,
    };
  }

  async list(context: FacebookSetupContext) {
    this.assertContext(context);
    return (await this.repository.listPages(context)).map((page) => ({
      id: page.id,
      pageId: page.internalId,
      name: page.name,
    }));
  }
  async view(
    context: FacebookSetupContext,
    id: string
  ): Promise<FacebookSetupView> {
    const page = await this.page(context, id);
    const app = await this.app(context);
    const saved = await this.repository.getConnection(
      context,
      app.client_id,
      page.internalId
    );
    const authorized =
      !!saved &&
      saved.integrationId === id &&
      saved.appId === app.client_id &&
      saved.appSecret === app.client_secret;
    return {
      integrationId: id,
      pageId: page.internalId,
      appId: app.client_id,
      callbackUrl: this.callback(app.client_id),
      verifyToken: authorized ? this.verifyToken(saved) : null,
      authorized,
      systemUserConfigured: await this.systemUser.available(context),
      authorization: authorized
        ? saved.authorization || { source: 'FACEBOOK_LOGIN' }
        : undefined,
      status: authorized
        ? await this.repository.getStatus(
            context,
            id,
            this.connectionFingerprint(saved)
          )
        : null,
      receipt: authorized
        ? await this.repository.getReceipt(context, id)
        : null,
    };
  }
  async useSystemUser(context: FacebookSetupContext, id: string) {
    const page = await this.page(context, id);
    const sourceRevision = await this.repository.getSourceRevision(context);
    if (!sourceRevision)
      throw new HttpException('SYSTEM_USER_TOKEN_REQUIRED', 412);
    const app = await this.app(context);
    const revision = await this.repository.getConnectionRevision(
      context,
      app.client_id,
      page.internalId
    );
    const derived = await this.systemUser.derive(context, page.internalId, app);
    const candidate: FacebookSetupConnection = {
      organizationId: context.organizationId,
      profileId: context.profileId,
      integrationId: id,
      pageId: page.internalId,
      appId: app.client_id,
      appSecret: app.client_secret,
      pageToken: derived.pageToken,
      authorization: derived.authorization,
    };
    let status: FacebookSetupStatus;
    try {
      status = await this.activateConnection(candidate, context, false);
    } catch {
      throw new HttpException('SYSTEM_USER_CHECK_FAILED', 412);
    }
    if (
      status.stage === 'AUTHORIZATION_REQUIRED' ||
      status.stage === 'CHECK_FAILED'
    )
      throw new HttpException(
        {
          message: 'SYSTEM_USER_PAGE_DENIED',
          missingPermissions: status.missingPermissions,
        },
        412
      );
    const currentPage = await this.page(context, id);
    const currentApp = await this.app(context);
    if (
      currentPage.internalId !== page.internalId ||
      this.fingerprint(currentApp) !== this.fingerprint(app)
    )
      throw new HttpException('AUTHORIZATION_CHANGED', 409);
    await this.systemUser.assertUnchanged(
      context,
      app,
      derived.sourceFingerprint
    );
    await this.repository.replaceConnection(
      candidate,
      revision,
      sourceRevision
    );
    // Authorization is committed. A cache failure must not imply that the previous token survived.
    try {
      await this.repository.saveStatus(
        context,
        id,
        status,
        this.connectionFingerprint(candidate)
      );
    } catch {
      status = this.status('CHECK_REQUIRED', ['STATUS_NOT_SAVED']);
    }
    return { integrationId: id, status };
  }

  async authorize(context: FacebookSetupContext, id: string) {
    await this.page(context, id);
    const app = await this.app(context);
    this.callback(app.client_id);
    const generated = await this.provider.generateAuthUrl(app);
    const state = `fbauto_${randomBytes(32).toString('hex')}`;
    const url = new URL(generated.url);
    url.searchParams.set('state', state);
    await this.repository.saveState(state, {
      ...context,
      integrationId: id,
      credentialFingerprint: this.fingerprint(app),
      codeVerifier: generated.codeVerifier,
      expiresAt: Date.now() + 600000,
    });
    return { url: url.toString() };
  }
  async complete(
    context: FacebookSetupContext,
    input: CompleteFacebookAutomationDto
  ) {
    this.assertContext(context);
    if (
      !/^fbauto_[a-f0-9]{64}$/.test(input.state) ||
      !input.code ||
      input.code.length > 4096
    )
      throw new HttpException('INVALID_INPUT', 400);
    const state = await this.repository.takeState(input.state);
    if (
      !state ||
      !Number.isFinite(state.expiresAt) ||
      state.expiresAt <= Date.now() ||
      (['organizationId', 'profileId', 'userId'] as const).some(
        (key) => state[key] !== context[key]
      )
    )
      throw new HttpException('OAUTH_STATE_INVALID', 409);
    const page = await this.page(context, state.integrationId);
    const app = await this.app(context);
    if (state.credentialFingerprint !== this.fingerprint(app))
      throw new HttpException('OAUTH_CREDENTIALS_CHANGED', 409);
    let connection: FacebookSetupConnection;
    try {
      const auth = await this.provider.authenticate(
        { code: input.code, codeVerifier: state.codeVerifier },
        app
      );
      const token = await this.graph.read(page.internalId, auth.accessToken, {
        fields: 'id,access_token',
      });
      if (
        token.id !== page.internalId ||
        typeof token.access_token !== 'string' ||
        !token.access_token
      )
        throw new HttpException('PAGE_TOKEN_REQUIRED', 412);
      connection = {
        organizationId: context.organizationId,
        profileId: context.profileId,
        integrationId: page.id,
        pageId: page.internalId,
        appId: app.client_id,
        appSecret: app.client_secret,
        pageToken: token.access_token,
      };
      const inspection = await this.inspectToken(connection);
      if (inspection.reasons.length)
        throw new HttpException(
          { message: 'AUTHORIZATION_INCOMPLETE', ...inspection },
          412
        );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('FACEBOOK_AUTHORIZATION_FAILED', 412);
    }
    // Recheck ownership and credentials after remote calls, before committing consent.
    await this.page(context, state.integrationId);
    if (
      state.credentialFingerprint !== this.fingerprint(await this.app(context))
    )
      throw new HttpException('OAUTH_CREDENTIALS_CHANGED', 409);
    await this.repository.saveConnection(connection);
    return {
      integrationId: page.id,
      status: await this.activate(context, page.id),
    };
  }
  private async inspectToken(
    connection: FacebookSetupConnection,
    messenger = false
  ) {
    const requiredPermissions = messenger
      ? ['pages_messaging', 'pages_manage_metadata']
      : connection.authorization?.source === 'SYSTEM_USER'
      ? FACEBOOK_SYSTEM_USER_PERMISSIONS
      : FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS;
    const debug = record(
      (
        await this.graph.read(
          'debug_token',
          `${connection.appId}|${connection.appSecret}`,
          { input_token: connection.pageToken }
        )
      ).data
    );
    const reasons: string[] = [];
    if (debug.is_valid !== true) reasons.push('TOKEN_INVALID');
    if (debug.app_id !== connection.appId) reasons.push('APP_MISMATCH');
    if (debug.type !== 'PAGE') reasons.push('PAGE_TOKEN_REQUIRED');
    if (
      debug.profile_id !== undefined &&
      debug.profile_id !== connection.pageId
    )
      reasons.push('PAGE_MISMATCH');
    for (const key of ['expires_at', 'data_access_expires_at']) {
      const value = debug[key];
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        (value > 0 && value * 1000 <= Date.now())
      )
        reasons.push('TOKEN_EXPIRED');
    }
    const missingPermissions = requiredPermissions.filter(
      (permission) =>
        !Array.isArray(debug.scopes) || !debug.scopes.includes(permission)
    );
    if (missingPermissions.length) reasons.push('PERMISSIONS_MISSING');
    for (const raw of Array.isArray(debug.granular_scopes)
      ? debug.granular_scopes
      : []) {
      const grant = record(raw);
      if (
        (requiredPermissions as readonly string[]).includes(
          grant.scope as (typeof FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS)[number]
        ) &&
        Array.isArray(grant.target_ids) &&
        !grant.target_ids.includes(connection.pageId)
      )
        reasons.push('PAGE_PERMISSION_MISSING');
    }
    if (
      !reasons.length &&
      (await this.graph.read('me', connection.pageToken, { fields: 'id' }))
        .id !== connection.pageId
    )
      reasons.push('PAGE_MISMATCH');
    return {
      reasons: [...new Set(reasons)],
      missingPermissions,
      tokenExpiresAt:
        typeof debug.expires_at === 'number' && debug.expires_at > 0
          ? new Date(debug.expires_at * 1000).toISOString()
          : null,
      dataAccessExpiresAt:
        typeof debug.data_access_expires_at === 'number' &&
        debug.data_access_expires_at > 0
          ? new Date(debug.data_access_expires_at * 1000).toISOString()
          : null,
      noScheduledExpiry: debug.expires_at === 0,
    };
  }

  /** Internal only: never return this credential-bearing object from a controller. */
  async authorizedConnection(context: FacebookSetupContext, id: string) {
    this.assertContext(context);
    return this.authorizedAccount(context, id);
  }

  async authorizedPostLookup(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    id: string
  ) {
    const connection = await this.authorizedAccount(context, id);
    await this.repository.consumePostLookupBudget(connection);
    return connection;
  }

  async authorizedAccount(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    id: string
  ) {
    const page = await this.repository.getPage(context, id);
    if (!page) throw new HttpException('PAGE_NOT_FOUND', 404);
    const app = await this.app(context);
    const connection = await this.repository.getConnection(
      context,
      app.client_id,
      page.internalId
    );
    if (
      !connection ||
      connection.integrationId !== id ||
      connection.pageId !== page.internalId ||
      connection.appId !== app.client_id ||
      connection.appSecret !== app.client_secret
    )
      throw new HttpException('AUTHORIZATION_REQUIRED', 412);
    return connection;
  }

  /** Checks current token, app callback and Page feed without subscribing or persisting status. */
  async inspectReceiving(context: FacebookSetupContext, id: string) {
    return this.activateConnection(
      await this.authorizedConnection(context, id),
      context,
      false
    );
  }

  async inspectAccount(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    id: string
  ) {
    const connection = await this.authorizedAccount(context, id);
    return this.activateConnection(connection, context, false);
  }

  async activate(
    context: FacebookSetupContext,
    id: string
  ): Promise<FacebookSetupStatus> {
    return this.checkAndSave(context, id, true);
  }

  /** Read-only at Meta; only the local diagnostic is updated. */
  async check(
    context: FacebookSetupContext,
    id: string
  ): Promise<FacebookSetupStatus> {
    return this.checkAndSave(context, id, false);
  }

  private async checkAndSave(
    context: FacebookSetupContext,
    id: string,
    allowSubscribe: boolean
  ) {
    const page = await this.page(context, id);
    const app = await this.app(context);
    const connection = await this.repository.getConnection(
      context,
      app.client_id,
      page.internalId
    );
    let result: FacebookSetupStatus;
    if (
      !connection ||
      connection.integrationId !== id ||
      connection.appId !== app.client_id ||
      connection.appSecret !== app.client_secret
    ) {
      result = this.status('AUTHORIZATION_REQUIRED');
    } else {
      try {
        result = await this.activateConnection(
          connection,
          context,
          allowSubscribe
        );
      } catch (error) {
        result = this.status('CHECK_FAILED', [
          error instanceof MetaAutomationError
            ? error.category
            : 'META_CHECK_FAILED',
        ]);
      }
    }
    if (
      connection &&
      connection.appId === app.client_id &&
      connection.appSecret === app.client_secret
    )
      await this.repository.saveStatus(
        context,
        id,
        result,
        this.connectionFingerprint(connection)
      );
    return result;
  }

  async inspectMessengerAccount(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    id: string,
    activate = false
  ) {
    const connection = await this.authorizedAccount(context, id);
    return this.activateConnection(connection, context, activate, 'messages');
  }

  private async activateConnection(
    connection: FacebookSetupConnection,
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    allowSubscribe = true,
    requiredField: 'feed' | 'messages' = 'feed'
  ): Promise<FacebookSetupStatus> {
    const token = await this.inspectToken(
      connection,
      requiredField === 'messages'
    );
    if (token.reasons.length)
      return this.status(
        'AUTHORIZATION_REQUIRED',
        token.reasons,
        token.missingPermissions
      );
    const subscriptions = await this.graph.read(
      `${connection.appId}/subscriptions`,
      `${connection.appId}|${connection.appSecret}`,
      { limit: '100' }
    );
    if (!Array.isArray(subscriptions.data) || record(subscriptions.paging).next)
      return this.status('CHECK_FAILED', ['SUBSCRIPTIONS_INCOMPLETE']);
    const callback = subscriptions.data
      .map(record)
      .find((item) => item.object === 'page');
    if (callback && callback.callback_url !== this.callback(connection.appId))
      return this.status('CALLBACK_CONFLICT');
    if (
      !callback ||
      callback.active !== true ||
      !Array.isArray(callback.fields) ||
      !callback.fields.some((field) => record(field).name === requiredField)
    )
      return this.status(
        'CALLBACK_REQUIRED',
        requiredField === 'messages'
          ? ['MESSENGER_APP_SUBSCRIPTION_REQUIRED']
          : []
      );
    const getFields = async () => {
      const response = await this.graph.read(
        `${connection.pageId}/subscribed_apps`,
        connection.pageToken,
        { fields: 'id,subscribed_fields', limit: '100' }
      );
      if (!Array.isArray(response.data) || record(response.paging).next)
        throw new MetaAutomationError('META_REJECTED');
      const own = response.data
        .map(record)
        .find((item) => item.id === connection.appId);
      if (
        own &&
        (!Array.isArray(own.subscribed_fields) ||
          own.subscribed_fields.some((field) => typeof field !== 'string'))
      )
        throw new MetaAutomationError('META_REJECTED');
      return (own?.subscribed_fields || []) as string[];
    };
    const inspectAndSubscribe = async (
      assertLease: () => Promise<void>
    ): Promise<FacebookSetupStatus> => {
      const fields = await getFields();
      if (!fields.includes(requiredField)) {
        if (!allowSubscribe)
          return this.status('CHECK_REQUIRED', [
            requiredField === 'messages'
              ? 'MESSENGER_PAGE_SUBSCRIPTION_REQUIRED'
              : 'FEED_SUBSCRIPTION_MISSING',
          ]);
        const currentPage = await this.repository.getPage(
          context,
          connection.integrationId
        );
        const currentApp = await this.app(context);
        if (
          currentPage?.internalId !== connection.pageId ||
          currentApp.client_id !== connection.appId ||
          currentApp.client_secret !== connection.appSecret
        )
          throw new HttpException('AUTHORIZATION_CHANGED', 409);
        const current = await this.authorizedAccount(
          context,
          connection.integrationId
        );
        if (
          current.pageToken !== connection.pageToken ||
          current.appId !== connection.appId ||
          current.pageId !== connection.pageId
        )
          throw new HttpException('AUTHORIZATION_CHANGED', 409);
        // Never subscribe every accessible Page, and never remove existing fields.
        await assertLease();
        await this.graph.subscribePage(
          connection.pageId,
          connection.pageToken,
          [...new Set([...fields, requiredField])]
        );
        if (!(await getFields()).includes(requiredField))
          throw new MetaAutomationError('OUTCOME_UNKNOWN');
      }
      return {
        ...this.status('RECEIVING_READY'),
        tokenExpiresAt: token.tokenExpiresAt,
        dataAccessExpiresAt: token.dataAccessExpiresAt,
        noScheduledExpiry: token.noScheduledExpiry,
      };
    };
    return allowSubscribe
      ? this.repository.withPageSubscriptionLock(
          connection,
          inspectAndSubscribe
        )
      : inspectAndSubscribe(async (): Promise<void> => {});
  }

  private async currentConnections(appId: string, pageIds?: string[]) {
    if (!/^\d{1,32}$/.test(appId)) throw new HttpException('INVALID_APP', 400);
    const candidates = await this.repository.findConnections(appId, pageIds);
    const active: FacebookSetupConnection[] = [];
    for (const candidate of candidates) {
      const page = await this.repository.getPage(
        candidate,
        candidate.integrationId
      );
      if (
        !page ||
        page.internalId !== candidate.pageId ||
        candidate.appId !== appId
      )
        continue;
      try {
        const app = await this.app(candidate);
        if (
          app.client_id === appId &&
          app.client_secret === candidate.appSecret
        )
          active.push(candidate);
      } catch (error) {
        if (!(error instanceof HttpException) || error.getStatus() !== 412)
          throw error;
      }
    }
    return active;
  }

  // Conexoes ja resolvidas para (app, paginas) com entrega valida recente: a
  // Meta continua sendo atendida mesmo com o orcamento anonimo esgotado (antes
  // 60 GET/POST lixo em 10 s derrubavam as entregas reais de todo mundo).
  private readonly connectionCache = new Map<
    string,
    { at: number; connections: FacebookSetupConnection[] }
  >();

  private cachedConnections(key: string) {
    const hit = this.connectionCache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > WEBHOOK_CONNECTION_CACHE_MS) {
      this.connectionCache.delete(key);
      return undefined;
    }
    return hit.connections;
  }

  private rememberConnections(
    key: string,
    connections: FacebookSetupConnection[]
  ) {
    if (this.connectionCache.size >= WEBHOOK_CONNECTION_CACHE_MAX) {
      const oldest = this.connectionCache.keys().next().value;
      if (oldest !== undefined) this.connectionCache.delete(oldest);
    }
    this.connectionCache.set(key, { at: Date.now(), connections });
  }

  async verify(
    appId: string,
    mode: unknown,
    token: unknown,
    challenge: unknown
  ) {
    // formato antes do orcamento: requisicao malformada nao gasta o limite
    if (
      mode !== 'subscribe' ||
      typeof token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(token) ||
      typeof challenge !== 'string' ||
      !/^\d{1,100}$/.test(challenge)
    )
      throw new HttpException('INVALID_CHALLENGE', 403);
    if (!(await this.repository.allowWebhook(appId)))
      throw new HttpException('WEBHOOK_RATE_LIMIT', 429);
    const connections = await this.currentConnections(appId);
    if (
      !connections.some((connection) =>
        timingSafeEqual(
          Buffer.from(token),
          Buffer.from(this.verifyToken(connection))
        )
      )
    )
      throw new HttpException('INVALID_CHALLENGE', 403);
    return challenge;
  }

  async receive(
    appId: string,
    raw: Buffer | undefined,
    signature: string | undefined
  ) {
    if (
      !Buffer.isBuffer(raw) ||
      raw.length > 1024 * 1024 ||
      !/^sha256=[a-f0-9]{64}$/.test(signature || '')
    )
      throw new HttpException('INVALID_WEBHOOK', 400);
    let body: Record<string, unknown>;
    try {
      body = record(JSON.parse(raw.toString('utf8')));
    } catch {
      throw new HttpException('INVALID_WEBHOOK', 400);
    }
    if (body.object !== 'page') return { received: true };
    if (!Array.isArray(body.entry) || body.entry.length > 100)
      throw new HttpException('INVALID_WEBHOOK', 400);
    const pageIds = [
      ...new Set(
        body.entry
          .map((entry) => record(entry).id)
          .filter(
            (id): id is string =>
              typeof id === 'string' && /^\d{1,32}$/.test(id)
          )
      ),
    ];
    if (!pageIds.length) return { received: true };
    const cacheKey = `${appId}:${[...pageIds].sort().join(',')}`;
    let connections = this.cachedConnections(cacheKey);
    if (!connections) {
      // orcamento so para a busca no banco, e por app
      if (!(await this.repository.allowWebhook(appId)))
        throw new HttpException('WEBHOOK_RATE_LIMIT', 429);
      connections = await this.currentConnections(appId, pageIds);
      if (!connections.length) return { received: true };
    }
    let events: ReturnType<typeof parseFacebookCommentWebhook>['events'];
    try {
      events = parseFacebookCommentWebhook(raw, signature, connections).events;
    } catch {
      throw new HttpException('INVALID_WEBHOOK_SIGNATURE', 403);
    }
    // assinatura conferida: guarda as conexoes para as proximas entregas
    this.rememberConnections(cacheKey, connections);
    const messengerEvents = parseFacebookMessengerWebhook(
      raw,
      signature,
      connections
    );
    for (const event of events) {
      const connection = connections.find(
        (item) =>
          item.integrationId === event.integrationId &&
          item.organizationId === event.organizationId &&
          item.profileId === event.profileId
      );
      if (!connection) continue;
      if (
        process.env.SHARED_AUTOMATIONS_ENABLED === 'true' &&
        this.sharedFlows
      ) {
        await this.sharedFlows.receive({
          organizationId: event.organizationId,
          profileId: event.profileId,
          integrationId: event.integrationId,
          platform: 'facebook',
          remoteAccountId: event.pageId,
          externalEventId: event.externalEventId,
          externalPostId: event.externalPostId,
          externalActorId: event.externalActorId,
          text: event.text,
          occurredAt: event.occurredAt,
        });
      }
      const previous = await this.repository.getReceipt(
        connection,
        connection.integrationId
      );
      if (previous?.commentId === event.externalEventId) continue;
      await this.repository.saveReceipt(connection, {
        receivedAt: new Date().toISOString(),
        commentId: event.externalEventId,
        postId: event.externalPostId,
      });
    }
    if (process.env.SHARED_AUTOMATIONS_ENABLED === 'true' && this.sharedFlows)
      for (const event of messengerEvents)
        await this.sharedFlows.receive(event);
    if (body.entry.some((entry) => Array.isArray(record(entry).messaging))) {
      // Diagnostic failure must not retry an otherwise accepted comment batch.
      // There is no observer by default: only an explicit, expiring Redis arm.
      try {
        for (const connection of connections) {
          const probe = await this.repository.getMessengerProbe(connection);
          if (!probe) continue;
          if (probe.mode === 'full-json') {
            const capture = captureFacebookMessengerJson(
              raw,
              signature,
              connection,
              probe
            );
            if (capture)
              await this.repository.saveMessengerFullCapture(
                connection,
                probe,
                capture
              );
            continue;
          }
          const observations = inspectFacebookMessengerWebhook(raw, signature, [
            connection,
          ]);
          for (const { observation } of observations)
            await this.repository.saveMessengerObservation(
              connection,
              probe,
              observation
            );
        }
      } catch {
        // Best effort only. Never log the raw payload or a provider exception.
      }
    }
    return { received: true };
  }
}
