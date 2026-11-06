import { z } from 'zod';

// Direct files: 6 MiB -> 8 MiB base64, bounded by the 12 MiB HTTP envelope.
export const MCP_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
// Parts remain small for resumable clients and legacy MCP transports.
export const MCP_UPLOAD_PART_MAX_BYTES = 2 * 1024 * 1024;
export const MCP_UPLOAD_PART_MAX_BASE64 =
  4 * Math.ceil(MCP_UPLOAD_PART_MAX_BYTES / 3);
export const MCP_HTTP_MAX_BODY_BYTES = 12 * 1024 * 1024;
export const MCP_CHUNK_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;
export const MCP_UPLOAD_MAX_BASE64 = 4 * Math.ceil(MCP_UPLOAD_MAX_BYTES / 3);
export const mediaUploadUrlSchema = z
  .object({
    url: z
      .string()
      .url()
      .max(4096)
      .regex(/^https:\/\//i),
  })
  .strict();
export const mediaUploadSchema = z
  .object({
    filename: z.string().min(1).max(255),
    base64: z
      .string()
      .min(4)
      .max(MCP_UPLOAD_MAX_BASE64)
      .describe(
        'Base64 puro de arquivo com até 6 MiB via MCP HTTP (/mcp). Sem prefixo data: ou caminho local. Para arquivos maiores, use URL pública/Google Drive ou envio em partes; gere os bytes por código, sem colocá-los no prompt.'
      ),
  })
  .strict();

const uploadId = z.string().regex(/^[a-f0-9]{64}$/);
export const beginMediaUploadSchema = z
  .object({
    filename: z.string().min(1).max(255),
    size: z.number().int().min(1).max(MCP_CHUNK_UPLOAD_MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    clientRequestId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const mediaUploadSessionSchema = z.object({ uploadId }).strict();
export const appendMediaUploadSchema = z
  .object({
    uploadId,
    offset: z.number().int().min(0).max(MCP_CHUNK_UPLOAD_MAX_BYTES),
    base64: z
      .string()
      .min(4)
      .max(MCP_UPLOAD_PART_MAX_BASE64)
      .refine(
        (value) =>
          (value.length / 4) * 3 -
            (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) <=
          MCP_UPLOAD_PART_MAX_BYTES,
        'Parte decodificada excede 2 MiB.'
      )
      .describe(
        'Parte em base64 puro, com até 2 MiB decodificados; o limite da parte é independente do envio direto.'
      ),
  })
  .strict();
