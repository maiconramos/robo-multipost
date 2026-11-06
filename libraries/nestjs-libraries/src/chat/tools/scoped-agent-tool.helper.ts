import { HttpException } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Organization } from '@prisma/client';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { checkAuth } from '../auth.context';
import {
  agentProfileSelector,
  resolveAgentProfile,
} from './agent-profile-scope';

export type AgentScope = { organization: Organization; profileId?: string };

// Public guidance is fixed locally: never forward a provider message or signed URL.
const TOOL_ERROR_GUIDANCE: Readonly<Record<string, string>> = {
  PROFILE_REQUIRED:
    'Descubra o cliente com getAccountContextTool e os canais com integrationList. Use a mesma chave da organização; não precisa de nova chave por perfil. Informe profileId em cada operação; no agendamento, socialPost[].profileId em cada destino. Não escolha Default automaticamente.',
  PROFILE_KEY_MISMATCH:
    'Esta credencial está limitada a um perfil. Selecione somente o perfil autenticado; para outro cliente, use uma conexão já autorizada, sem ampliar permissões.',
  PROFILE_NOT_FOUND:
    'O perfil não está disponível nesta organização. Consulte getAccountContextTool e use somente um ID retornado para o cliente solicitado.',
  UNSUPPORTED_MEDIA_TYPE:
    'O conteúdo real não é uma imagem compatível nem um vídeo MP4. Envie uma imagem compatível ou converta o vídeo para MP4; apenas renomear a extensão não converte o formato.',
  MEDIA_TOO_LARGE:
    'O arquivo excede o limite aceito. Confira os limites da ferramenta e reduza o arquivo antes de enviar novamente.',
  DRIVE_LINK_UNSUPPORTED:
    'Envie o link individual de uma foto ou vídeo público do Google Drive, com download permitido. Pastas e documentos Google não são aceitos.',
  DRIVE_ACCESS_DENIED:
    'O Google recusou o download. Confira o compartilhamento por link e a permissão de download; não é necessário enviar senha ou token Google.',
  DRIVE_DOWNLOAD_LIMIT:
    'O Google sinalizou um limite de downloads. Aguarde e tente mais tarde; não repita a chamada continuamente.',
  DRIVE_CONFIRMATION_UNSUPPORTED:
    'Não foi possível resolver a confirmação pública do Google Drive. Confira o acesso sem login ou use outro link HTTPS direto para a mídia.',
  MEDIA_FETCH_FAILED:
    'Não foi possível baixar a mídia. Confira o link e a conexão. Se houve timeout de transporte, consulte mediaListTool antes de reenviar para evitar cópias.',
  MEDIA_IMPORT_BUSY:
    'O limite de importações simultâneas foi atingido. Aguarde as transferências em andamento antes de tentar novamente.',
  MEDIA_TEMP_SPACE:
    'O servidor não tem espaço temporário suficiente para importar a mídia. Solicite ao administrador a liberação de espaço antes de tentar novamente.',
};

export function agentToolErrorGuidance(code: string): string | undefined {
  const message = TOOL_ERROR_GUIDANCE[code];
  return typeof message === 'string' ? message : undefined;
}

// Selection is request-local. Only explicitly permitted reads may remain organization-wide.
export function scopedAgentTool<T extends z.AnyZodObject>(
  profiles: ProfileService,
  id: string,
  description: string,
  inputSchema: T,
  execute: (scope: AgentScope, input: z.infer<T>) => Promise<unknown>,
  readOnly: boolean,
  idempotent = readOnly,
  requireProfile = !readOnly,
  allowProfileSelection = true
) {
  const schema = (
    allowProfileSelection
      ? inputSchema.extend({ profileId: agentProfileSelector })
      : inputSchema
  ).strict();
  return createTool({
    id,
    description,
    inputSchema: schema,
    mcp: {
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: false,
        idempotentHint: idempotent,
        openWorldHint: true,
      },
    },
    execute: async (raw: unknown, options: unknown) => {
      try {
        checkAuth(raw, options);
        const input = schema.safeParse(raw);
        if (!input.success)
          return {
            errors: JSON.stringify([
              {
                error: 'INVALID_TOOL_INPUT',
                fields: input.error.issues.map((i) => i.path.join('.')),
              },
            ]),
          };
        const { profileId: selected, ...data } = input.data as z.infer<T> & {
          profileId?: string;
        };
        const scope = await resolveAgentProfile(
          profiles,
          options,
          selected,
          requireProfile
        );
        return {
          output: await execute(scope, data as z.infer<T>),
          scope: {
            organizationId: scope.organization.id,
            profile: scope.profile,
          },
        };
      } catch (error) {
        let code = 'TOOL_FAILED';
        if (error instanceof HttpException) {
          const body = error.getResponse();
          const candidate =
            typeof body === 'string' ? body : (body as { code?: string }).code;
          code =
            typeof candidate === 'string' &&
            /^[A-Z][A-Z0-9_]{1,64}$/.test(candidate)
              ? candidate
              : `HTTP_${error.getStatus()}`;
        }
        const message = agentToolErrorGuidance(code);
        return {
          errors: JSON.stringify([
            {
              error: code,
              ...(typeof message === 'string' ? { message } : {}),
            },
          ]),
        };
      }
    },
  });
}
