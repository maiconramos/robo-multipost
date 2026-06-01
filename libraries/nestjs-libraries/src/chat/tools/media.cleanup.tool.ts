import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaCleanupService } from '@gitroom/nestjs-libraries/database/prisma/media/media.cleanup.service';
import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';

@Injectable()
export class MediaCleanupTool implements AgentToolInterface {
  constructor(private _mediaCleanupService: MediaCleanupService) {}
  name = 'cleanupMedia';

  run() {
    return createTool({
      id: 'cleanupMedia',
      description:
        'Remove midia antiga da galeria da organizacao atual (default 30 dias, ' +
        'env MEDIA_RETENTION_DAYS) que nao esteja ligada a nenhum post pendente. ' +
        'Idempotente: midia protegida nao e removida. Devolve quantas foram ' +
        'removidas e quantas foram protegidas.',
      inputSchema: z.object({
        days: z
          .string()
          .optional()
          .describe('Sobrescreve a retencao em dias (default 30)'),
      }),
      outputSchema: z.object({
        deleted: z.number(),
        skipped: z.number(),
        failed: z.number(),
      }),
      execute: async (input: any) => {
        const org = getAuth<{ id: string }>();
        if (!org?.id) {
          throw new Error('MCP: organizacao ausente no contexto');
        }
        const days = input?.days ? parseInt(input.days, 10) : undefined;
        return this._mediaCleanupService.cleanup(days, org.id);
      },
    });
  }
}
