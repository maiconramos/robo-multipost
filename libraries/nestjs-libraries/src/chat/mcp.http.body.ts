import { json, Request, Response } from 'express';
import { MCP_HTTP_MAX_BODY_BYTES } from '../dtos/media/agent-media.dto';

const parser = json({
  limit: MCP_HTTP_MAX_BODY_BYTES,
  inflate: false,
  strict: true,
});
const reject = (res: Response, status: number, message: string) => {
  res
    .status(status)
    .json({
      jsonrpc: '2.0',
      error: { code: status === 400 ? -32700 : -32600, message },
      id: null,
    });
  return false;
};

/** Call only after authentication. Prevent Mastra's raw-reader fallback on POST. */
export async function prepareMcpHttpBody(
  req: Request,
  res: Response
): Promise<boolean> {
  if (req.method !== 'POST') return true;
  if (req.body === undefined) {
    if (req.headers['content-length'] === '0')
      return reject(res, 400, 'Invalid MCP JSON body.');
    const type = req.headers['content-type'] || '';
    if (!/^application\/json(?:\s*;|$)/i.test(type))
      return reject(res, 415, 'MCP requires application/json.');
    const error = await new Promise<unknown>((resolve) =>
      parser(req, res, resolve)
    );
    if (error) {
      const { type, status } = error as { type?: string; status?: number };
      if (type === 'entity.too.large' || status === 413)
        return reject(res, 413, 'MCP JSON request exceeds 12 MiB.');
      if (status === 415)
        return reject(res, 415, 'Unsupported MCP request encoding.');
      return reject(res, 400, 'Invalid MCP JSON body.');
    }
  }
  // Upstream middleware may have parsed the body already; still enforce our cap.
  try {
    if (!req.body || typeof req.body !== 'object' || Buffer.isBuffer(req.body))
      return reject(res, 400, 'Invalid MCP JSON body.');
    if (Buffer.byteLength(JSON.stringify(req.body)) > MCP_HTTP_MAX_BODY_BYTES)
      return reject(res, 413, 'MCP JSON request exceeds 12 MiB.');
  } catch {
    return reject(res, 400, 'Invalid MCP JSON body.');
  }
  return true;
}
