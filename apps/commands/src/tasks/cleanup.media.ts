import { Command, Option } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { MediaCleanupService } from '@gitroom/nestjs-libraries/database/prisma/media/media.cleanup.service';

@Injectable()
export class CleanupMedia {
  constructor(private _mediaCleanupService: MediaCleanupService) {}
  @Command({
    command: 'cleanup:media',
    describe:
      'Remove midia antiga (env MEDIA_RETENTION_DAYS, default 30) que nao esteja ligada a nenhum post pendente. Idempotente.',
  })
  async run(
    @Option({
      name: 'days',
      describe: 'Sobrescreve a retencao em dias',
      type: 'number',
      required: false,
    })
    days?: number
  ) {
    const result = await this._mediaCleanupService.cleanup(days);
    console.log(
      `Cleanup concluido: ${result.deleted} removidas, ${result.skipped} protegidas.`
    );
    return result;
  }
}
