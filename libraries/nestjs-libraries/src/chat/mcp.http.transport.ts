import { MCPServer } from '@mastra/mcp';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { Request, Response } from 'express';
import { MCP_HTTP_MAX_BODY_BYTES } from '../dtos/media/agent-media.dto';

/** Stateless dual-era HTTP, using the body bounded after authentication. */
export function createMcpHttpTransport(
  config: ConstructorParameters<typeof MCPServer>[0]
) {
  const handler = createMcpHandler(() => new MCPServer(config).getServer(), {
    legacy: 'stateless',
    maxRequestBodySize: MCP_HTTP_MAX_BODY_BYTES,
  });
  const serve = toNodeHandler(handler, {
    maxRequestBodySize: MCP_HTTP_MAX_BODY_BYTES,
  });
  return {
    close: () => handler.close(),
    startHTTP: async ({
      req,
      res,
    }: {
      req: Request;
      res: Response;
      url: URL;
      httpPath: string;
      options: { serverless: true };
    }) => serve(req, res, req.body),
  };
}
