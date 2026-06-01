import { Injectable, Logger } from '@nestjs/common';
import { MediaRepository } from './media.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _postsService: PostsService
  ) {}

  static resolveRetentionDays(override?: number): number {
    if (typeof override === 'number' && override > 0) return override;
    const fromEnv = parseInt(process.env.MEDIA_RETENTION_DAYS || '', 10);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 30;
  }

  async cleanup(
    retentionDaysOverride?: number,
    orgId?: string
  ): Promise<{ deleted: number; skipped: number }> {
    const retentionDays =
      MediaCleanupService.resolveRetentionDays(retentionDaysOverride);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const candidates = await this._mediaRepository.getDeletableMedia(
      cutoff,
      orgId
    );
    if (candidates.length === 0) {
      return { deleted: 0, skipped: 0 };
    }

    const referenced = await this._postsService.getReferencedMediaPaths(orgId);

    let deleted = 0;
    let skipped = 0;
    for (const media of candidates) {
      if (referenced.has(media.path)) {
        skipped++;
        continue;
      }
      try {
        await this.storage.removeFile(media.path);
      } catch (e) {
        this.logger.error(
          `cleanup: falha ao remover arquivo ${media.path}: ${
            (e as Error).message
          }`
        );
      }
      await this._mediaRepository.deleteMedia(
        media.organizationId,
        media.id,
        undefined
      );
      deleted++;
    }

    this.logger.log(
      `MediaCleanup: ${deleted} midias removidas, ${skipped} protegidas (post pendente), retencao ${retentionDays}d`
    );
    return { deleted, skipped };
  }
}
