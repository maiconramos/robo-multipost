import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { FlowStatus } from '@prisma/client';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import {
  getAuth,
  getProfileId,
} from '@gitroom/nestjs-libraries/chat/async.storage';

function requireOrgId(): string {
  const org = getAuth<{ id: string }>();
  if (!org?.id) {
    throw new Error('MCP: organizacao ausente no contexto');
  }
  return org.id;
}

/**
 * Lista as automacoes (Flows) do perfil ativo.
 */
@Injectable()
export class ListAutomationsTool implements AgentToolInterface {
  constructor(private _flowsService: FlowsService) {}
  name = 'listAutomations';

  run() {
    return createTool({
      id: 'listAutomations',
      description:
        'Lista as automacoes (Flows de comentario->resposta/DM, story reply, ' +
        'follow-gate) do perfil ativo. Use para ver o que ja existe antes de ' +
        'criar uma nova ou para pegar o id de uma automacao a (des)ativar.',
      outputSchema: z.object({ output: z.any() }),
      execute: async () => {
        const orgId = requireOrgId();
        const flows = await this._flowsService.getFlows(orgId, getProfileId());
        return { output: flows };
      },
    });
  }
}

/**
 * Lista posts recentes do Instagram de uma integracao, para escolher o post
 * alvo (postIds) ao criar uma automacao de comentario.
 */
@Injectable()
export class ListInstagramPostsForAutomationTool implements AgentToolInterface {
  constructor(private _flowsService: FlowsService) {}
  name = 'listInstagramPostsForAutomation';

  run() {
    return createTool({
      id: 'listInstagramPostsForAutomation',
      description:
        'Lista posts recentes do Instagram de uma integracao para escolher o ' +
        'post alvo (postIds) ao criar uma automacao de comentario. Requer o ' +
        'integrationId de uma conta Instagram (use integrationList para obter).',
      inputSchema: z.object({
        integrationId: z
          .string()
          .describe('Id da integracao Instagram (de integrationList)'),
        cursor: z
          .string()
          .optional()
          .describe('Cursor de paginacao (nextCursor da chamada anterior)'),
        limit: z
          .number()
          .optional()
          .describe('Quantidade de posts a retornar (padrao 25)'),
      }),
      outputSchema: z.object({ output: z.any() }),
      execute: async (input: any) => {
        const orgId = requireOrgId();
        const result = await this._flowsService.getInstagramPostsByIntegration(
          orgId,
          input.integrationId,
          input.cursor,
          input.limit ?? 25
        );
        return { output: result };
      },
    });
  }
}

/**
 * Cria uma automacao de comentario (gatilho comment_on_post -> resposta no
 * comentario e/ou DM). Mapeia os campos para o QuickCreateFlowDto. Para a
 * automacao disparar de verdade e necessario configurar credenciais Meta +
 * webhook (ver _HANDOFF.md, Trilha B); a checagem de webhook roda dentro do
 * quickCreateFlow e lanca um erro com instrucoes se faltar configuracao.
 */
@Injectable()
export class CreateCommentAutomationTool implements AgentToolInterface {
  constructor(private _flowsService: FlowsService) {}
  name = 'createCommentAutomation';

  run() {
    return createTool({
      id: 'createCommentAutomation',
      description:
        'Cria uma automacao de comentario no Instagram: quando alguem comenta ' +
        '(opcionalmente contendo certas palavras-chave) em um post, o sistema ' +
        'responde no comentario e/ou envia uma DM. Use integrationList para o ' +
        'integrationId e listInstagramPostsForAutomation para os postIds.',
      inputSchema: z.object({
        name: z.string().describe('Nome da automacao'),
        integrationId: z
          .string()
          .describe('Id da integracao Instagram (de integrationList)'),
        postMode: z
          .enum(['all', 'specific', 'next_publication'])
          .optional()
          .describe(
            "Quais posts monitorar: 'all' = todos, 'specific' = os de postIds, " +
              "'next_publication' = a proxima publicacao. Padrao 'specific'."
          ),
        postIds: z
          .array(z.string())
          .optional()
          .describe("Ids dos posts alvo quando postMode='specific'"),
        keywords: z
          .array(z.string())
          .optional()
          .describe('Palavras-chave que o comentario deve conter (opcional)'),
        matchMode: z
          .enum(['any', 'all'])
          .optional()
          .describe(
            "'any' = qualquer palavra-chave dispara; 'all' = exige todas."
          ),
        replyMessages: z
          .array(z.string())
          .optional()
          .describe(
            'Mensagens de resposta no comentario (a primeira e usada; varias ' +
              'permitem rotacao). Deixe vazio para nao responder no comentario.'
          ),
        dmMessage: z
          .string()
          .optional()
          .describe('Texto da DM enviada ao autor do comentario (opcional)'),
        dmButtonText: z
          .string()
          .optional()
          .describe('Texto de um botao na DM (opcional)'),
        dmButtonUrl: z
          .string()
          .optional()
          .describe('URL do botao na DM (opcional)'),
        requireFollow: z
          .boolean()
          .optional()
          .describe(
            'Quando true, exige que o usuario siga a conta antes de receber o ' +
              'conteudo final (follow-gate). Padrao false.'
          ),
        followGateMessage: z
          .string()
          .optional()
          .describe('Mensagem do follow-gate quando requireFollow=true'),
      }),
      outputSchema: z.object({ output: z.any() }),
      execute: async (input: any) => {
        const orgId = requireOrgId();
        const flow = await this._flowsService.quickCreateFlow(
          orgId,
          {
            name: input.name,
            integrationId: input.integrationId,
            triggerType: 'comment_on_post',
            postMode: input.postMode ?? 'specific',
            postIds: input.postIds,
            keywords: input.keywords,
            matchMode: input.matchMode,
            replyMessages: input.replyMessages,
            dmMessage: input.dmMessage,
            dmButtonText: input.dmButtonText,
            dmButtonUrl: input.dmButtonUrl,
            requireFollow: input.requireFollow,
            followGateMessage: input.followGateMessage,
          },
          getProfileId()
        );
        return { output: flow };
      },
    });
  }
}

/**
 * Liga/desliga (ou arquiva) uma automacao existente.
 */
@Injectable()
export class SetAutomationStatusTool implements AgentToolInterface {
  constructor(private _flowsService: FlowsService) {}
  name = 'setAutomationStatus';

  run() {
    return createTool({
      id: 'setAutomationStatus',
      description:
        'Altera o status de uma automacao existente: ACTIVE (liga), PAUSED ' +
        '(desliga), DRAFT (rascunho) ou ARCHIVED (arquiva). Use listAutomations ' +
        'para obter o id.',
      inputSchema: z.object({
        flowId: z.string().describe('Id da automacao (de listAutomations)'),
        status: z
          .enum(['ACTIVE', 'PAUSED', 'DRAFT', 'ARCHIVED'])
          .describe('Novo status da automacao'),
      }),
      outputSchema: z.object({ output: z.any() }),
      execute: async (input: any) => {
        const orgId = requireOrgId();
        const updated = await this._flowsService.updateFlowStatus(
          orgId,
          input.flowId,
          input.status as FlowStatus,
          getProfileId()
        );
        return { output: updated };
      },
    });
  }
}
