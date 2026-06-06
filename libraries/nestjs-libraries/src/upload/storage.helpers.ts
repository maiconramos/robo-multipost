import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

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
 * URLs HTTP(S) (fornecidas pelo usuario) passam por validacao SSRF
 * (`isSafePublicHttpsUrl`) e usam o `ssrfSafeDispatcher` (DNS-pinning) para
 * fechar a janela TOCTOU. Data URLs nao tocam a rede.
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
    const extension =
      contentType.split('/')[1]?.split('+')[0] || 'bin';
    return { buffer, contentType, extension };
  }

  if (!(await isSafePublicHttpsUrl(path))) {
    throw new Error('Unsafe URL');
  }
  const res = await fetch(path, {
    // @ts-ignore — undici option, not in lib.dom fetch types
    dispatcher: ssrfSafeDispatcher,
  });
  const contentType =
    res?.headers?.get('content-type') ||
    res?.headers?.get('Content-Type') ||
    'application/octet-stream';
  const extension =
    contentType.split('/')[1]?.split('+')[0] ||
    path.split('?')[0].split('#')[0].split('.').pop() ||
    'bin';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType, extension };
}
