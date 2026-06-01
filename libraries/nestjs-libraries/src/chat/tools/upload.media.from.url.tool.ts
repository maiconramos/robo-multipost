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
export class UploadMediaFromUrlTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'uploadMediaFromUrl';

  run() {
    return createTool({
      id: 'uploadMediaFromUrl',
      description:
        'Hospeda uma imagem ou video a partir de uma URL publica no storage do ' +
        'Postiz e devolve o link interno (id + path), pronto para ser usado como ' +
        'attachment no integrationSchedulePostTool. Use antes de agendar um post ' +
        'que precise de midia que ainda esta em uma URL externa (ex.: carrossel).',
      inputSchema: z.object({
        url: z.string().describe('URL publica da imagem ou video a hospedar'),
        fileName: z
          .string()
          .optional()
          .describe(
            'Nome do arquivo (opcional); inferido da URL quando ausente'
          ),
      }),
      outputSchema: z.object({
        id: z.string(),
        path: z.string(),
      }),
      execute: async (input: any) => {
        const org = getAuth<{ id: string }>();
        if (!org?.id) {
          throw new Error('MCP: organizacao ausente no contexto');
        }
        const media = await this._mediaService.uploadFromUrl(
          org.id,
          input.url,
          input.fileName,
          getProfileId()
        );
        return { id: media.id, path: media.path };
      },
    });
  }
}
