// Evita carregar integration.manager -> nostr.provider -> nostr-tools (ESM) na
// cadeia transitiva de FlowsService; o service e totalmente mockado aqui.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));

import { CreateCommentAutomationTool } from '../create.comment.automation.tool';

const makeFlowsService = () => ({ quickCreateFlow: jest.fn() });

const makeOptions = (org: any, profileId?: string) => ({
  requestContext: {
    get: (k: string) =>
      ({
        organization: org === null ? undefined : JSON.stringify(org),
        profileId,
      } as Record<string, any>)[k],
  },
});

describe('CreateCommentAutomationTool', () => {
  let tool: CreateCommentAutomationTool;
  let flowsService: ReturnType<typeof makeFlowsService>;
  let exec: (input: any, options: any) => Promise<any>;

  beforeEach(() => {
    flowsService = makeFlowsService();
    tool = new CreateCommentAutomationTool(flowsService as any);
    exec = (tool.run() as any).execute;
  });

  it('deve expor o nome correto e id da tool', () => {
    expect(tool.name).toBe('createCommentAutomationTool');
    expect((tool.run() as any).id).toBe('createCommentAutomationTool');
  });

  it('deve delegar para quickCreateFlow com profileId do contexto e default next_publication', async () => {
    flowsService.quickCreateFlow.mockResolvedValue({
      id: 'flow-1',
      name: 'Receita',
      integrationId: 'int-1',
      status: 'ACTIVE',
    });

    const res = await exec(
      { name: 'Receita', integrationId: 'int-1', dmMessage: 'Aqui esta o link' },
      makeOptions({ id: 'org-1' }, 'perfil-A')
    );

    expect(flowsService.quickCreateFlow).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        integrationId: 'int-1',
        postMode: 'next_publication',
      }),
      'perfil-A'
    );
    expect(res.output.id).toBe('flow-1');
  });

  it('nao deve aceitar orgId/profileId via input (vem do contexto)', async () => {
    flowsService.quickCreateFlow.mockResolvedValue({
      id: 'flow-1',
      name: 'X',
      integrationId: 'int-1',
      status: 'ACTIVE',
    });

    await exec(
      { name: 'X', integrationId: 'int-1', orgId: 'org-FORJADA', profileId: 'perfil-FORJADO' },
      makeOptions({ id: 'org-1' }, 'perfil-A')
    );

    // org sempre vem do contexto, nunca do input forjado pelo prompt
    expect(flowsService.quickCreateFlow).toHaveBeenCalledWith(
      'org-1',
      expect.any(Object),
      'perfil-A'
    );
  });

  it('deve rejeitar dmButtonUrl que nao e https publico sem chamar o service', async () => {
    const res = await exec(
      {
        name: 'X',
        integrationId: 'int-1',
        dmMessage: 'oi',
        dmButtonUrl: 'http://localhost/admin',
      },
      makeOptions({ id: 'org-1' }, undefined)
    );

    expect(res.errors).toBeDefined();
    expect(flowsService.quickCreateFlow).not.toHaveBeenCalled();
  });

  it('deve retornar errors quando o service lanca (ex.: integracao de outro perfil)', async () => {
    flowsService.quickCreateFlow.mockRejectedValue(
      new Error('Integracao pertence a outro perfil')
    );

    const res = await exec(
      { name: 'X', integrationId: 'int-1' },
      makeOptions({ id: 'org-1' }, 'perfil-A')
    );

    expect(res.errors).toContain('outro perfil');
  });

  it('deve retornar erro quando nao ha organizacao no contexto', async () => {
    const res = await exec(
      { name: 'X', integrationId: 'int-1' },
      makeOptions(null, undefined)
    );

    expect(res.errors).toBeDefined();
    expect(flowsService.quickCreateFlow).not.toHaveBeenCalled();
  });
});
