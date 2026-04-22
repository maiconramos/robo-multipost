import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import dayjs from 'dayjs';
import { RepostService } from '@gitroom/nestjs-libraries/database/prisma/repost/repost.service';
import {
  RepostRepository,
  RepostRulePublishedPost,
} from '@gitroom/nestjs-libraries/database/prisma/repost/repost.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';
import { resolveIgRoute } from '@gitroom/nestjs-libraries/integrations/social/instagram-route.resolver';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import type { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';

export interface RepostCycleResult {
  ruleDisabled?: boolean;
  intervalMinutes: number;
}

const DEFAULT_INTERVAL_MINUTES = 15;

// Limites conhecidos de destino. Mantidos aqui centralizados para
// filtragem no ciclo antes de criar Posts desnecessarios.
const YOUTUBE_SHORTS_MAX_SECONDS = 60;
const TIKTOK_MIN_SECONDS = 3;

@Injectable()
@Activity()
export class RepostActivity {
  private storage = UploadFactory.createStorage();

  constructor(
    private _repostService: RepostService,
    private _repostRepository: RepostRepository,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _instagramMessagingService: InstagramMessagingService,
    private _postsService: PostsService,
    private _mediaService: MediaService
  ) {}

  @ActivityMethod()
  async runRepostCycle(ruleId: string): Promise<RepostCycleResult> {
    const rule = await this._repostService.getRuleFresh(ruleId);

    if (!rule || rule.deletedAt || !rule.enabled) {
      console.log(`[repost] rule ${ruleId} disabled or missing — exiting`);
      return { ruleDisabled: true, intervalMinutes: DEFAULT_INTERVAL_MINUTES };
    }

    const intervalMinutes = rule.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;

    try {
      const integration = await this._integrationService.getIntegrationById(
        rule.organizationId,
        rule.sourceIntegrationId
      );
      if (!integration || integration.disabled || integration.deletedAt) {
        console.log(
          `[repost] rule=${ruleId} source integration missing or disabled — skipping cycle`
        );
        await this._repostService.touchLastRun(ruleId);
        return { intervalMinutes };
      }

      const route = await resolveIgRoute(
        integration as any,
        this._instagramMessagingService
      );
      const provider = this._integrationManager.getSocialIntegration(
        'instagram'
      ) as unknown as InstagramProvider | undefined;
      if (!provider) {
        console.log(`[repost] rule=${ruleId} instagram provider unavailable`);
        await this._repostService.touchLastRun(ruleId);
        return { intervalMinutes };
      }

      const { stories } = await provider.getRecentStories(
        integration.internalId,
        route.token,
        route.host
      );

      const checkpoint = rule.lastSourceItemId ?? '';
      const freshStories = stories
        .filter((s) => !!s.id && s.id > checkpoint)
        .sort((a, b) => (a.id > b.id ? 1 : -1));

      console.log(
        `[repost] rule=${ruleId} host=${route.host} returned=${stories.length} ` +
          `checkpoint=${checkpoint || '(empty)'} fresh=${freshStories.length} ` +
          `ids=[${stories.map((s) => s.id).join(',')}]`
      );

      if (freshStories.length === 0) {
        await this._repostService.touchLastRun(ruleId);
        return { intervalMinutes };
      }

      let maxProcessedId = checkpoint;

      for (const story of freshStories) {
        await this.processStory(rule, story);
        if (story.id && story.id > maxProcessedId) {
          maxProcessedId = story.id;
        }
      }

      if (maxProcessedId && maxProcessedId !== checkpoint) {
        await this._repostService.advanceCheckpoint(ruleId, maxProcessedId);
      } else {
        await this._repostService.touchLastRun(ruleId);
      }

      return { intervalMinutes };
    } catch (err) {
      // Falha global do ciclo (ex: Graph API indisponivel, credencial
      // rotacionada). O workflow dorme e tenta de novo — nao desabilitamos
      // a regra automaticamente no V1.
      console.error(
        `[repost] rule=${ruleId} cycle failed:`,
        (err as Error).stack || (err as Error).message || err
      );
      await this._repostService.touchLastRun(ruleId).catch(() => undefined);
      return { intervalMinutes };
    }
  }

  private async processStory(
    rule: Awaited<ReturnType<RepostService['getRuleFresh']>>,
    story: {
      id: string;
      mediaType: string;
      mediaUrl?: string;
      thumbnailUrl?: string;
      permalink?: string;
      timestamp?: string;
    }
  ) {
    if (!rule) return;

    const mediaType = (story.mediaType || '').toUpperCase();
    const isVideo = mediaType === 'VIDEO';
    const isImage = mediaType === 'IMAGE';

    const log = await this._repostRepository.createLog({
      ruleId: rule.id,
      sourceItemId: story.id,
      mediaType: isVideo ? 'VIDEO' : isImage ? 'IMAGE' : mediaType || 'UNKNOWN',
      mediaUrlOriginal: story.mediaUrl || story.thumbnailUrl || '',
    });

    // Log duplicado (ja processado em ciclo anterior) — idempotencia.
    if (!log) {
      console.log(
        `[repost] rule=${rule.id} story=${story.id} already processed — skipping`
      );
      return;
    }
    console.log(
      `[repost] rule=${rule.id} processing story=${story.id} mediaType=${mediaType}`
    );

    if (isImage && !rule.filterIncludeImages) {
      await this._repostRepository.markLogSkipped(log.id, 'FILTER_IMAGE');
      return;
    }
    if (!isVideo && !isImage) {
      await this._repostRepository.markLogSkipped(log.id, 'UNSUPPORTED_MEDIA');
      return;
    }
    if (!story.mediaUrl) {
      await this._repostRepository.markLogFailed(log.id, 'MEDIA_URL_MISSING');
      return;
    }

    let storedMedia: { id: string; path: string } | null = null;
    try {
      const uploadedPath = await this.storage.uploadSimple(story.mediaUrl);
      const fileName = (uploadedPath.split('/').pop() || 'repost').toString();
      const saved = await this._mediaService.saveFile(
        rule.organizationId,
        fileName,
        uploadedPath,
        undefined,
        rule.profileId
      );
      storedMedia = { id: saved.id, path: saved.path };
      await this._repostRepository.markLogDownloaded(log.id, saved.id);
    } catch (err) {
      await this._repostRepository.markLogFailed(
        log.id,
        `MEDIA_DOWNLOAD_FAILED: ${(err as Error).message || 'unknown'}`
      );
      return;
    }

    const destinations = await this.loadDestinations(rule);
    if (destinations.length === 0) {
      await this._repostRepository.markLogFailed(
        log.id,
        'NO_DESTINATION_AVAILABLE'
      );
      return;
    }

    const caption = renderCaption(rule.captionTemplate, story);
    const publishedPosts: RepostRulePublishedPost[] = [];
    let anySuccess = false;
    let anyFailure = false;

    for (const dest of destinations) {
      try {
        const skipReason = isVideo
          ? skipByVideoLimits(dest.providerIdentifier, rule)
          : null;
        if (skipReason) {
          publishedPosts.push({
            integrationId: dest.id,
            postId: '',
            error: skipReason,
          });
          anyFailure = true;
          continue;
        }

        const settings = buildDestinationSettings({
          providerIdentifier: dest.providerIdentifier,
          caption,
          storyId: story.id,
          ruleId: rule.id,
        });

        const created = await this._postsService.createPost(
          rule.organizationId,
          {
            type: 'schedule',
            order: makeId(10),
            shortLink: false,
            tags: [],
            date: dayjs().add(1, 'minute').toISOString(),
            posts: [
              {
                integration: { id: dest.id },
                group: `repost-${story.id}`,
                value: [
                  {
                    id: makeId(10),
                    delay: 0,
                    content: caption,
                    image: [
                      {
                        id: storedMedia.id,
                        path: storedMedia.path,
                      },
                    ],
                  },
                ],
                settings: settings as any,
              },
            ],
          },
          rule.profileId
        );

        const postId = created?.[0]?.postId || '';
        publishedPosts.push({
          integrationId: dest.id,
          postId,
        });
        anySuccess = true;
      } catch (err) {
        publishedPosts.push({
          integrationId: dest.id,
          postId: '',
          error: (err as Error).message || 'CREATE_POST_FAILED',
        });
        anyFailure = true;
      }
    }

    if (!anySuccess) {
      await this._repostRepository.markLogFailed(
        log.id,
        'ALL_DESTINATIONS_FAILED'
      );
      return;
    }

    await this._repostRepository.markLogPublished(
      log.id,
      publishedPosts,
      anyFailure
    );
  }

  private async loadDestinations(rule: {
    organizationId: string;
    profileId: string;
    destinationIntegrationIds: string[];
  }) {
    const integrations = await this._integrationService.getIntegrationsList(
      rule.organizationId,
      rule.profileId
    );
    return integrations
      .filter((i) => rule.destinationIntegrationIds.includes(i.id))
      .filter((i) => !i.disabled && !i.deletedAt);
  }
}

function renderCaption(
  template: string | null | undefined,
  story: { timestamp?: string }
): string {
  if (!template) return '';
  return template.replace(/\{\{\s*timestamp\s*\}\}/g, story.timestamp || '');
}

function skipByVideoLimits(
  providerIdentifier: string,
  rule: { filterMaxDurationSeconds?: number | null }
): string | null {
  // Nao temos duracao real da story antes de baixar (Graph API nao expoe).
  // V1: deixa o filterMaxDurationSeconds como gate opcional do usuario,
  // e confia que o provider rejeitara se ultrapassar limites reais.
  if (
    rule.filterMaxDurationSeconds &&
    providerIdentifier.startsWith('youtube') &&
    rule.filterMaxDurationSeconds > YOUTUBE_SHORTS_MAX_SECONDS
  ) {
    return 'DURATION_EXCEEDED_YOUTUBE_SHORTS';
  }
  if (
    rule.filterMaxDurationSeconds &&
    rule.filterMaxDurationSeconds < TIKTOK_MIN_SECONDS &&
    providerIdentifier.includes('tiktok')
  ) {
    return 'DURATION_BELOW_TIKTOK_MIN';
  }
  return null;
}

function buildDestinationSettings(input: {
  providerIdentifier: string;
  caption: string;
  storyId: string;
  ruleId: string;
}) {
  const trace = {
    isRepost: true,
    ruleId: input.ruleId,
    sourceItemId: input.storyId,
  };
  if (input.providerIdentifier === 'tiktok' || input.providerIdentifier === 'zernio-tiktok') {
    return {
      __type: input.providerIdentifier,
      title: input.caption ? input.caption.slice(0, 90) : '',
      privacy_level: 'PUBLIC_TO_EVERYONE',
      duet: true,
      stitch: true,
      comment: true,
      autoAddMusic: 'no',
      brand_content_toggle: false,
      brand_organic_toggle: false,
      content_posting_method: 'DIRECT_POST',
      ...trace,
    };
  }
  if (input.providerIdentifier === 'youtube' || input.providerIdentifier === 'zernio-youtube') {
    const baseTitle = input.caption
      ? input.caption.slice(0, 100)
      : `Story ${new Date().toISOString().slice(0, 10)}`;
    return {
      __type: input.providerIdentifier,
      title: baseTitle.length < 2 ? 'Story' : baseTitle,
      type: 'public',
      selfDeclaredMadeForKids: 'no',
      tags: [] as { value: string; label: string }[],
      ...trace,
    };
  }
  return {
    __type: input.providerIdentifier,
    ...trace,
  };
}
