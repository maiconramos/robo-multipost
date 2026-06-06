import { fromBuffer } from 'file-type';

/**
 * Tipos de midia permitidos em uploads. Deliberadamente NAO inclui
 * `image/svg+xml` nem `text/html` — sao os vetores de XSS quando servidos
 * de volta. A validacao usa magic bytes (conteudo real), nunca o
 * Content-Type/extensao declarados pelo cliente (que sao forjaveis).
 */
export const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
]);

/**
 * Detecta o tipo real do buffer por magic bytes e valida contra a allowlist.
 * Retorna `{ mime, ext }` quando permitido, ou `null` caso contrario.
 */
export const detectAllowedUploadMime = async (
  buffer: Buffer
): Promise<{ mime: string; ext: string } | null> => {
  const detected = await fromBuffer(buffer);
  if (!detected || !ALLOWED_UPLOAD_MIME_TYPES.has(detected.mime)) {
    return null;
  }
  return { mime: detected.mime, ext: detected.ext };
};
