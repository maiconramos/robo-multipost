jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({})
);
import { ListCommentAutomationsTool } from '../list.comment.automations.tool';
const scope = { organizationId: 'org', profileId: 'perfil' };
const options = {
  requestContext: {
    get: (key: string) =>
      ({ organization: '{"id":"org"}', profileId: 'perfil' }[key]),
  },
};
describe('ListCommentAutomationsTool', () => {
  const service = {
    scope: jest.fn().mockResolvedValue(scope),
    list: jest.fn().mockResolvedValue([]),
  };
  beforeEach(() => jest.clearAllMocks());
  it('lista todos os motores quando a versao foi omitida', async () => {
    const tool: any = new ListCommentAutomationsTool(service as any).run();
    await tool.execute({}, options);
    expect(service.list).toHaveBeenCalledWith(scope, undefined, undefined);
  });
  it('encaminha filtro de versao e integracao no perfil autenticado', async () => {
    const tool: any = new ListCommentAutomationsTool(service as any).run();
    await tool.execute({ executionVersion: 2, integrationId: 'fb' }, options);
    expect(service.list).toHaveBeenCalledWith(scope, 2, 'fb');
  });
  it('recusa versao desconhecida e campos de escopo no input', async () => {
    const tool: any = new ListCommentAutomationsTool(service as any).run();
    const invalidVersion = await tool.execute({ executionVersion: 4 }, options);
    expect(invalidVersion.errors || invalidVersion.error).toBeDefined();
    const forged = await tool.execute({ profileId: 'outro' }, options);
    expect(forged.errors || forged.error).toBeDefined();
    expect(service.list).not.toHaveBeenCalled();
  });
});
