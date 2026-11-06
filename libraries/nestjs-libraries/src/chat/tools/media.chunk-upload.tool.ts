import { Injectable } from '@nestjs/common';
import { AgentToolInterface } from '../agent.tool.interface';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { MediaChunkUploadService } from '../../upload/media-chunk-upload.service';
import {
  beginMediaUploadSchema,
  appendMediaUploadSchema,
  mediaUploadSessionSchema,
} from '../../dtos/media/agent-media.dto';
import { scopedAgentTool } from './scoped-agent-tool.helper';

@Injectable()
export class BeginMediaUploadTool implements AgentToolInterface {
  constructor(
    private readonly uploads: MediaChunkUploadService,
    private readonly profiles: ProfileService
  ) {}
  name = 'beginMediaUploadTool';
  run() {
    return scopedAgentTool(
      this.profiles,
      this.name,
      'Inicia envio de arquivo local em partes (MP4 até 1 GiB; imagens até 10 MiB). Cliente fornece filename, tamanho exato size e SHA-256 hexadecimal do arquivo inteiro. Não recebe caminho de disco: use script/cliente para ler os bytes. Retorna uploadId, offset, maxChunkBytes e validade. Sessão privada vinculada ao perfil autenticado/selecionado; chave geral exige o mesmo profileId em todas as fases. Efêmera por backend/1 hora; réplicas exigem afinidade. Envie partes sem colocá-las no prompt da IA. Não publica conteúdo.',
      beginMediaUploadSchema,
      async ({ organization, profileId }, input) =>
        this.uploads.begin(organization.id, profileId, input),
      false
    );
  }
}
@Injectable()
export class AppendMediaUploadTool implements AgentToolInterface {
  constructor(
    private readonly uploads: MediaChunkUploadService,
    private readonly profiles: ProfileService
  ) {}
  name = 'appendMediaUploadTool';
  run() {
    return scopedAgentTool(
      this.profiles,
      this.name,
      'Envia até 2 MiB decodificados de uma sessão uploadId, em base64 puro e offset exato. Cliente/script gera os bytes, nunca a LLM. Retorna próximo offset confirmado. Repetir a última parte idêntica não duplica bytes; partes diferentes ou fora de ordem são recusadas. Após resposta perdida consulte getMediaUploadTool e retome pelo offset confirmado.',
      appendMediaUploadSchema,
      async ({ organization, profileId }, input) =>
        this.uploads.append(organization.id, profileId, input),
      false,
      true,
      true
    );
  }
}
@Injectable()
export class GetMediaUploadTool implements AgentToolInterface {
  constructor(
    private readonly uploads: MediaChunkUploadService,
    private readonly profiles: ProfileService
  ) {}
  name = 'getMediaUploadTool';
  run() {
    return scopedAgentTool(
      this.profiles,
      this.name,
      'Consulta offset/estado de sessão privada e recibo da mídia concluída. Não altera nem publica. Em completed reutilize media.id/path. unknown indica resultado incerto: consulte mediaListTool antes de outro upload. Sessão perdida após restart/expiração também exige conferir a biblioteca se complete estava pendente.',
      mediaUploadSessionSchema,
      async ({ organization, profileId }, input) =>
        this.uploads.status(organization.id, profileId, input.uploadId),
      true,
      true,
      true
    );
  }
}
@Injectable()
export class CompleteMediaUploadTool implements AgentToolInterface {
  constructor(
    private readonly uploads: MediaChunkUploadService,
    private readonly profiles: ProfileService
  ) {}
  name = 'completeMediaUploadTool';
  run() {
    return scopedAgentTool(
      this.profiles,
      this.name,
      'Conclui upload em partes: confere tamanho, SHA-256 completo e tipo real, salva por streaming na biblioteca e devolve media.id/path. Não publica. Retry de sessão completed devolve o mesmo recibo. UPLOAD_RESULT_UNKNOWN nunca autoriza criar outra cópia automaticamente: consulte andamento/biblioteca. Pode demorar para vídeos grandes.',
      mediaUploadSessionSchema,
      async ({ organization, profileId }, input) =>
        this.uploads.complete(organization.id, profileId, input.uploadId),
      false,
      true,
      true
    );
  }
}
@Injectable()
export class AbortMediaUploadTool implements AgentToolInterface {
  constructor(
    private readonly uploads: MediaChunkUploadService,
    private readonly profiles: ProfileService
  ) {}
  name = 'abortMediaUploadTool';
  run() {
    return scopedAgentTool(
      this.profiles,
      this.name,
      'Cancela a sessão de upload e remove seus temporários privados. Não exclui mídia já concluída nem publicação. Não pode cancelar uma conclusão em andamento. Para resultado unknown, cancelar não desfaz eventual gravação já realizada.',
      mediaUploadSessionSchema,
      async ({ organization, profileId }, input) =>
        this.uploads.abort(organization.id, profileId, input.uploadId),
      false,
      true,
      true
    );
  }
}
