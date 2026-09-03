import { createOAuthMiddleware } from './oauth-middleware';

describe('createOAuthMiddleware', () => {
  it('anuncia no 401 a URL path-inserted dos metadados do recurso', async () => {
    const middleware = createOAuthMiddleware({
      oauth: {
        resource: 'https://backend.example/mcp-oauth',
        authorizationServers: ['https://backend.example/mcp-oauth'],
      },
      mcpPath: '/mcp-oauth',
    });
    const response = {
      writeHead: jest.fn(),
      end: jest.fn(),
    } as any;

    const result = await middleware(
      {
        method: 'POST',
        headers: {},
      } as any,
      response,
      new URL('https://backend.example/mcp-oauth')
    );

    expect(result).toEqual({ proceed: false, handled: true });
    expect(response.writeHead).toHaveBeenCalledWith(
      401,
      expect.objectContaining({
        'WWW-Authenticate':
          'Bearer resource_metadata="https://backend.example/.well-known/oauth-protected-resource/mcp-oauth"',
      })
    );
  });
});
