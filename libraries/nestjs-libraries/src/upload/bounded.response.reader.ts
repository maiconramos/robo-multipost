export class ResponseBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Response body exceeds ${maxBytes} bytes`);
    this.name = 'ResponseBodyTooLargeError';
  }
}

const cancelBody = async (response: Response) => {
  try {
    await response.body?.cancel();
  } catch {
    // O limite continua sendo a causa principal mesmo se o cancelamento falhar.
  }
};

/**
 * Le uma resposta HTTP com limite durante o streaming. A verificacao do
 * Content-Length e apenas um atalho: o contador real de chunks e a protecao
 * autoritativa para servidores que omitem ou falsificam esse header.
 */
export const readResponseBodyWithLimit = async (
  response: Response,
  maxBytes: number
): Promise<Buffer> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }

  const contentLengthHeader = response.headers.get('content-length');
  const declaredSize = contentLengthHeader
    ? Number(contentLengthHeader)
    : Number.NaN;

  if (
    Number.isFinite(declaredSize) &&
    declaredSize >= 0 &&
    declaredSize > maxBytes
  ) {
    await cancelBody(response);
    throw new ResponseBodyTooLargeError(maxBytes);
  }

  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // O erro de tamanho deve permanecer deterministico para o chamador.
        }
        throw new ResponseBodyTooLargeError(maxBytes);
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
};
