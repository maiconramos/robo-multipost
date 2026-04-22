import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  CreateRepostRuleDto,
  UpdateRepostRuleDto,
} from '@gitroom/nestjs-libraries/dtos/repost/repost.rule.dto';
import { Prisma, RepostLogStatus } from '@prisma/client';

export interface RepostRulePublishedPost {
  integrationId: string;
  postId: string;
  releaseUrl?: string;
  error?: string;
}

@Injectable()
export class RepostRepository {
  constructor(
    private _repostRule: PrismaRepository<'repostRule'>,
    private _repostLog: PrismaRepository<'repostLog'>
  ) {}

  getRules(orgId: string, profileId?: string) {
    return this._repostRule.model.repostRule.findMany({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
      },
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
    });
  }

  getRuleFresh(id: string) {
    return this._repostRule.model.repostRule.findUnique({
      where: { id },
    });
  }

  async createRule(
    orgId: string,
    profileId: string,
    body: CreateRepostRuleDto
  ) {
    return this._repostRule.model.repostRule.create({
      data: {
        organizationId: orgId,
        profileId,
        name: body.name,
        sourceIntegrationId: body.sourceIntegrationId,
        sourceType: body.sourceType ?? 'INSTAGRAM_STORY',
        destinationIntegrationIds: body.destinationIntegrationIds,
        intervalMinutes: body.intervalMinutes ?? 15,
        filterIncludeVideos: body.filterIncludeVideos ?? true,
        filterIncludeImages: body.filterIncludeImages ?? false,
        filterMaxDurationSeconds: body.filterMaxDurationSeconds ?? null,
        captionTemplate: body.captionTemplate ?? null,
        enabled: body.enabled ?? true,
      },
    });
  }

  async updateRule(
    orgId: string,
    id: string,
    body: UpdateRepostRuleDto,
    profileId?: string
  ) {
    return this._repostRule.model.repostRule.update({
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
        ...(body.destinationIntegrationIds !== undefined
          ? { destinationIntegrationIds: body.destinationIntegrationIds }
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
        ...(body.captionTemplate !== undefined
          ? { captionTemplate: body.captionTemplate }
          : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });
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
