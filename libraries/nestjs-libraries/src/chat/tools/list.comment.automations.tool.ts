import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { readRequestContext } from '@gitroom/nestjs-libraries/chat/tools/tool.context.helper';

/**
 * Ferramenta MCP que lista as automacoes de comentario/story do Instagram do
 * workspace/perfil ativo. org/profileId vem do contexto (AsyncLocalStorage),
 * nunca do input — o escopo por-perfil e enforced pelo repositorio.
 */
@Injectable()
export class ListCommentAutomationsTool implements AgentToolInterface {
  constructor(private _flowsService: FlowsService) {}
  name = 'listCommentAutomationsTool';

  run() {
    return createTool({
      id: 'listCommentAutomationsTool',
      description:
        'Lista as automacoes de comentario/story do Instagram (nome, status e canal). Use para mostrar ao usuario as automacoes existentes antes de criar/editar/ativar.',
      inputSchema: z.object({
        integrationId: z
          .string()
          .optional()
          .describe('Opcional: filtra as automacoes por canal (integrationId) do Instagram'),
      }),
      execute: async (input: any, options: any) => {
        checkAuth(input, options);
        const requestContext = readRequestContext(options);
        const rawOrg = requestContext.get('organization') as string;
        if (!rawOrg) {
          return {
            errors: JSON.stringify([
              { error: 'Sessao sem organizacao no contexto. Refaca a autenticacao.' },
            ]),
          };
        }
        const organizationId = JSON.parse(rawOrg).id;
        const profileId =
          (requestContext.get('profileId') as string) || undefined;

        const flows = await this._flowsService.getFlows(organizationId, profileId);
        const filtered = input.integrationId
          ? flows.filter((f: any) => f.integrationId === input.integrationId)
          : flows;

        return {
          output: filtered.map((f: any) => ({
            id: f.id,
            name: f.name,
            status: f.status,
            integrationId: f.integrationId,
          })),
        };
      },
    });
  }
}
