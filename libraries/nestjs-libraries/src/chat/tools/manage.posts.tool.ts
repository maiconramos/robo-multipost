import { HttpException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentToolInterface } from '../agent.tool.interface';
import { automationTool } from './automation-tool.helper';
import { PostManagementService } from '../../database/prisma/posts/post-management.service';
import {
  managedPostListSchema,
  managedPostPatchSchema,
  managedPostActionSchema,
  managedPostOptionsSchema,
} from '../../dtos/posts/post-management.dto';
const postId = z.string().min(1).max(100);
@Injectable()
export class ListPostsTool implements AgentToolInterface {
  constructor(private readonly service: PostManagementService) {}
  name = 'listPostsTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Lista posts/agendamentos existentes: chave geral sem profileId consulta a organização e identifica o cliente em cada post; profileId restringe ao cliente. Filtros de data, canal, estado e paginação. customer é agrupamento legado de canais, não o perfil do cliente. Não publica. Use o ID interno retornado para consultar/editar, nunca recrie um agendamento para corrigir conteúdo ou horário.',
      managedPostListSchema,
      (scope, i) => this.service.list(scope, i),
      (org, i) => this.service.listOrganization(org, i)
    );
  }
}
@Injectable()
export class GetPostTool implements AgentToolInterface {
  constructor(private readonly service: PostManagementService) {}
  name = 'getPostTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Consulta configuração completa de um destino: mensagens/comentários encadeados, mídias/alt/thumbnail, settings, tags, intervalo, estado e version. Consulte antes de editar. includeDeleted=true permite recuperar snapshot para stop após exclusão local com falha de sincronização.',
      z.object({ postId, includeDeleted: z.boolean().optional() }).strict(),
      (scope, i) =>
        this.service.detail(scope, i.postId, i.includeDeleted || false)
    );
  }
}
@Injectable()
export class UpdatePostTool implements AgentToolInterface {
  constructor(private readonly service: PostManagementService) {}
  name = 'updatePostTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Edita post existente com expectedVersion do detalhe, preservando ID/grupo/canal e automações. Campos omitidos permanecem. messages substitui a cadeia completa; mantenha IDs existentes, novos comentários omitem id. settings faz merge de valores JSON. Publicado exige localOnly=true e não altera conteúdo remoto, não reinicia recorrência e não republica. Confira integrationSchema antes de mudar settings. Falha saved=true mantém o post; nunca recrie por retry.',
      managedPostPatchSchema.extend({ postId }).strict(),
      (scope, i) => {
        const { postId: id, ...body } = i;
        return this.service.update(scope, id, body);
      }
    );
  }
}
@Injectable()
export class ManagePostScheduleTool implements AgentToolInterface {
  constructor(private readonly service: PostManagementService) {}
  name = 'managePostScheduleTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Opera o mesmo post com expectedVersion: schedule altera horário/retoma; cancel cancela futuros envios/recorrência; publish_now publica de verdade; delete exclui só o registro local desta cadeia, não da rede; sync recupera QUEUE/DRAFT; stop persiste rascunho e desliga recorrência antes de parar Temporal, inclusive após o horário previsto; publicados preservam resultado e excluídos permitem repetir a parada. retry_publish exige republish=true e pode publicar novamente após conferir resultado incerto. Publicados só republicam com republish=true e autorização explícita do usuário. Não use publish_now/republish/delete como diagnóstico. Um envio já iniciado não pode ser desfeito.',
      managedPostActionSchema.extend({ postId }).strict(),
      (scope, i) => {
        const { postId: id, ...body } = i;
        return this.service.action(scope, id, body);
      }
    );
  }
}
@Injectable()
export class GetPostOptionsTool implements AgentToolInterface {
  constructor(private readonly service: PostManagementService) {}
  name = 'getPostOptionsTool';
  run() {
    return automationTool(
      this.service,
      this.name,
      'Descobre capabilities de gerenciamento, tags disponíveis e free_slot por integrationId no perfil. As consultas não agendam nem publicam. Settings específicos da rede são descobertos por integrationSchema.',
      managedPostOptionsSchema,
      (scope, i) => this.service.options(scope, i),
      (_org, i) => {
        if (i.resource !== 'capabilities')
          throw new HttpException('PROFILE_REQUIRED', 400);
        return this.service.capabilities();
      }
    );
  }
}
