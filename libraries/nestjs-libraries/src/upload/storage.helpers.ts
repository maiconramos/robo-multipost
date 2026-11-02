import { fetchPublicUrl } from './public-url.fetch';
import { detectAllowedUploadMime } from './allowed.upload.mime';

// Mesmo teto do upload de video (`getMaxUploadSize`): o upload por URL tambem
// recebe videos (repost do Instagram).
const MAX_REMOTE_MEDIA_BYTES = 1024 * 1024 * 1024;

/**
 * Resolve um `path` para `{ buffer, contentType, extension }` aceitando
 * tanto URLs HTTP(S) quanto data URLs (`data:image/png;base64,...`).
 *
 * Necessario porque `fetch()` do Node 20+ (undici) NAO suporta `data:`
 * URLs nativamente — joga erro silencioso ao tentar resolver. Como o
 * fluxo de geracao de imagem com IA devolve base64 e o controller monta
 * data URL antes de chamar `storage.uploadSimple`, sem este helper o
 * upload falha.
 *
 * URLs HTTP(S) (fornecidas pelo usuario) passam por `fetchPublicUrl`:
 * HTTPS publica (`isSafePublicHttpsUrl`), `ssrfSafeDispatcher` forcado
 * (DNS-pinning + IP literal na conexao), timeout e limite de bytes; resposta
 * nao-2xx falha em vez de virar midia. Data URLs nao tocam a rede.
 */
export async function loadFromUrlOrDataUrl(path: string): Promise<{
  buffer: Buffer;
  contentType: string;
  extension: string;
}> {
  if (path.startsWith('data:')) {
    // Equivalente a /^data:([^;,]+)?(?:;base64)?,(.*)$/s — usamos [\s\S]
    // em vez da flag `s` (dotAll) por compatibilidade com TS target < es2018.
    const match = path.match(/^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/);
    if (!match) {
      throw new Error(`data URL invalida: ${path.slice(0, 60)}...`);
    }
    const contentType = match[1] || 'application/octet-stream';
    const data = match[2] ?? '';
    const isBase64 = path.includes(';base64,');
    const buffer = isBase64
      ? Buffer.from(data, 'base64')
      : Buffer.from(decodeURIComponent(data), 'utf8');
    return typedMedia(buffer, contentType);
  }

  const { buffer } = await fetchPublicUrl(path, {
    maxBytes: MAX_REMOTE_MEDIA_BYTES,
    timeoutMs: 5 * 60_000,
    identityEncoding: true,
  });
  return typedMedia(buffer);
}

// Tipo e extensao saem do conteudo (magic bytes), nunca do Content-Type do
// servidor remoto nem da extensao da URL: um avatar servido como text/html ou
// SVG virava <hex>.html/.svg em /uploads, no dominio da app (XSS). Mesma
// allowlist do upload comum (imagens e mp4).
async function typedMedia(buffer: Buffer, declared?: string) {
  const detected = await detectAllowedUploadMime(buffer);
  if (!detected) {
    throw new Error(
      `Tipo de arquivo nao permitido para upload${declared ? ` (${declared.slice(0, 40)})` : ''}`
    );
  }
  return { buffer, contentType: detected.mime, extension: detected.ext };
}
