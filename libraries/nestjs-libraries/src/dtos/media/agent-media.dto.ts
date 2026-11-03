import { z } from 'zod';

// 2 MiB becomes ~2.67 MiB base64, leaving room below a 4 MiB MCP envelope.
export const MCP_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
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
        'Base64 puro de arquivo com até 2 MiB; sem prefixo data: ou caminho local. Use envio em partes, URL ou multipart REST para vídeos grandes.'
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
    base64: mediaUploadSchema.shape.base64,
  })
  .strict();
