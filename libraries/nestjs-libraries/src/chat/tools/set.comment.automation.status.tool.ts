import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { FlowStatus } from '@prisma/client';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { readRequestContext } from '@gitroom/nestjs-libraries/chat/tools/tool.context.helper';

/**
 * Ferramenta MCP que ativa / pausa / arquiva uma automacao de comentario do
 * Instagram. org/profileId vem do contexto (AsyncLocalStorage). Ativar dispara
 * a validacao de nos + a assinatura de webhook no FlowsService.updateFlowStatus.
 *
 * Operacoes destrutivas (excluir/editar fino) ficam de fora do MCP por padrao —
 * disponiveis via API REST publica / SDK.
 */
@Injectable()
export class SetCommentAutomationStatusTool implements AgentToolInterface {
  constructor(private _flowsService: FlowsService) {}
  name = 'setCommentAutomationStatusTool';

  run() {
    return createTool({
      id: 'setCommentAutomationStatusTool',
      description:
        'Ativa, pausa ou arquiva uma automacao de comentario do Instagram existente. Confirme com o usuario antes de pausar/arquivar uma automacao ativa.',
      inputSchema: z.object({
        flowId: z.string().describe('ID da automacao a alterar'),
        status: z
          .enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DRAFT'])
          .describe('Novo status: ACTIVE (ativar), PAUSED (pausar), ARCHIVED (arquivar), DRAFT'),
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

        try {
          const flow = await this._flowsService.updateFlowStatus(
            organizationId,
            input.flowId,
            input.status as FlowStatus,
            profileId
          );
          return { output: { id: flow.id, status: flow.status } };
        } catch (e: any) {
          return {
            errors: JSON.stringify([
              { error: e?.message || 'Falha ao alterar o status da automacao' },
            ]),
          };
        }
      },
    });
  }
}
