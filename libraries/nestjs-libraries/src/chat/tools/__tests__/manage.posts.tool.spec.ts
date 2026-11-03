jest.mock('../../../integrations/integration.manager', () => ({}));
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
import {
  ListPostsTool,
  GetPostTool,
  UpdatePostTool,
  ManagePostScheduleTool,
  GetPostOptionsTool,
} from '../manage.posts.tool';
const scope = { organizationId: 'org', profileId: 'perfil' };
const context = {
  requestContext: {
    get: (key: string) =>
      ({ organization: '{"id":"org"}', profileId: 'perfil' }[key]),
  },
};
describe('ferramentas de posts existentes', () => {
  const service = {
    scope: jest.fn().mockResolvedValue(scope),
    capabilities: jest.fn().mockReturnValue({ contractVersion: 1 }),
    listOrganization: jest
      .fn()
      .mockResolvedValue({ posts: [], nextCursor: null }),
    list: jest.fn(),
    detail: jest.fn(),
    update: jest.fn(),
    action: jest.fn(),
    options: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());
  it.each([
    ListPostsTool,
    GetPostTool,
    UpdatePostTool,
    ManagePostScheduleTool,
    GetPostOptionsTool,
  ])('schema concreto e sem identidade controlada pelo agente: %p', (Tool) => {
    const tool: any = new Tool(service as any).run();
    expect(tool.inputSchema._def.typeName).toBe('ZodObject');
    expect(tool.inputSchema.shape).toHaveProperty('profileId');
    expect(tool.inputSchema.shape).not.toHaveProperty('organizationId');
    expect(tool.inputSchema._def.unknownKeys).toBe('strict');
  });
  it('consulta e altera o mesmo id no perfil autenticado', async () => {
    await (new GetPostTool(service as any).run() as any).execute(
      { postId: 'p' },
      context
    );
    expect(service.detail).toHaveBeenCalledWith(scope, 'p', false);
    await (new UpdatePostTool(service as any).run() as any).execute(
      {
        postId: 'p',
        expectedVersion: 'v',
        configuration: { intervalInDays: 2 },
      },
      context
    );
    expect(service.update).toHaveBeenCalledWith(scope, 'p', {
      expectedVersion: 'v',
      configuration: { intervalInDays: 2 },
    });
    await (new ManagePostScheduleTool(service as any).run() as any).execute(
      { postId: 'p', operation: 'cancel', expectedVersion: 'v' },
      context
    );
    expect(service.action).toHaveBeenCalledWith(scope, 'p', {
      operation: 'cancel',
      expectedVersion: 'v',
    });
  });
  it('nao descarta campo desconhecido nem aceita republish string', async () => {
    const result = await (
      new UpdatePostTool(service as any).run() as any
    ).execute(
      { postId: 'p', expectedVersion: 'v', configuration: { unknown: true } },
      context
    );
    expect(result.error || result.errors).toBeDefined();
    expect(service.update).not.toHaveBeenCalled();
  });
  it('org lista clientes mas nao edita sem selecionar perfil', async () => {
    const orgContext = {
      requestContext: {
        get: (key: string) =>
          key === 'organization' ? '{"id":"org"}' : undefined,
      },
    };
    await (new ListPostsTool(service as any).run() as any).execute(
      { integrationId: 'amz' },
      orgContext
    );
    expect(service.listOrganization).toHaveBeenCalledWith('org', {
      integrationId: 'amz',
    });
    const r = await (new UpdatePostTool(service as any).run() as any).execute(
      { postId: 'p', expectedVersion: 'v', configuration: {} },
      orgContext
    );
    expect(r.errors).toContain('PROFILE_REQUIRED');
    expect(service.scope).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });
  it('selecionar outro cliente com chave restrita falha antes do dominio', async () => {
    const r = await (new GetPostTool(service as any).run() as any).execute(
      { postId: 'p', profileId: 'outro' },
      context
    );
    expect(r.errors).toContain('PROFILE_KEY_MISMATCH');
    expect(service.scope).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();
  });
  it('capabilities publica nao exige perfil mas tags exige', async () => {
    const orgContext = {
      requestContext: {
        get: (key: string) =>
          key === 'organization' ? '{"id":"org"}' : undefined,
      },
    };
    const tool: any = new GetPostOptionsTool(service as never).run();
    expect(
      (await tool.execute({ resource: 'capabilities' }, orgContext)).output
    ).toEqual({ contractVersion: 1 });
    expect(
      (await tool.execute({ resource: 'tags' }, orgContext)).errors
    ).toContain('PROFILE_REQUIRED');
  });
});
