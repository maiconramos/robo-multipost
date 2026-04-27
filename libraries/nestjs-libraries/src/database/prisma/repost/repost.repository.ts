import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  CreateRepostRuleDto,
  UpdateRepostRuleDto,
} from '@gitroom/nestjs-libraries/dtos/repost/repost.rule.dto';
import {
  Prisma,
  RepostDestinationFormat,
  RepostLogStatus,
} from '@prisma/client';

export interface RepostRulePublishedPost {
  integrationId: string;
  postId: string;
  format?: RepostDestinationFormat;
  releaseUrl?: string;
  error?: string;
}

export interface RepostDestinationInput {
  integrationId: string;
  format: RepostDestinationFormat;
}

// include padrao quando carregamos uma regra — inclui sourceIntegration,
// destinations (com integration) e _count.logs.
const RULE_INCLUDE = {
  sourceIntegration: {
    select: {
      id: true,
      name: true,
      picture: true,
      providerIdentifier: true,
    },
  },
  destinations: {
    include: {
      integration: {
        select: {
          id: true,
          name: true,
          picture: true,
          providerIdentifier: true,
          disabled: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: {
    select: { logs: true },
  },
} satisfies Prisma.RepostRuleInclude;

@Injectable()
export class RepostRepository {
  constructor(
    private _repostRule: PrismaRepository<'repostRule'>,
    private _repostLog: PrismaRepository<'repostLog'>,
    private _repostRuleDestination: PrismaRepository<'repostRuleDestination'>,
    private _tx: PrismaTransaction
  ) {}

  getRules(orgId: string, profileId?: string) {
    return this._repostRule.model.repostRule.findMany({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
      include: RULE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  getRuleById(id: string, orgId?: string, profileId?: string) {
    return this._repostRule.model.repostRule.findFirst({
      where: {
        id,
        ...(orgId ? { organizationId: orgId } : {}),
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
      include: RULE_INCLUDE,
    });
  }

  getRuleFresh(id: string) {
    return this._repostRule.model.repostRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
  }

  async createRule(
    orgId: string,
    profileId: string,
    body: CreateRepostRuleDto
  ) {
    const created = await this._repostRule.model.repostRule.create({
      data: {
        organizationId: orgId,
        profileId,
        name: body.name,
        sourceIntegrationId: body.sourceIntegrationId,
        sourceType: body.sourceType,
        // Mantem shadow com destinationIntegrationIds apenas durante a
        // janela de migracao. A fonte da verdade e RepostRuleDestination.
        destinationIntegrationIds: body.destinations.map((d) => d.integrationId),
        intervalMinutes: body.intervalMinutes ?? 15,
        filterIncludeVideos: body.filterIncludeVideos ?? true,
        filterIncludeImages: body.filterIncludeImages ?? false,
        filterMaxDurationSeconds: body.filterMaxDurationSeconds ?? null,
        filterHashtag: body.filterHashtag ?? null,
        captionTemplate: body.captionTemplate ?? null,
        enabled: body.enabled ?? true,
        destinations: {
          create: body.destinations.map((d) => ({
            integrationId: d.integrationId,
            format: d.format,
          })),
        },
      },
      include: RULE_INCLUDE,
    });
    return created;
  }

  async updateRule(
    orgId: string,
    id: string,
    body: UpdateRepostRuleDto,
    profileId?: string
  ) {
    const updated = await this._repostRule.model.repostRule.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.sourceIntegrationId !== undefined
          ? { sourceIntegrationId: body.sourceIntegrationId }
          : {}),
        ...(body.sourceType !== undefined
          ? { sourceType: body.sourceType }
          : {}),
        ...(body.destinations !== undefined
          ? {
              destinationIntegrationIds: body.destinations.map(
                (d) => d.integrationId
              ),
            }
          : {}),
        ...(body.intervalMinutes !== undefined
          ? { intervalMinutes: body.intervalMinutes }
          : {}),
        ...(body.filterIncludeVideos !== undefined
          ? { filterIncludeVideos: body.filterIncludeVideos }
          : {}),
        ...(body.filterIncludeImages !== undefined
          ? { filterIncludeImages: body.filterIncludeImages }
          : {}),
        ...(body.filterMaxDurationSeconds !== undefined
          ? { filterMaxDurationSeconds: body.filterMaxDurationSeconds }
          : {}),
        ...(body.filterHashtag !== undefined
          ? { filterHashtag: body.filterHashtag }
          : {}),
        ...(body.captionTemplate !== undefined
          ? { captionTemplate: body.captionTemplate }
          : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
      include: RULE_INCLUDE,
    });

    if (body.destinations !== undefined) {
      await this.replaceDestinations(id, body.destinations);
    }

    return this._repostRule.model.repostRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
  }

  async replaceDestinations(ruleId: string, dests: RepostDestinationInput[]) {
    await this._tx.model.$transaction([
      this._repostRuleDestination.model.repostRuleDestination.deleteMany({
        where: { ruleId },
      }),
      this._repostRuleDestination.model.repostRuleDestination.createMany({
        data: dests.map((d) => ({
          ruleId,
          integrationId: d.integrationId,
          format: d.format,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  toggleRule(orgId: string, id: string, enabled: boolean, profileId?: string) {
    return this._repostRule.model.repostRule.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: { enabled },
    });
  }

  softDeleteRule(orgId: string, id: string, profileId?: string) {
    return this._repostRule.model.repostRule.update({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: { deletedAt: new Date(), enabled: false },
    });
  }

  advanceCheckpoint(id: string, lastSourceItemId: string) {
    return this._repostRule.model.repostRule.update({
      where: { id },
      data: {
        lastSourceItemId,
        lastRunAt: new Date(),
      },
    });
  }

  clearCheckpoint(id: string) {
    return this._repostRule.model.repostRule.update({
      where: { id },
      data: { lastSourceItemId: null },
    });
  }

  touchLastRun(id: string) {
    return this._repostRule.model.repostRule.update({
      where: { id },
      data: { lastRunAt: new Date() },
    });
  }

  async createLog(data: {
    ruleId: string;
    sourceItemId: string;
    mediaType: string;
    mediaUrlOriginal: string;
    status?: RepostLogStatus;
    skippedReason?: string;
  }) {
    try {
      return await this._repostLog.model.repostLog.create({
        data: {
          ruleId: data.ruleId,
          sourceItemId: data.sourceItemId,
          mediaType: data.mediaType,
          mediaUrlOriginal: data.mediaUrlOriginal,
          status: data.status ?? 'PENDING',
          skippedReason: data.skippedReason,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // unique (ruleId, sourceItemId) — item ja processado, idempotencia.
        return null;
      }
      throw err;
    }
  }

  markLogDownloaded(id: string, storedMediaId: string) {
    return this._repostLog.model.repostLog.update({
      where: { id },
      data: { status: 'DOWNLOADED', storedMediaId },
    });
  }

  markLogPublished(
    id: string,
    publishedPosts: RepostRulePublishedPost[],
    partial = false
  ) {
    return this._repostLog.model.repostLog.update({
      where: { id },
      data: {
        status: partial ? 'PARTIAL' : 'PUBLISHED',
        publishedPosts: publishedPosts as unknown as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });
  }

  markLogFailed(id: string, errorMessage: string) {
    return this._repostLog.model.repostLog.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage,
        processedAt: new Date(),
      },
    });
  }

  markLogSkipped(id: string, skippedReason: string) {
    return this._repostLog.model.repostLog.update({
      where: { id },
      data: {
        status: 'SKIPPED',
        skippedReason,
        processedAt: new Date(),
      },
    });
  }

  getLogs(ruleId: string, page = 1, size = 20) {
    const take = Math.min(Math.max(size, 1), 100);
    const skip = Math.max(page - 1, 0) * take;
    return this._repostLog.model.repostLog.findMany({
      where: { ruleId },
      orderBy: { discoveredAt: 'desc' },
      take,
      skip,
    });
  }

  countLogs(ruleId: string) {
    return this._repostLog.model.repostLog.count({ where: { ruleId } });
  }
}
