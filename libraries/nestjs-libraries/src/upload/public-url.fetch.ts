import {
  isSafePublicHttpsUrl,
  isSsrfProtectionDisabled,
} from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import {
  ssrfSafeDispatcher,
  ssrfSafeFetch,
} from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  readResponseBodyWithLimit,
  ResponseBodyTooLargeError,
} from './bounded.response.reader';

export type PublicUrlFetchErrorReason =
  | 'unsafe'
  | 'http'
  | 'too-large'
  | 'network';

export class PublicUrlFetchError extends Error {
  constructor(
    public readonly reason: PublicUrlFetchErrorReason,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'PublicUrlFetchError';
  }
}

export interface PublicUrlFetchOptions {
  /** Limite do corpo; acima disso a leitura e interrompida. */
  maxBytes: number;
  timeoutMs?: number;
  /** Links de terceiros (ex.: item de feed) podem ser http. */
  allowHttp?: boolean;
  /**
   * So para URLs configuradas por usuario autenticado (como webhooks): sob
   * `DISABLE_SSRF_PROTECTION=true` a rede privada fica liberada. URLs vindas
   * de terceiros nunca herdam o opt-out.
   */
  honorSsrfOptOut?: boolean;
  headers?: Record<string, string>;
  /**
   * Midia: pede o arquivo sem compressao e recusa resposta comprimida. O
   * fetch descomprime sozinho e o limite so ve o tamanho descomprimido: ~1 MiB
   * de gzip virava 1 GiB na memoria.
   */
  identityEncoding?: boolean;
}

export const isEncodedResponse = (response: { headers: Headers }) => {
  const encoding = (response.headers.get('content-encoding') || '')
    .trim()
    .toLowerCase();
  return !!encoding && encoding !== 'identity';
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

const cancelBody = async (response: Response) => {
  try {
    await response.body?.cancel();
  } catch {
    // o motivo original continua sendo o erro devolvido
  }
};

/**
 * Baixa uma URL informada por usuario ou terceiro com as mesmas garantias do
 * upload por URL: protocolo restrito, validacao de DNS em cada salto de
 * redirect (seguidos manualmente, como em `/public/stream`), dispatcher
 * pinado (o guard roda na conexao, inclusive para IP literal), timeout e
 * limite de bytes. Os erros carregam so o motivo — nunca a URL ou o corpo.
 */
export async function fetchPublicUrl(
  url: string,
  options: PublicUrlFetchOptions
): Promise<{ buffer: Buffer; contentType: string }> {
  const optedOut =
    options.honorSsrfOptOut === true && isSsrfProtectionDisabled();
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let currentUrl = url;
  let response: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    // o opt-out cobre so a URL configurada; destinos de redirect voltam ao guard
    const unguarded = optedOut && hop === 0;
    await assertAllowedUrl(currentUrl, options, unguarded);

    try {
      response = await ssrfSafeFetch(currentUrl, {
        ...(unguarded ? {} : { dispatcher: ssrfSafeDispatcher }),
        ...(options.headers || options.identityEncoding
          ? {
              headers: {
                ...(options.headers || {}),
                ...(options.identityEncoding
                  ? { 'accept-encoding': 'identity' }
                  : {}),
              },
            }
          : {}),
        redirect: 'manual',
        signal,
      });
    } catch (err) {
      const cause = (err as { cause?: { message?: string } })?.cause?.message;
      if (cause === 'Blocked IP') {
        throw new PublicUrlFetchError('unsafe', 'Unsafe URL');
      }
      throw new PublicUrlFetchError('network', 'Network error');
    }

    if (response.status < 300 || response.status >= 400) {
      break;
    }

    const location = response.headers.get('location');
    await cancelBody(response);
    if (!location) {
      throw new PublicUrlFetchError(
        'http',
        'Redirect without Location',
        response.status
      );
    }
    try {
      currentUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new PublicUrlFetchError('unsafe', 'Invalid redirect target');
    }
    if (hop === MAX_REDIRECTS) {
      throw new PublicUrlFetchError('http', 'Too many redirects');
    }
  }

  if (!response || !response.ok) {
    if (response) {
      await cancelBody(response);
    }
    throw new PublicUrlFetchError(
      'http',
      `HTTP ${response?.status ?? 0}`,
      response?.status
    );
  }

  if (options.identityEncoding && isEncodedResponse(response)) {
    await cancelBody(response);
    throw new PublicUrlFetchError('http', 'Compressed response refused');
  }

  try {
    return {
      buffer: await readResponseBodyWithLimit(response, options.maxBytes),
      contentType:
        response.headers.get('content-type') || 'application/octet-stream',
    };
  } catch (err) {
    if (err instanceof ResponseBodyTooLargeError) {
      throw new PublicUrlFetchError(
        'too-large',
        `Response exceeds ${options.maxBytes} bytes`
      );
    }
    throw new PublicUrlFetchError('network', 'Network error');
  }
}

async function assertAllowedUrl(
  url: string,
  options: PublicUrlFetchOptions,
  optedOut: boolean
) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PublicUrlFetchError('unsafe', 'Invalid URL');
  }

  const protocolAllowed =
    parsed.protocol === 'https:' ||
    (options.allowHttp === true && parsed.protocol === 'http:');
  if (!protocolAllowed) {
    throw new PublicUrlFetchError('unsafe', 'Unsafe URL');
  }

  // http so chega aqui com allowHttp: o guard pinado valida na conexao
  if (
    !optedOut &&
    parsed.protocol === 'https:' &&
    !(await isSafePublicHttpsUrl(url))
  ) {
    throw new PublicUrlFetchError('unsafe', 'Unsafe URL');
  }
}

/** Decodifica texto (feed, HTML) pelo charset do content-type; padrao utf-8. */
export function decodeText(buffer: Buffer, contentType: string): string {
  const charset = /charset=["']?([^;"'\s]+)/i.exec(contentType || '')?.[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}
