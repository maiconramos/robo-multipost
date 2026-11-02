import { randomUUID } from 'node:crypto';
import {
  HttpException,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaRepository } from '../../database/prisma/prisma.service';
import { EncryptionService } from '../../crypto/encryption.service';
import Redis from 'ioredis';
import type {
  FacebookSetupStatus,
  FacebookAuthorization,
} from '../../dtos/integrations/facebook-automation.dto';
import { Prisma } from '@prisma/client';
import type { MessengerFullCapture } from './facebook-messenger-full-capture';
import {
  validMessengerProbe,
  MessengerProbe,
  MessengerObservation,
} from './facebook-messenger-probe';

export interface FacebookSetupContext {
  organizationId: string;
  profileId: string;
  userId: string;
}
export interface FacebookSetupConnection {
  authorization?: FacebookAuthorization;
  organizationId: string;
  profileId: string;
  integrationId: string;
  pageId: string;
  appId: string;
  appSecret: string;
  pageToken: string;
}
export interface FacebookSetupState extends FacebookSetupContext {
  integrationId: string;
  credentialFingerprint: string;
  codeVerifier: string;
  expiresAt: number;
}
export interface FacebookSetupReceipt {
  receivedAt: string;
  commentId: string;
  postId: string;
}

@Injectable()
export class FacebookAutomationSetupRepository implements OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaRepository<
      'integration' | 'providerCredential' | '$transaction'
    >,
    private readonly encryption: EncryptionService,
    @Inject('FACEBOOK_SETUP_REDIS') private readonly redis: Redis | null
  ) {}

  onModuleDestroy() {
    this.redis?.disconnect();
  }
  private cache() {
    if (!this.redis || this.redis.status !== 'ready')
      throw new HttpException('SETUP_STORAGE_UNAVAILABLE', 503);
    return this.redis;
  }
  /** Serializes union updates across profiles/workers; unknown HTTP outcomes retain the lease. */
  async withPageSubscriptionLock<T>(
    connection: Pick<FacebookSetupConnection, 'appId' | 'pageId'>,
    action: (assertLease: () => Promise<void>) => Promise<T>
  ): Promise<T> {
    if (
      ![connection.appId, connection.pageId].every((id) =>
        /^\d{1,32}$/.test(id)
      )
    )
      throw new HttpException('INVALID_INPUT', 400);
    const cache = this.cache();
    const key = `fbauto:subscription-lock:${connection.appId}:${connection.pageId}`;
    const token = randomUUID();
    if ((await cache.set(key, token, 'PX', 120000, 'NX')) !== 'OK')
      throw new HttpException('SUBSCRIPTION_UPDATE_BUSY', 409);
    const assertLease = async () => {
      const owned = await cache.eval(
        "if redis.call('GET', KEYS[1]) == ARGV[1] and redis.call('PTTL', KEYS[1]) > 30000 then return 1 end; return 0",
        1,
        key,
        token
      );
      if (owned !== 1) throw new HttpException('SUBSCRIPTION_UPDATE_BUSY', 409);
    };
    const result = await action(assertLease);
    await cache.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0",
      1,
      key,
      token
    );
    return result;
  }

  // orcamento de buscas por app (antes um balde unico da instancia inteira)
  async allowWebhook(appId: string) {
    try {
      const count = await this.cache().eval(
        "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 20) end; return n",
        1,
        `fbauto:public-budget:${appId}:${Math.floor(Date.now() / 10000)}`
      );
      return typeof count === 'number' && count <= 60;
    } catch {
      throw new HttpException('SETUP_STORAGE_UNAVAILABLE', 503);
    }
  }

  /** Distributed budget; shared apps cannot bypass it by changing local profiles. */
  async consumePostLookupBudget(
    connection: Pick<FacebookSetupConnection, 'appId' | 'pageId'>
  ) {
    if (
      ![connection.appId, connection.pageId].every((id) =>
        /^\d{1,32}$/.test(id)
      )
    )
      throw new HttpException('INVALID_INPUT', 400);
    let allowed: unknown;
    try {
      allowed = await this.cache().eval(
        "if tonumber(redis.call('GET', KEYS[1]) or '0') >= 120 or tonumber(redis.call('GET', KEYS[2]) or '0') >= 20 then return 0 end; for i = 1, 2 do local n = redis.call('INCR', KEYS[i]); if n == 1 then redis.call('EXPIRE', KEYS[i], 60) end end; return 1",
        2,
        `fbauto:post-lookup:{${connection.appId}}:app`,
        `fbauto:post-lookup:{${connection.appId}}:page:${connection.pageId}`
      );
    } catch {
      throw new HttpException('POST_LOOKUP_RETRY', 503);
    }
    if (allowed !== 1) throw new HttpException('POST_LOOKUP_RATE_LIMITED', 429);
  }

  private pageWhere(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>
  ): Prisma.IntegrationWhereInput {
    if (!context.organizationId || !context.profileId)
      throw new HttpException('PROFILE_REQUIRED', 403);
    return {
      organizationId: context.organizationId,
      profileId: context.profileId,
      providerIdentifier: 'facebook',
      disabled: false,
      inBetweenSteps: false,
      deletedAt: null,
      clientProfile: { deletedAt: null },
    };
  }

  listPages(context: FacebookSetupContext) {
    return this.prisma.model.integration.findMany({
      where: this.pageWhere(context),
      select: { id: true, internalId: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  getPage(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    id: string
  ) {
    return this.prisma.model.integration.findFirst({
      where: { ...this.pageWhere(context), id },
      select: {
        id: true,
        internalId: true,
        name: true,
        organizationId: true,
        profileId: true,
      },
    });
  }

  private provider(appId: string, pageId: string) {
    return `facebook-automation:${appId}:${pageId}`;
  }

  async saveConnection(connection: FacebookSetupConnection) {
    if (!process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET)
      throw new HttpException('ENCRYPTION_REQUIRED', 412);
    this.pageWhere(connection);
    const provider = this.provider(connection.appId, connection.pageId);
    const encryptedData = this.encryption.encryptJson(connection);
    const scope = {
      organizationId: connection.organizationId,
      profileId: connection.profileId,
      provider,
    };
    await this.prisma.model.providerCredential.upsert({
      where: { organizationId_profileId_provider: scope },
      create: { ...scope, encryptedData },
      update: { encryptedData },
    });
  }

  /** Internal compare-and-swap revision; never return ciphertext to a controller. */
  async getConnectionRevision(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    appId: string,
    pageId: string
  ) {
    this.pageWhere(context);
    const row = await this.prisma.model.providerCredential.findFirst({
      where: {
        organizationId: context.organizationId,
        profileId: context.profileId,
        provider: this.provider(appId, pageId),
      },
      select: { encryptedData: true },
    });
    return row?.encryptedData ?? null;
  }

  async getSourceRevision(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>
  ) {
    this.pageWhere(context);
    const row = await this.prisma.model.providerCredential.findFirst({
      where: {
        organizationId: context.organizationId,
        profileId: context.profileId,
        provider: 'facebook',
      },
      select: { encryptedData: true },
    });
    return row?.encryptedData ?? null;
  }

  async replaceConnection(
    connection: FacebookSetupConnection,
    revision: string | null,
    sourceRevision: string
  ) {
    if (!process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET)
      throw new HttpException('ENCRYPTION_REQUIRED', 412);
    this.pageWhere(connection);
    const scope = {
      organizationId: connection.organizationId,
      profileId: connection.profileId,
      provider: this.provider(connection.appId, connection.pageId),
    };
    const encryptedData = this.encryption.encryptJson(connection);
    try {
      await this.prisma.model.$transaction(
        async (tx) => {
          // Lock only this profile's source and target. No Meta calls inside the transaction.
          // getRawShared uses this same source row whenever a local system token exists.
          const source = await tx.$queryRaw<
            Array<{ encryptedData: string }>
          >(Prisma.sql`
          SELECT "encryptedData" FROM "ProviderCredential"
          WHERE "organizationId" = ${connection.organizationId} AND "profileId" = ${connection.profileId} AND "provider" = 'facebook'
          FOR UPDATE`);
          if (source.length !== 1 || source[0].encryptedData !== sourceRevision)
            throw new HttpException('AUTHORIZATION_CHANGED', 409);
          const lockedProfiles = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT "id" FROM "Profile" WHERE "id" = ${connection.profileId} AND "organizationId" = ${connection.organizationId} FOR UPDATE`
          );
          const lockedPages = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT "id" FROM "Integration" WHERE "id" = ${connection.integrationId} AND "organizationId" = ${connection.organizationId} FOR UPDATE`
          );
          if (lockedProfiles.length !== 1 || lockedPages.length !== 1)
            throw new HttpException('AUTHORIZATION_CHANGED', 409);
          const page = await tx.integration.findFirst({
            where: {
              ...this.pageWhere(connection),
              id: connection.integrationId,
            },
            select: { internalId: true },
          });
          if (page?.internalId !== connection.pageId)
            throw new HttpException('AUTHORIZATION_CHANGED', 409);
          if (revision !== null) {
            const result = await tx.providerCredential.updateMany({
              where: { ...scope, encryptedData: revision },
              data: { encryptedData },
            });
            if (result.count !== 1)
              throw new HttpException('AUTHORIZATION_CHANGED', 409);
          } else {
            await tx.providerCredential.create({
              data: { ...scope, encryptedData },
            });
          }
        },
        { maxWait: 5000, timeout: 5000 }
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (['P2002', 'P2034'].includes((error as { code?: string }).code || ''))
        throw new HttpException('AUTHORIZATION_CHANGED', 409);
      throw new HttpException('SETUP_STORAGE_UNAVAILABLE', 503);
    }
  }

  async getConnection(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    appId: string,
    pageId: string
  ) {
    this.pageWhere(context);
    const row = await this.prisma.model.providerCredential.findFirst({
      where: {
        organizationId: context.organizationId,
        profileId: context.profileId,
        provider: this.provider(appId, pageId),
      },
    });
    return row ? this.decode(row) : null;
  }

  private decode(row: {
    organizationId: string;
    profileId: string | null;
    provider: string;
    encryptedData: string;
  }): FacebookSetupConnection | null {
    try {
      const value = this.encryption.decryptJson(row.encryptedData);
      if (
        !row.profileId ||
        !value.integrationId ||
        !value.pageToken ||
        !value.appSecret ||
        row.provider !== this.provider(value.appId, value.pageId)
      )
        return null;
      return {
        ...value,
        organizationId: row.organizationId,
        profileId: row.profileId,
      } as FacebookSetupConnection;
    } catch {
      return null;
    }
  }

  async findConnections(appId: string, pageIds?: string[]) {
    if (pageIds?.length === 0) return [];
    const rows = await this.prisma.model.providerCredential.findMany({
      where: {
        provider: pageIds
          ? { in: pageIds.map((page) => this.provider(appId, page)) }
          : { startsWith: `facebook-automation:${appId}:` },
        profileId: { not: null },
      },
      take: 201,
    });
    if (rows.length > 200)
      throw new HttpException('CALLBACK_CAPACITY_EXCEEDED', 503);
    return rows
      .map((row) => this.decode(row))
      .filter((row): row is FacebookSetupConnection => !!row);
  }

  async saveState(state: string, value: FacebookSetupState) {
    await this.cache().set(
      `fbauto:state:${state}`,
      JSON.stringify(value),
      'EX',
      600
    );
  }
  async takeState(state: string): Promise<FacebookSetupState | null> {
    const raw = await this.cache().getdel(`fbauto:state:${state}`);
    return raw ? JSON.parse(raw) : null;
  }
  private key(
    kind: string,
    context: { organizationId: string; profileId: string },
    integrationId: string
  ) {
    return `fbauto:${kind}:${context.organizationId}:${context.profileId}:${integrationId}`;
  }

  private messengerProbeKey(kind: string, connection: FacebookSetupConnection) {
    return this.key(
      kind,
      connection,
      `${connection.integrationId}:${connection.appId}:${connection.pageId}`
    );
  }
  async getMessengerProbe(
    connection: FacebookSetupConnection
  ): Promise<MessengerProbe | null> {
    const raw = await this.cache().get(
      this.messengerProbeKey('messenger-probe', connection)
    );
    if (!raw || raw.length > 2048) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return validMessengerProbe(value, connection) ? value : null;
    } catch {
      return null;
    }
  }
  async saveMessengerObservation(
    connection: FacebookSetupConnection,
    probe: MessengerProbe,
    observation: MessengerObservation
  ) {
    if (!validMessengerProbe(probe, connection)) return;
    const serialized = JSON.stringify(observation);
    if (serialized.length > 10000) return;
    // Compare the exact arm at write time. No webhook may create/renew the arm;
    // keep at most 20 records, with retention fixed at the first observation.
    await this.cache().eval(
      `if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('PTTL', KEYS[1]) <= 0 then return 0 end
       local arm = cjson.decode(ARGV[1])
       local clock = redis.call('TIME')
       if arm.expiresAt <= tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000) then return 0 end
       local count = redis.call('LLEN', KEYS[2])
       if count >= 20 then return 0 end
       redis.call('RPUSH', KEYS[2], ARGV[2])
       if count == 0 then redis.call('EXPIRE', KEYS[2], 86400) end
       return 1`,
      2,
      this.messengerProbeKey('messenger-probe', connection),
      this.messengerProbeKey('messenger-probe-records', connection),
      JSON.stringify(probe),
      serialized
    );
  }
  async saveMessengerFullCapture(
    connection: FacebookSetupConnection,
    probe: MessengerProbe,
    capture: MessengerFullCapture
  ) {
    if (
      !validMessengerProbe(probe, connection) ||
      probe.mode !== 'full-json' ||
      !(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET)?.trim()
    )
      return;
    if (
      capture.rawJson &&
      Buffer.byteLength(capture.rawJson, 'utf8') > 128 * 1024
    )
      return;
    const encryptedJson =
      capture.status === 'captured' && capture.rawJson
        ? this.encryption.encryptJson({
            nonce: probe.nonce,
            organizationId: connection.organizationId,
            profileId: connection.profileId,
            integrationId: connection.integrationId,
            appId: connection.appId,
            pageId: connection.pageId,
            rawJson: capture.rawJson,
          })
        : undefined;
    if (capture.status === 'captured' && !encryptedJson) return;
    const serialized = JSON.stringify({
      receivedAt: capture.receivedAt,
      bodyHash: capture.bodyHash,
      testIndexes: capture.testIndexes,
      status: capture.status,
      reason: capture.reason,
      encryptedJson,
    });
    // Session-specific storage, exact arm comparison and absolute retention.
    await this.cache().eval(
      `if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('PTTL', KEYS[1]) <= 0 then return 0 end
       local arm = cjson.decode(ARGV[1])
       local clock = redis.call('TIME')
       if arm.expiresAt <= tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000) then return 0 end
       local records = redis.call('LRANGE', KEYS[2], 0, 3)
       if #records >= 4 then return 0 end
       local next = cjson.decode(ARGV[2])
       for _, row in ipairs(records) do if cjson.decode(row).bodyHash == next.bodyHash then return 0 end end
       redis.call('RPUSH', KEYS[2], ARGV[2])
       redis.call('PEXPIREAT', KEYS[2], arm.expiresAt)
       return 1`,
      2,
      this.messengerProbeKey('messenger-probe', connection),
      `${this.messengerProbeKey('messenger-full-records', connection)}:${
        probe.nonce
      }`,
      JSON.stringify(probe),
      serialized
    );
  }

  async saveStatus(
    context: FacebookSetupContext,
    integrationId: string,
    status: FacebookSetupStatus,
    credentialFingerprint: string
  ) {
    const previous = await this.getStatus(
      context,
      integrationId,
      credentialFingerprint
    );
    const lastReadyAt =
      status.stage === 'RECEIVING_READY'
        ? status.checkedAt
        : previous?.lastReadyAt;
    await this.cache().set(
      this.key('status', context, integrationId),
      JSON.stringify({
        credentialFingerprint,
        status: { ...status, lastReadyAt },
      }),
      'EX',
      30 * 86400
    );
  }
  async getStatus(
    context: FacebookSetupContext,
    integrationId: string,
    credentialFingerprint: string
  ): Promise<FacebookSetupStatus | null> {
    const raw = await this.cache().get(
      this.key('status', context, integrationId)
    );
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Older five-minute entries and diagnostics for replaced credentials are not current.
    return saved.credentialFingerprint === credentialFingerprint
      ? saved.status
      : null;
  }
  async saveReceipt(
    connection: FacebookSetupConnection,
    receipt: FacebookSetupReceipt
  ) {
    await this.cache().set(
      this.key('receipt', connection, connection.integrationId),
      JSON.stringify(receipt),
      'EX',
      604800
    );
  }
  async getReceipt(
    context: Pick<FacebookSetupContext, 'organizationId' | 'profileId'>,
    integrationId: string
  ): Promise<FacebookSetupReceipt | null> {
    const raw = await this.cache().get(
      this.key('receipt', context, integrationId)
    );
    return raw ? JSON.parse(raw) : null;
  }
}
