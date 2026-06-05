jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));

import { ListCommentAutomationsTool } from '../list.comment.automations.tool';

const makeFlowsService = () => ({ getFlows: jest.fn() });

const makeOptions = (org: any, profileId?: string) => ({
  requestContext: {
    get: (k: string) =>
      ({
        organization: org === null ? undefined : JSON.stringify(org),
        profileId,
      } as Record<string, any>)[k],
  },
});

describe('ListCommentAutomationsTool', () => {
  let tool: ListCommentAutomationsTool;
  let flowsService: ReturnType<typeof makeFlowsService>;
  let exec: (input: any, options: any) => Promise<any>;

  beforeEach(() => {
    flowsService = makeFlowsService();
    tool = new ListCommentAutomationsTool(flowsService as any);
    exec = (tool.run() as any).execute;
  });

  it('deve listar com org/profileId do contexto e mapear campos', async () => {
    flowsService.getFlows.mockResolvedValue([
      { id: 'f1', name: 'A', status: 'ACTIVE', integrationId: 'int-1', extra: 'x' },
    ]);
    const res = await exec({}, makeOptions({ id: 'org-1' }, 'perfil-A'));
    expect(flowsService.getFlows).toHaveBeenCalledWith('org-1', 'perfil-A');
    expect(res.output).toEqual([
      { id: 'f1', name: 'A', status: 'ACTIVE', integrationId: 'int-1' },
    ]);
  });

  it('deve filtrar por integrationId quando informado', async () => {
    flowsService.getFlows.mockResolvedValue([
      { id: 'f1', name: 'A', status: 'ACTIVE', integrationId: 'int-1' },
      { id: 'f2', name: 'B', status: 'ACTIVE', integrationId: 'int-2' },
    ]);
    const res = await exec(
      { integrationId: 'int-2' },
      makeOptions({ id: 'org-1' }, undefined)
    );
    expect(res.output).toEqual([
      { id: 'f2', name: 'B', status: 'ACTIVE', integrationId: 'int-2' },
    ]);
  });

  it('deve retornar erro quando nao ha organizacao no contexto', async () => {
    const res = await exec({}, makeOptions(null, undefined));
    expect(res.errors).toBeDefined();
    expect(flowsService.getFlows).not.toHaveBeenCalled();
  });
});
