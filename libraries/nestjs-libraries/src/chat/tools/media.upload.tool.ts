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
      'Importa imagem ou MP4 de URL HTTPS pública para a biblioteca no perfil autenticado ou explicitamente selecionado por profileId. Chave de organização exige profileId. Não publica. Valida tipo real, DNS/redirects e tamanho (imagem 10 MiB, MP4 1 GiB; proxy pode limitar). Retorna id/path para integrationSchedulePostTool ou updatePostTool. Aceita o link comum de arquivo público do Google Drive com download permitido, sem login; não precisa transformar a URL. Não aceita pastas, Docs/Sheets/Slides ou arquivos privados. Download por streaming com prazo de até 5 minutos; cliente/proxy podem encerrar antes. Erros retornam código estável e orientação segura. UNSUPPORTED_MEDIA_TYPE: envie mídia compatível ou converta o vídeo para MP4; renomear a extensão não converte. DRIVE_ACCESS_DENIED: conferir acesso/download; DRIVE_DOWNLOAD_LIMIT: aguardar; DRIVE_CONFIRMATION_UNSUPPORTED: confirmação não resolvida; MEDIA_IMPORT_BUSY: aguardar importações. Prefira a arquivo base64. Não aceita URL privada, file:// nem caminho local. Repetir pode criar cópia; após timeout consulte mediaListTool antes de reenviar.',
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
      'Envia arquivo pequeno para a biblioteca do perfil autenticado/selecionado (chave geral exige profileId) por filename e base64 puro (máximo 6 MiB decodificados nos endpoints MCP HTTP /mcp, /mcp/:id e /mcp-oauth; corpo JSON até 12 MiB; sem data URI). Não lê disco local do agente ou servidor e não publica. Para arquivos maiores use beginMediaUploadTool e envie em partes por cliente/script, uploadMediaFromUrlTool ou POST /public/v1/upload multipart. Retorna id/path reutilizáveis. As partes continuam em 2 MiB. No SSE legado, prefira URL ou partes para arquivos acima de 2 MiB. Gere base64 por código, sem colocar bytes no prompt; não invente base64. Repetir pode criar cópia; consulte mediaListTool após resultado incerto.',
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
