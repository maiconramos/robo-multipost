import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import z from 'zod';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import {
  agentProfileSelector,
  resolveAgentProfile,
} from './agent-profile-scope';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { readRequestContext } from '@gitroom/nestjs-libraries/chat/tools/tool.context.helper';

// Chave de perfil consulta o proprio cliente e midia compartilhada.
// Chave de organizacao pode selecionar cliente por chamada ou consultar o conjunto.
@Injectable()
export class MediaListTool implements AgentToolInterface {
  constructor(
    private _mediaService: MediaService,
    private readonly profiles: ProfileService
  ) {}
  name = 'mediaListTool';

  run() {
    return createTool({
      id: 'mediaListTool',
      description: `Lista a mídia (imagens e vídeos) já enviada à biblioteca, da mais recente para a mais antiga, 18 por página, com busca opcional pelo nome original do arquivo.
Use o path devolvido como mídia em schedulePostTool em vez de enviar o arquivo de novo.`,
      inputSchema: z.object({
        profileId: agentProfileSelector,
        search: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Filtra pelo nome original do arquivo (contém, sem diferenciar maiúsculas)'
          ),
        page: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Número da página, começando em 1'),
      }),
      mcp: {
        annotations: {
          title: 'Listar mídia',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        pages: z.number(),
        output: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            originalName: z.string().nullable(),
            path: z.string(),
            createdAt: z.string(),
            profileId: z.string().nullable().optional(),
            profile: z
              .object({ id: z.string(), name: z.string() })
              .nullable()
              .optional(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const { organization, profileId } = await resolveAgentProfile(
          this.profiles,
          context,
          inputData.profileId
        );
        const organizationId = organization.id;

        const { pages, results } = await this._mediaService.getMedia(
          organizationId,
          inputData.page || 1,
          profileId,
          inputData.search
        );

        return {
          pages,
          output: results.map((p: any) => ({
            id: p.id,
            profileId: p.profileId,
            profile: p.profile,
            name: p.name,
            originalName: p.originalName ?? null,
            path: p.path,
            createdAt: new Date(p.createdAt).toISOString(),
          })),
        };
      },
    });
  }
}
