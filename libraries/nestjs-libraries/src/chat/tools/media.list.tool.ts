import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import {
  getAuth,
  getProfileId,
} from '@gitroom/nestjs-libraries/chat/async.storage';

@Injectable()
export class MediaListTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'listMedia';

  run() {
    return createTool({
      id: 'listMedia',
      description:
        'Lista a midia da galeria do perfil atual (imagens e videos hospedados ' +
        'no storage do Postiz), com estatisticas de quantidade e tamanho total. ' +
        'Use para inspecionar o que ja existe antes de gerar nova midia ou de ' +
        'rodar uma limpeza com cleanupMedia.',
      inputSchema: z.object({
        page: z
          .string()
          .optional()
          .describe('Pagina da listagem (default 1)'),
      }),
      outputSchema: z.object({
        total: z.number(),
        totalSizeBytes: z.number(),
        items: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            path: z.string(),
          })
        ),
      }),
      execute: async (input: any) => {
        const org = getAuth<{ id: string }>();
        if (!org?.id) {
          throw new Error('MCP: organizacao ausente no contexto');
        }
        const profileId = getProfileId();
        const page = parseInt(input?.page || '1', 10) || 1;
        const stats = await this._mediaService.getMediaStats(org.id, profileId);
        const list = await this._mediaService.getMedia(org.id, page, profileId);
        return {
          total: stats.total,
          totalSizeBytes: stats.totalSizeBytes,
          items: list.results.map((m) => ({
            id: m.id,
            name: m.name,
            path: m.path,
          })),
        };
      },
    });
  }
}
