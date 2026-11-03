import { HttpException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentToolInterface } from '../agent.tool.interface';
import { AutomationManagementService } from '../../integrations/automations/automation-management.service';
import {
  automationAliasesSchema,
  automationCanvasSchema,
  automationConfigurationSchema,
  automationOptionsSchema,
  repostRequestSchema,
} from '../../dtos/flows/automation-management.dto';
import { automationHistoryQuerySchema } from '../../dtos/flows/automation-history.dto';
import { automationTool } from './automation-tool.helper';
const identity = {
  flowId: z.string().max(80),
  executionVersion: z.number().int().min(1).max(2).optional(),
};
@Injectable()
export class GetCommentAutomationTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'getCommentAutomationTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Detalha regra com configuração completa, grafo, alvos, aliases e versão. quickEditable=false exige saveAutomationCanvasTool para preservar ramificações. Na edição Instagram use updatedAt como expectedUpdatedAt; Facebook/Messenger usa revision como expectedRevision.',
      z.object(identity).strict(),
      (scope, i) =>
        this.service.detail(scope, i.flowId, i.executionVersion || 1)
    );
  }
}
@Injectable()
export class UpdateCommentAutomationTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'updateCommentAutomationTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Edita campos de uma regra rápida existente, preservando campos omitidos e o ID. Consulte getCommentAutomationTool primeiro. Exige expectedUpdatedAt em V1 ou expectedRevision em V2. Não muda rede/conta/gatilho, não achata grafo avançado e não muda estado; para aliases use manageAutomationAliasesTool.',
      z
        .object({
          ...identity,
          configuration: automationConfigurationSchema.partial(),
          expectedRevision: z.number().int().min(1).optional(),
          expectedUpdatedAt: z.string().datetime().optional(),
        })
        .strict(),
      (scope, i) =>
        this.service.update(
          scope,
          i.flowId,
          i.executionVersion || 1,
          i as {
            configuration: unknown;
            expectedRevision?: number;
            expectedUpdatedAt?: string;
          }
        )
    );
  }
}
@Injectable()
export class GetAutomationOptionsTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'getAutomationOptionsTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Descobre capacidades/campos, contas, publicações, Stories, agendados internos, prontidão e ID de Dark Post Facebook por URL/ID. Consulta não ativa nem envia mensagens. Nenhum token é retornado. resource=capabilities não exige integrationId; os demais recursos de canal exigem o ID.',
      automationOptionsSchema,
      (scope, i) => this.service.options(scope, i),
      (_org, i) => {
        if (i.resource !== 'capabilities')
          throw new HttpException('PROFILE_REQUIRED', 400);
        return this.service.capabilities();
      }
    );
  }
}
@Injectable()
export class GetAutomationHistoryTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'getAutomationHistoryTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Histórico legado, compatível com page/limit V1. Prefira getAutomationExecutionHistoryTool para filtros e cursor e getAutomationExecutionDetailTool para etapas reais. Não dispara nem repete envios.',
      z
        .object({
          ...identity,
          page: z.number().int().min(1).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .strict(),
      (scope, i) =>
        this.service.history(
          scope,
          i.flowId,
          i.executionVersion || 1,
          i.page,
          i.limit
        )
    );
  }
}
@Injectable()
export class GetAutomationExecutionHistoryTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'getAutomationExecutionHistoryTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Consulta o mesmo histórico do painel, no perfil autenticado. Filtros status/from/to e cursor opaco; limit 1–50 (padrão 25). Preserve executionVersion (1 Instagram V1, 2 Facebook/Messenger/V2). Retorna items e nextCursor, sem total inferido. UNKNOWN não é falha comprovada; aceite não comprova entrega. Nunca executa nem reenvia.',
      automationHistoryQuerySchema.extend(identity).strict(),
      (scope, input) => {
        const { flowId, executionVersion = 1, ...filters } = input;
        return this.service.executionHistory(
          scope,
          flowId,
          executionVersion,
          filters
        );
      }
    );
  }
}
@Injectable()
export class GetAutomationExecutionDetailTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'getAutomationExecutionDetailTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Detalha uma execução específica da regra/motor/perfil autenticado: interação recebida, etapas registradas, resultados, avisos de recorte e IDs técnicos. Não retorna snapshot/payload/erro bruto. No Instagram antigo uma etapa de DM concluída pode ser só preparação. Aceito pela Meta não comprova entrega. Nunca reenvia.',
      z
        .object({ ...identity, executionId: z.string().min(1).max(100) })
        .strict(),
      (scope, input) =>
        this.service.executionDetail(
          scope,
          input.flowId,
          input.executionVersion || 1,
          input.executionId
        )
    );
  }
}
@Injectable()
export class ManageAutomationAliasesTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'manageAutomationAliasesTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Lista/adiciona/remove aliases de Dark Posts de uma regra Instagram existente. add usa aliasMediaId numérico; remove usa aliasId retornado na consulta. Remover para de monitorar esse alias, mantendo regra e demais alvos. Facebook usa resolve_post e postIds.',
      automationAliasesSchema.extend({ flowId: z.string().max(80) }).strict(),
      (scope, i) => {
        const { flowId, ...q } = i;
        return this.service.aliases(scope, flowId, q);
      }
    );
  }
}
@Injectable()
export class SaveAutomationCanvasTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'saveAutomationCanvasTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Salva explicitamente o grafo completo de uma regra, incluindo condições, ramificações, atrasos e configurações por nó. Consulte detalhe e capabilities; nodes[].data é JSON string. Exige expectedUpdatedAt para V1 e expectedRevision para V2. Canais/alvos V2 omitidos são preservados. Não ativa rascunho nem envia mensagem por si só.',
      z.object({ ...identity, canvas: automationCanvasSchema }).strict(),
      (scope, i) =>
        this.service.canvas(scope, i.flowId, i.executionVersion || 1, i.canvas)
    );
  }
}
@Injectable()
export class ManageRepostAutomationTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'manageRepostAutomationTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Gerencia o recurso separado de repost: candidatos, lista/detalhe, configuração completa, edição parcial, toggle, archive e histórico. create/enabled=true ativa processamento real. run_now executa agora; reset_checkpoint reinicia o ponto de leitura e pode voltar a processar conteúdo. Use essas operações somente quando explicitamente solicitadas pelo usuário.',
      repostRequestSchema,
      (scope, i) => this.service.repost(scope, i)
    );
  }
}
