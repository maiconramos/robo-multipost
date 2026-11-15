import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentToolInterface } from '../agent.tool.interface';
import { AutomationManagementService } from '../../integrations/automations/automation-management.service';
import { automationTool } from './automation-tool.helper';
@Injectable()
export class SetCommentAutomationStatusTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'setCommentAutomationStatusTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Ativa, pausa ou arquiva a regra existente sem recriá-la. Use executionVersion retornada no detalhe; V2/V3 exigem expectedRevision do detalhe e não aceita DRAFT. Respeite a autorização do usuário para mudanças de estado; ativação revalida conexão, alvos e conflitos.',
      z
        .object({
          flowId: z.string().max(80),
          executionVersion: z.number().int().min(1).max(3).optional(),
          status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DRAFT']),
          expectedRevision: z.number().int().min(1).optional(),
        })
        .strict(),
      (scope, input) =>
        this.service.status(
          scope,
          input.flowId,
          input.executionVersion || 1,
          input.status,
          input.expectedRevision
        )
    );
  }
}
