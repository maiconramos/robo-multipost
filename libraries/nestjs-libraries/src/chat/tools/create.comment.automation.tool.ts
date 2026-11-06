import { Injectable } from '@nestjs/common';
import { AgentToolInterface } from '../agent.tool.interface';
import { AutomationManagementService } from '../../integrations/automations/automation-management.service';
import { automationConfigurationSchema } from '../../dtos/flows/automation-management.dto';
import { automationTool } from './automation-tool.helper';
@Injectable()
export class CreateCommentAutomationTool implements AgentToolInterface {
  constructor(private readonly service: AutomationManagementService) {}
  name = 'createCommentAutomationTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Cria automação Instagram de comentário/Story ou Facebook de comentário/Messenger no perfil autenticado. Chave de organização exige profileId explícito do cliente, validado contra a conta; nunca usa Default implícito. Chave de perfil só permite o próprio. Consulte getAutomationOptionsTool(resource=capabilities) para campos por gatilho. Suporta dmVariants (1–10 alternativas privadas com texto e botão próprios) e dmMessages (textos com botão comum); entrega uma alternativa por execução, sem garantia contra bloqueios, variações públicas, follow-gate completo Instagram, Dark Post aliases e post agendado. Para agendados use Post.id interno e uma regra por destino; next_publication somente para a próxima publicação sem alvo agendado. activate=false salva rascunho; padrão ativa conforme a autorização do usuário. Se retornar saved=true com erro, retome o mesmo ID e nunca crie outra regra por retry.',
      automationConfigurationSchema,
      (scope, input) => this.service.create(scope, input)
    );
  }
}
