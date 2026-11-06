import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentToolInterface } from '../agent.tool.interface';
import { AutomationManagementService } from '../../integrations/automations/automation-management.service';
import { automationTool } from './automation-tool.helper';
@Injectable()
export class ListCommentAutomationsTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'listCommentAutomationsTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Lista automações de Instagram, Facebook e Messenger do perfil autenticado/selecionado; chave geral sem profileId lista todos os clientes com identificação do perfil e executionVersion explícita. Omitir versão lista os dois motores; 1=Instagram, 2=Facebook/Messenger. Consulte o detalhe antes de editar.',
      z
        .object({
          executionVersion: z.number().int().min(1).max(2).optional(),
          integrationId: z.string().max(80).optional(),
        })
        .strict(),
      (scope, input) =>
        this.service.list(scope, input.executionVersion, input.integrationId),
      (org, input) =>
        this.service.listOrganization(
          org,
          input.executionVersion,
          input.integrationId
        )
    );
  }
}
