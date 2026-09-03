import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { MCPServer } from '@mastra/mcp';
import { getContext } from './async.storage';
import { startMcp } from './start.mcp';

const mockStartHTTP = jest.fn();
const mockStartSSE = jest.fn();

jest.mock('@mastra/mcp', () => ({
  MCPServer: jest.fn(),
}));
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class MastraService {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class OrganizationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service',
  () => ({ OAuthService: class OAuthService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service',
  () => ({ ProfileService: class ProfileService {} })
);

type Handler = (req: any, res: any, next?: jest.Mock) => Promise<void>;

const response = () => {
  const res: any = {
    setHeader: jest.fn(),
    writeHead: jest.fn(),
    end: jest.fn(),
    send: jest.fn(),
    sendStatus: jest.fn(),
    json: jest.fn(),
    status: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

const request = (overrides: Record<string, unknown> = {}) => ({
  method: 'POST',
  path: '/',
  baseUrl: '',
  originalUrl: '/',
  headers: {},
  rawHeaders: [] as string[],
  params: {},
  ...overrides,
});

describe('startMcp', () => {
  const originalEnv = { ...process.env };
  const handlers = new Map<string, Handler>();
  const organization = { id: 'org-1' };
  const profile = { id: 'profile-1', organization };
  let app: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    (MCPServer as unknown as jest.Mock).mockImplementation(() => ({
      startHTTP: mockStartHTTP,
      startSSE: mockStartSSE,
    }));
    handlers.clear();
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.example';
    process.env.FRONTEND_URL = 'https://frontend.example';
    delete process.env.NEXT_PUBLIC_OVERRIDE_BACKEND_URL;
    delete process.env.OPENAI_APP_CHALLANGE;

    const mastraService = {
      mastra: jest.fn().mockResolvedValue({
        getAgent: jest.fn().mockReturnValue({
          listTools: jest.fn().mockResolvedValue({ tool: {} }),
        }),
      }),
    };
    const organizationService = {
      getOrgByApiKey: jest.fn().mockResolvedValue(organization),
    };
    const oauthService = {
      getOrgByOAuthToken: jest.fn().mockResolvedValue({ organization }),
    };
    const profileService = {
      getProfileByApiKey: jest
        .fn()
        .mockImplementation(async (token: string) =>
          token === 'profile-key' ? profile : null
        ),
    };

    app = {
      get: jest.fn((token: unknown) => {
        if (token === MastraService) return mastraService;
        if (token === OrganizationService) return organizationService;
        if (token === OAuthService) return oauthService;
        if (token === ProfileService) return profileService;
        throw new Error('Unexpected provider');
      }),
      use: jest.fn((path: string | string[], handler: Handler) => {
        if (typeof path === 'string') handlers.set(path, handler);
      }),
    };

    mockStartHTTP.mockImplementation(async () => undefined);
    mockStartSSE.mockImplementation(async () => undefined);
    await startMcp(app);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('serve os tres endpoints HTTP sem sessao e preserva o contexto por perfil', async () => {
    const contexts: Array<ReturnType<typeof getContext>> = [];
    mockStartHTTP.mockImplementation(async () => {
      contexts.push(getContext());
    });

    await handlers.get('/mcp-oauth')!(
      request({ headers: { authorization: 'Bearer pos_oauth' } }),
      response(),
      jest.fn()
    );
    await handlers.get('/mcp')!(
      request({
        headers: {
          authorization: 'Bearer profile-key',
          'mcp-session-id': 'stale-session',
        },
      }),
      response(),
      jest.fn()
    );
    await handlers.get('/mcp/:id')!(
      request({
        params: { id: 'profile-key' },
        headers: { 'mcp-session-id': 'stale-session' },
      }),
      response()
    );

    expect(mockStartHTTP).toHaveBeenCalledTimes(3);
    for (const [{ options }] of mockStartHTTP.mock.calls) {
      expect(options).toEqual({
        serverless: true,
        enableJsonResponse: true,
      });
      expect(options).not.toHaveProperty('sessionIdGenerator');
    }
    expect(contexts).toEqual([
      { requestId: 'pos_oauth', auth: organization, profileId: undefined },
      { requestId: 'profile-key', auth: organization, profileId: 'profile-1' },
      { requestId: 'profile-key', auth: organization, profileId: 'profile-1' },
    ]);
  });

  it('mantem as rotas SSE no transporte legado', async () => {
    const registration = app.use.mock.calls.find(
      ([path]: [unknown]) => Array.isArray(path) && path.includes('/sse/:id')
    );
    expect(registration).toBeDefined();

    await registration[1](
      request({
        params: { id: 'profile-key' },
        originalUrl: '/sse/profile-key',
      }),
      response()
    );

    expect(mockStartSSE).toHaveBeenCalledTimes(1);
    expect(mockStartHTTP).not.toHaveBeenCalled();
  });

  it('serve descoberta OAuth apenas no caminho inserido de mcp-oauth', async () => {
    const handler = handlers.get('/.well-known/oauth-protected-resource')!;
    for (const path of ['/', '/mcp/profile-key']) {
      const next = jest.fn();
      const unrelatedResponse = response();

      await handler(request({ method: 'GET', path }), unrelatedResponse, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(unrelatedResponse.writeHead).not.toHaveBeenCalled();
    }

    const nextAtResource = jest.fn();
    const resourceResponse = response();
    await handler(
      request({ method: 'GET', path: '/mcp-oauth' }),
      resourceResponse,
      nextAtResource
    );

    expect(nextAtResource).not.toHaveBeenCalled();
    expect(resourceResponse.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'application/json' })
    );
    expect(JSON.parse(resourceResponse.end.mock.calls[0][0])).toEqual(
      expect.objectContaining({
        resource: 'https://backend.example/mcp-oauth',
        authorization_servers: ['https://backend.example/mcp-oauth'],
      })
    );
  });

  it('publica metadados do authorization server somente para o issuer mcp-oauth', async () => {
    const handler = handlers.get('/.well-known/oauth-authorization-server')!;
    const nextAtRoot = jest.fn();
    const rootResponse = response();

    await handler(
      request({ method: 'GET', path: '/' }),
      rootResponse,
      nextAtRoot
    );

    expect(nextAtRoot).toHaveBeenCalledTimes(1);
    expect(rootResponse.json).not.toHaveBeenCalled();

    const resourceResponse = response();
    await handler(
      request({ method: 'GET', path: '/mcp-oauth' }),
      resourceResponse,
      jest.fn()
    );

    expect(resourceResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: 'https://backend.example/mcp-oauth',
        authorization_endpoint: 'https://frontend.example/oauth/authorize',
        token_endpoint: 'https://backend.example/oauth/token',
      })
    );
  });
});
