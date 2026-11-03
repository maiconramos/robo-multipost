import { Injectable } from '@nestjs/common';
import { AgentToolInterface } from '../agent.tool.interface';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { MediaTransferService } from '../../upload/media-transfer.service';
import {
  mediaUploadSchema,
  mediaUploadUrlSchema,
} from '../../dtos/media/agent-media.dto';
import { scopedAgentTool } from './scoped-agent-tool.helper';

function mediaResult(
  media: Awaited<ReturnType<MediaTransferService['fromUrl']>>
) {
  return {
    id: media.id,
    name: media.name,
    originalName: media.originalName ?? null,
    path: media.path,
  };
}
@Injectable()
export class UploadMediaFromUrlTool implements AgentToolInterface {
  constructor(
    private readonly transfer: MediaTransferService,
    private readonly profiles: ProfileService
  ) {}
  name = 'uploadMediaFromUrlTool';
  run() {
    return scopedAgentTool(
      this.profiles,
      this.name,
      'Importa imagem ou MP4 de URL HTTPS pública para a biblioteca no perfil autenticado ou explicitamente selecionado por profileId. Chave de organização exige profileId. Não publica. Valida tipo real, DNS/redirects e tamanho (imagem 10 MiB, MP4 1 GiB; proxy pode limitar). Retorna id/path para integrationSchedulePostTool ou updatePostTool. Prefira a arquivo base64. Não aceita URL privada, file:// nem caminho local. Repetir pode criar cópia; após timeout consulte mediaListTool antes de reenviar.',
      mediaUploadUrlSchema,
      async ({ organization, profileId }, input) =>
        mediaResult(
          await this.transfer.fromUrl(organization.id, profileId, input.url)
        ),
      false
    );
  }
}
@Injectable()
export class UploadMediaTool implements AgentToolInterface {
  constructor(
    private readonly transfer: MediaTransferService,
    private readonly profiles: ProfileService
  ) {}
  name = 'uploadMediaTool';
  run() {
    return scopedAgentTool(
      this.profiles,
      this.name,
      'Envia arquivo pequeno para a biblioteca do perfil autenticado/selecionado (chave geral exige profileId) por filename e base64 puro (máximo 2 MiB decodificados; sem data URI). Não lê disco local do agente ou servidor e não publica. Para arquivos maiores use beginMediaUploadTool e envie em partes por cliente/script, uploadMediaFromUrlTool ou POST /public/v1/upload multipart. Retorna id/path reutilizáveis. Não invente base64. Repetir pode criar cópia; consulte mediaListTool após resultado incerto.',
      mediaUploadSchema,
      async ({ organization, profileId }, input) =>
        mediaResult(
          await this.transfer.fromBase64(
            organization.id,
            profileId,
            input.filename,
            input.base64
          )
        ),
      false
    );
  }
}
