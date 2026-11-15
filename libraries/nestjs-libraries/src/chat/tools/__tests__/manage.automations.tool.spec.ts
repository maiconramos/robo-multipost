jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({})
);
import {
  GetCommentAutomationTool,
  UpdateCommentAutomationTool,
  GetAutomationOptionsTool,
  GetAutomationHistoryTool,
  GetAutomationExecutionHistoryTool,
  GetAutomationExecutionDetailTool,
  ManageAutomationAliasesTool,
  SaveAutomationCanvasTool,
  ManageRepostAutomationTool,
} from '../manage.automations.tool';
import { zernioHistory } from '../../../integrations/automations/zernio-automation.history';
import { automationConfigurationSchema } from '../../../dtos/flows/automation-management.dto';
import { QuickCreateFlowDto } from '../../../dtos/flows/flow.dto';
import { getMetadataStorage } from 'class-validator';
const scope = { organizationId: 'org', profileId: 'perfil' };
const options = {
  requestContext: {
    get: (key: string) =>
      ({ organization: '{"id":"org"}', profileId: 'perfil' }[key]),
  },
};
describe('ferramentas de gerenciamento e paridade de campos', () => {
  const service = {
    scope: jest.fn().mockResolvedValue(scope),
    detail: jest.fn(),
    update: jest.fn(),
    options: jest.fn(),
    history: jest.fn(),
    executionHistory: jest.fn(),
    executionDetail: jest.fn(),
    aliases: jest.fn(),
    canvas: jest.fn(),
    repost: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());
  it('inclui todo campo do contrato rapido Instagram no schema MCP', () => {
    const fields = [
      ...new Set(
        getMetadataStorage()
          .getTargetValidationMetadatas(QuickCreateFlowDto, '', false, false)
          .map((m) => m.propertyName)
      ),
    ].filter((k) => k !== 'expectedUpdatedAt');
    expect(Object.keys(automationConfigurationSchema.shape)).toEqual(
      expect.arrayContaining(fields)
    );
    expect(automationConfigurationSchema._def.unknownKeys).toBe('strict');
  });
  it.each([
    GetCommentAutomationTool,
    UpdateCommentAutomationTool,
    GetAutomationOptionsTool,
    GetAutomationHistoryTool,
    GetAutomationExecutionHistoryTool,
    GetAutomationExecutionDetailTool,
    ManageAutomationAliasesTool,
    SaveAutomationCanvasTool,
    ManageRepostAutomationTool,
  ])('schema de %p e objeto concreto sem identidade forjavel', (Tool) => {
    const tool: any = new Tool(service as any).run();
    expect(tool.inputSchema._def.typeName).toBe('ZodObject');
    expect(tool.inputSchema.shape).toHaveProperty('profileId');
    expect(tool.inputSchema.shape).not.toHaveProperty('organizationId');
    expect(tool.inputSchema._def.unknownKeys).toBe('strict');
  });
  it('encaminha detalhe, patch parcial com snapshot e historia no perfil do contexto', async () => {
    await (new GetCommentAutomationTool(service as any).run() as any).execute(
      { flowId: 'f', executionVersion: 2 },
      options
    );
    expect(service.detail).toHaveBeenCalledWith(scope, 'f', 2);
    await (
      new UpdateCommentAutomationTool(service as any).run() as any
    ).execute(
      {
        flowId: 'f',
        configuration: { dmMessage: 'Nova' },
        expectedUpdatedAt: '2026-10-27T12:00:00.000Z',
      },
      options
    );
    expect(service.update).toHaveBeenCalledWith(
      scope,
      'f',
      1,
      expect.objectContaining({
        configuration: { dmMessage: 'Nova' },
        expectedUpdatedAt: '2026-10-27T12:00:00.000Z',
      })
    );
    await (new GetAutomationHistoryTool(service as any).run() as any).execute(
      { flowId: 'f', executionVersion: 2 },
      options
    );
    expect(service.history).toHaveBeenCalledWith(
      scope,
      'f',
      2,
      undefined,
      undefined
    );
  });
  it('nao remove silenciosamente campos desconhecidos de um patch', async () => {
    const output = await (
      new UpdateCommentAutomationTool(service as any).run() as any
    ).execute({ flowId: 'f', configuration: { unknown: true } }, options);
    expect(output.errors || output.error).toBeDefined();
    expect(service.update).not.toHaveBeenCalled();
  });
  it('descobre agendados sem transformar id interno', async () => {
    const input = {
      resource: 'scheduled_posts',
      integrationId: 'ig',
      selectedId: 'local-id',
    };
    await (new GetAutomationOptionsTool(service as any).run() as any).execute(
      input,
      options
    );
    expect(service.options).toHaveBeenCalledWith(scope, input);
  });
  it('repost expoe todos os campos sem misturar com comentario', async () => {
    const input = {
      operation: 'create',
      configuration: {
        name: 'R',
        sourceIntegrationId: 'ig',
        sourceType: 'INSTAGRAM_STORY',
        destinations: [{ integrationId: 'fb', format: 'FACEBOOK_STORY' }],
        intervalMinutes: 5,
        filterIncludeVideos: true,
        filterIncludeImages: false,
        filterMaxDurationSeconds: 30,
        filterHashtag: '#teste',
        captionTemplate: '{{timestamp}}',
        enabled: false,
      },
    };
    await (new ManageRepostAutomationTool(service as any).run() as any).execute(
      input,
      options
    );
    expect(service.repost).toHaveBeenCalledWith(scope, input);
  });
});

describe('historico operacional MCP', () => {
  const scope = { organizationId: 'org', profileId: 'perfil' };
  const service = {
    scope: jest.fn().mockResolvedValue(scope),
    detail: jest.fn(),
    executionHistory: jest.fn(),
    executionDetail: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());
  it.each([
    GetAutomationExecutionHistoryTool,
    GetAutomationExecutionDetailTool,
  ])('schema concreto sem identidade em %p', (Tool) => {
    const schema = (new Tool(service as any).run() as any).inputSchema;
    expect(schema._def.typeName).toBe('ZodObject');
    expect(schema._def.unknownKeys).toBe('strict');
    expect(schema.shape).toHaveProperty('profileId');
    expect(schema.shape).not.toHaveProperty('organizationId');
  });
  it('encaminha cursor e filtros sem chamar historia legada, detalhe recebe execucao', async () => {
    await (
      new GetAutomationExecutionHistoryTool(service as any).run() as any
    ).execute(
      {
        flowId: 'f',
        executionVersion: 2,
        status: 'unknown',
        limit: 7,
        cursor: 'abc',
        from: '2026-10-28T00:00:00Z',
      },
      options
    );
    expect(service.executionHistory).toHaveBeenCalledWith(scope, 'f', 2, {
      status: 'unknown',
      limit: 7,
      cursor: 'abc',
      from: '2026-10-28T00:00:00Z',
    });
    await (
      new GetAutomationExecutionDetailTool(service as any).run() as any
    ).execute(
      { flowId: 'f', executionVersion: 1, executionId: 'exec' },
      options
    );
    expect(service.executionDetail).toHaveBeenCalledWith(scope, 'f', 1, 'exec');
  });
  it.each([
    { page: 2 },
    { limit: 51 },
    { status: 'DELIVERED' },
    { from: 'ontem' },
    { cursor: 'x'.repeat(513) },
    { profileId: 'outro' },
    { organizationId: 'outro' },
  ])('recusa entrada invalida %p', async (extra) => {
    const output = await (
      new GetAutomationExecutionHistoryTool(service as any).run() as any
    ).execute({ flowId: 'f', ...extra }, options);
    expect(output.errors || output.error).toBeDefined();
    expect(service.executionHistory).not.toHaveBeenCalled();
  });
  it('sanitiza falha inesperada sem revelar corpo ou token', async () => {
    service.executionDetail.mockRejectedValueOnce(
      new Error('access_token=SECRET')
    );
    const output = await (
      new GetAutomationExecutionDetailTool(service as any).run() as any
    ).execute({ flowId: 'f', executionId: 'exec' }, options);
    expect(JSON.stringify(output)).toContain('AUTOMATION_OPERATION_FAILED');
    expect(JSON.stringify(output)).not.toContain('SECRET');
  });
  it('preserva executionVersion3 no schema e contexto MCP, sem cair no Instagram nativo', async () => {
    const tool: any = new GetCommentAutomationTool(service as any).run();
    expect(
      tool.inputSchema.safeParse({ flowId: 'z', executionVersion: 3 }).success
    ).toBe(true);
    await tool.execute({ flowId: 'z', executionVersion: 3 }, options);
    expect(service.detail).toHaveBeenCalledWith(scope, 'z', 3);
    const history: any = new GetAutomationExecutionHistoryTool(
      service as any
    ).run();
    expect(
      history.inputSchema.safeParse({ flowId: 'z', executionVersion: 3 })
        .success
    ).toBe(true);
    await history.execute({ flowId: 'z', executionVersion: 3 }, options);
    expect(service.executionHistory).toHaveBeenCalledWith(scope, 'z', 3, {});
  });
});

it('aceita no MCP o identificador retornado pelo historico Zernio', async () => {
  const read = jest
    .fn()
    .mockResolvedValue({
      logs: [
        { id: 'remote-log', status: 'sent', createdAt: '2026-11-14T12:00:00Z' },
      ],
      pagination: { hasMore: false },
    });
  const args = {
    scope,
    flowId: 'z',
    integrationId: 'zi',
    accountName: 'Conta',
    query: {},
    read,
  };
  const page: any = await zernioHistory(args);
  const service = {
    scope: jest.fn().mockResolvedValue(scope),
    executionDetail: jest
      .fn()
      .mockImplementation((_s, _f, _v, executionId) =>
        zernioHistory({ ...args, executionId })
      ),
  };
  const tool: any = new GetAutomationExecutionDetailTool(service as any).run();
  expect(page.items[0].id.length).toBeGreaterThan(100);
  const result: any = await tool.execute(
    { flowId: 'z', executionVersion: 3, executionId: page.items[0].id },
    options
  );
  expect(service.executionDetail).toHaveBeenCalledWith(
    scope,
    'z',
    3,
    page.items[0].id
  );
  expect(JSON.stringify(result)).toContain('accepted');
});
