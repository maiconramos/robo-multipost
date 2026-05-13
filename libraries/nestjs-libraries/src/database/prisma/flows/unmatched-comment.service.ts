import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AliasSource, UnmatchedStatus } from '@prisma/client';
import { FlowsRepository } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';
import { resolveIgRoute } from '@gitroom/nestjs-libraries/integrations/social/instagram-route.resolver';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const CACHE_TTL_SECONDS = 86400; // 24h

@Injectable()
export class UnmatchedCommentService {
  private readonly _logger = new Logger(UnmatchedCommentService.name);

  constructor(
    private _flowsRepository: FlowsRepository,
    private _integrationService: IntegrationService,
    private _instagramProvider: InstagramProvider,
    private _instagramMessagingService: InstagramMessagingService
  ) {}

  listInbox(
    orgId: string,
    integrationId: string,
    options: { status?: UnmatchedStatus; page?: number; limit?: number }
  ) {
    return this._flowsRepository.listUnmatchedByIntegration(
      orgId,
      integrationId,
      options
    );
  }

  async bindToFlow(
    orgId: string,
    unmatchedCommentId: string,
    flowId: string,
    boundBy?: string
  ) {
    const unmatched = await this._flowsRepository.findUnmatchedById(
      orgId,
      unmatchedCommentId
    );
    if (!unmatched) {
      throw new BadRequestException('UnmatchedComment not found');
    }

    const flow = await this._flowsRepository.getFlow(orgId, flowId);
    if (!flow || flow.integrationId !== unmatched.integrationId) {
      throw new BadRequestException(
        'Flow does not belong to the same integration as this comment'
      );
    }

    let alias;
    try {
      alias = await this._flowsRepository.createAlias({
        flowId,
        integrationId: unmatched.integrationId,
        aliasMediaId: unmatched.igMediaId,
        source: AliasSource.WEBHOOK_INBOX,
        boundBy,
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const existing =
          await this._flowsRepository.findAliasesByIntegrationAndMedia(
            unmatched.integrationId,
            unmatched.igMediaId
          );
        alias = existing.find((a) => a.flowId === flowId) ?? existing[0];
      } else {
        throw err;
      }
    }

    await this._flowsRepository.markUnmatchedBound(unmatchedCommentId, flowId);

    // Bulk move: outros UnmatchedComment PENDING do MESMO media nao podem
    // continuar como "pendentes" — o media ja foi resolvido. Movemos para
    // BOUND com o mesmo flowId. Evita item orfao na aba Pendentes apos
    // o user vincular um deles. Idempotente: se ja foram BOUND/IGNORED,
    // o updateMany simplesmente ignora (where status=PENDING).
    const bulkCount = await this._flowsRepository.markAllPendingBoundForMedia(
      unmatched.integrationId,
      unmatched.igMediaId,
      flowId,
      unmatchedCommentId
    );
    if (bulkCount > 0) {
      this._logger.log(
        `bindToFlow: ${bulkCount} outro(s) UnmatchedComment PENDING do media ${unmatched.igMediaId} tambem foram marcados como BOUND`
      );
    }

    return {
      alias,
      unmatchedCommentId,
      status: UnmatchedStatus.BOUND,
      bulkBoundCount: bulkCount,
    };
  }

  async ignore(
    orgId: string,
    unmatchedCommentId: string,
    reason?: string,
    ignoredBy?: string
  ) {
    const unmatched = await this._flowsRepository.findUnmatchedById(
      orgId,
      unmatchedCommentId
    );
    if (!unmatched) {
      throw new BadRequestException('UnmatchedComment not found');
    }

    await this._flowsRepository.upsertIgnoredMedia({
      integrationId: unmatched.integrationId,
      organizationId: unmatched.organizationId,
      igMediaId: unmatched.igMediaId,
      reason,
      ignoredBy,
    });

    await this._flowsRepository.markUnmatchedIgnored(unmatchedCommentId);

    // Bulk: outros UnmatchedComment PENDING do MESMO media tambem viram
    // IGNORED — o user "ignorou esse post para sempre", entao outros
    // comentarios pendentes do mesmo post devem desaparecer da aba PENDING.
    const bulkCount =
      await this._flowsRepository.markAllPendingIgnoredForMedia(
        unmatched.integrationId,
        unmatched.igMediaId,
        unmatchedCommentId
      );
    if (bulkCount > 0) {
      this._logger.log(
        `ignore: ${bulkCount} outro(s) UnmatchedComment PENDING do media ${unmatched.igMediaId} tambem foram marcados como IGNORED`
      );
    }

    return {
      unmatchedCommentId,
      status: UnmatchedStatus.IGNORED,
      bulkIgnoredCount: bulkCount,
    };
  }

  async enrich(unmatchedCommentId: string): Promise<void> {
    const uc =
      await this._flowsRepository.findUnmatchedByIdInternal(unmatchedCommentId);
    if (!uc) {
      this._logger.warn(
        `enrich: UnmatchedComment ${unmatchedCommentId} nao encontrado`
      );
      return;
    }

    const cacheKey = `ig:media:${uc.igMediaId}:metadata`;
    const cached = await this.readCacheSafe(cacheKey);
    if (cached) {
      await this._flowsRepository.updateUnmatchedMetadata(uc.id, {
        permalink: cached.permalink ?? null,
        caption: cached.caption ?? null,
        thumbnailUrl: cached.thumbnailUrl ?? null,
        mediaType: cached.mediaType ?? null,
        isAd: cached.isAd ?? null,
        enrichedAt: new Date(),
        enrichmentError: null,
      });
      return;
    }

    const integration = await this._integrationService.getIntegrationById(
      uc.organizationId,
      uc.integrationId
    );
    if (!integration) {
      await this._flowsRepository.updateUnmatchedMetadata(uc.id, {
        enrichmentError: 'integration not found',
        enrichedAt: new Date(),
      });
      return;
    }

    try {
      const route = await resolveIgRoute(
        integration as any,
        this._instagramMessagingService
      );
      const metadata = await this._instagramProvider.getMediaMetadata(
        uc.igMediaId,
        route.token,
        route.host
      );

      await this.writeCacheSafe(cacheKey, metadata);
      await this._flowsRepository.updateUnmatchedMetadata(uc.id, {
        permalink: metadata.permalink ?? null,
        caption: metadata.caption ?? null,
        thumbnailUrl: metadata.thumbnailUrl ?? null,
        mediaType: metadata.mediaType ?? null,
        isAd: metadata.isAd ?? null,
        enrichedAt: new Date(),
        enrichmentError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logger.warn(
        `Falha ao enriquecer UnmatchedComment ${uc.id}: ${message}`
      );
      await this._flowsRepository.updateUnmatchedMetadata(uc.id, {
        enrichedAt: new Date(),
        enrichmentError: message.slice(0, 500),
      });
    }
  }

  /**
   * Lista aliases de um flow enriquecidos com metadata (permalink, thumbnail,
   * caption) — cache Redis evita rebatida no Graph API. Falhas pontuais
   * degradam para alias sem metadata, nao bloqueiam a UI.
   */
  async listAliasesEnriched(orgId: string, flowId: string) {
    const aliases = await this._flowsRepository.listAliasesByFlow(orgId, flowId);
    return Promise.all(
      aliases.map(async (alias) => {
        const metadata = await this.getMediaMetadataCached({
          integrationId: alias.integrationId,
          igMediaId: alias.aliasMediaId,
          organizationId: orgId,
        });
        return {
          ...alias,
          permalink: metadata?.permalink ?? null,
          thumbnailUrl: metadata?.thumbnailUrl ?? null,
          caption: metadata?.caption ?? null,
          mediaType: metadata?.mediaType ?? null,
          isAd: metadata?.isAd ?? null,
        };
      })
    );
  }

  /**
   * Lookup de metadata de uma media: tenta cache Redis primeiro, depois
   * chama Graph API. Retorna null silenciosamente em caso de falha
   * (caller decide como degradar UI). Compartilhado entre Inbox enrichment
   * e listagem de FlowMediaAlias.
   */
  async getMediaMetadataCached(input: {
    integrationId: string;
    igMediaId: string;
    organizationId: string;
  }): Promise<{
    permalink?: string;
    caption?: string;
    thumbnailUrl?: string;
    mediaType?: string;
    isAd?: boolean;
  } | null> {
    const cacheKey = `ig:media:${input.igMediaId}:metadata`;
    const cached = await this.readCacheSafe(cacheKey);
    if (cached) return cached;

    const integration = await this._integrationService.getIntegrationById(
      input.organizationId,
      input.integrationId
    );
    if (!integration) return null;

    try {
      const route = await resolveIgRoute(
        integration as any,
        this._instagramMessagingService
      );
      const metadata = await this._instagramProvider.getMediaMetadata(
        input.igMediaId,
        route.token,
        route.host
      );
      await this.writeCacheSafe(cacheKey, metadata);
      return metadata;
    } catch (err) {
      this._logger.warn(
        `getMediaMetadataCached falhou para media=${input.igMediaId}: ${
          (err as Error).message
        }`
      );
      return null;
    }
  }

  cleanupExpired(cutoff: Date): Promise<number> {
    return this._flowsRepository.deleteUnmatchedOlderThan(cutoff);
  }

  private async readCacheSafe(
    key: string
  ): Promise<Record<string, any> | null> {
    try {
      const raw = await ioRedis.get(key);
      if (!raw) return null;
      return JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch (e) {
      this._logger.warn(`Falha ao ler cache ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  private async writeCacheSafe(key: string, payload: unknown) {
    try {
      const ioredisAny = ioRedis as any;
      const serialized = JSON.stringify(payload);
      if (typeof ioredisAny.setex === 'function') {
        await ioredisAny.setex(key, CACHE_TTL_SECONDS, serialized);
      } else {
        await ioRedis.set(key, serialized);
      }
    } catch (e) {
      this._logger.warn(
        `Falha ao escrever cache ${key}: ${(e as Error).message}`
      );
    }
  }
}
