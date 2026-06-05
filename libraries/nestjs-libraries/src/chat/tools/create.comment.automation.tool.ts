import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { readRequestContext } from '@gitroom/nestjs-libraries/chat/tools/tool.context.helper';
import { checkPublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/validators/is-public-https-url.validator';

/**
 * Ferramenta MCP que cria uma automacao de comentario/story do Instagram.
 *
 * Seguranca (regras do chat/CLAUDE.md):
 *  - NUNCA aceita orgId/profileId no inputSchema (forjavel pelo prompt) — le do
 *    AsyncLocalStorage via checkAuth + readRequestContext.
 *  - inputSchema e sempre z.object (clientes estritos como n8n exigem) e nao usa
 *    z.any() (Gemini rejeita) — campos sao tipos concretos/enums.
 *  - dmButtonUrl e validado aqui e revalidado no FlowsService.quickCreateFlow.
 *  - A autorizacao por integracao (org/perfil/IG/desativada) e enforced dentro
 *    de FlowsService.assertIntegrationAccess — mesma porta dos caminhos REST/SDK.
 */
@Injectable()
export class CreateCommentAutomationTool implements AgentToolInterface {
  constructor(private _flowsService: FlowsService) {}
  name = 'createCommentAutomationTool';

  run() {
    return createTool({
      id: 'createCommentAutomationTool',
      description: `
Cria uma automacao do Instagram que responde a comentarios (ou a respostas de story).
Quando alguem comenta uma palavra-chave (ex.: "EU QUERO") em um post, o sistema
pode responder publicamente e/ou enviar uma mensagem direta (DM) com um link/botao.

Use postMode='next_publication' (padrao) para encadear: crie a automacao e ela se
conecta sozinha ao PROXIMO post publicado no canal — sem precisar do id de midia.
Use postMode='specific' apenas quando ja tiver os ids de midia (postIds/storyIds).
Sempre confirme com o usuario o conteudo (gatilho, palavras-chave, resposta, DM,
link) ANTES de criar a automacao.
`,
      inputSchema: z.object({
        integrationId: z
          .string()
          .describe('ID da integracao (canal) do Instagram onde a automacao roda'),
        name: z.string().describe('Nome curto da automacao'),
        triggerType: z
          .enum(['comment_on_post', 'story_reply'])
          .optional()
          .describe('Gatilho: comentario em post (padrao) ou resposta a story'),
        postMode: z
          .enum(['all', 'specific', 'next_publication'])
          .optional()
          .describe(
            "Vinculo ao post: 'next_publication' (padrao, conecta ao proximo post publicado), 'specific' (ids informados) ou 'all' (qualquer post do canal)"
          ),
        postIds: z
          .array(z.string())
          .optional()
          .describe('IDs de midia do Instagram quando postMode=specific (comment_on_post)'),
        storyIds: z
          .array(z.string())
          .optional()
          .describe('IDs de story quando postMode=specific e triggerType=story_reply'),
        keywords: z
          .array(z.string())
          .optional()
          .describe('Palavras-chave a casar no comentario. Vazio = casa qualquer comentario'),
        matchMode: z
          .enum(['any', 'all', 'exact'])
          .optional()
          .describe('any=ao menos uma keyword | all=todas | exact=comentario inteiro igual'),
        replyMessage: z
          .string()
          .optional()
          .describe('Resposta publica ao comentario (apenas comment_on_post)'),
        dmMessage: z
          .string()
          .optional()
          .describe('Mensagem direta (DM) enviada ao autor do comentario'),
        dmButtonText: z
          .string()
          .optional()
          .describe('Texto do botao da DM (ex.: "Quero o link"). Necessario se houver dmButtonUrl'),
        dmButtonUrl: z
          .string()
          .optional()
          .describe('URL https publica do botao da DM (ex.: link do post do blog)'),
        requireFollow: z
          .boolean()
          .optional()
          .describe('Exigir que o usuario siga o perfil antes de receber a DM (follow-gate)'),
        followGateMessage: z
          .string()
          .optional()
          .describe('Mensagem enviada quando o usuario ainda nao segue (usado com requireFollow)'),
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

        // Valida a URL do botao antes de delegar (o service tambem revalida).
        if (input.dmButtonUrl) {
          const urlError = checkPublicHttpsUrl(input.dmButtonUrl);
          if (urlError) {
            return {
              errors: JSON.stringify([{ field: 'dmButtonUrl', error: urlError }]),
            };
          }
        }

        try {
          const flow = await this._flowsService.quickCreateFlow(
            organizationId,
            {
              name: input.name,
              integrationId: input.integrationId,
              triggerType: input.triggerType,
              postMode: input.postMode ?? 'next_publication',
              postIds: input.postIds,
              storyIds: input.storyIds,
              keywords: input.keywords,
              matchMode: input.matchMode,
              replyMessage: input.replyMessage,
              dmMessage: input.dmMessage,
              dmButtonText: input.dmButtonText,
              dmButtonUrl: input.dmButtonUrl,
              requireFollow: input.requireFollow,
              followGateMessage: input.followGateMessage,
            } as any,
            profileId
          );

          return {
            output: {
              id: flow.id,
              name: flow.name,
              integrationId: flow.integrationId,
              status: flow.status,
              triggerType: input.triggerType ?? 'comment_on_post',
              postMode: input.postMode ?? 'next_publication',
            },
          };
        } catch (e: any) {
          return {
            errors: JSON.stringify([
              { error: e?.message || 'Falha ao criar a automacao de comentario' },
            ]),
          };
        }
      },
    });
  }
}
