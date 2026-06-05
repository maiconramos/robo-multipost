jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));

import { SetCommentAutomationStatusTool } from '../set.comment.automation.status.tool';

const makeFlowsService = () => ({ updateFlowStatus: jest.fn() });

const makeOptions = (org: any, profileId?: string) => ({
  requestContext: {
    get: (k: string) =>
      ({
        organization: org === null ? undefined : JSON.stringify(org),
        profileId,
      } as Record<string, any>)[k],
  },
});

describe('SetCommentAutomationStatusTool', () => {
  let tool: SetCommentAutomationStatusTool;
  let flowsService: ReturnType<typeof makeFlowsService>;
  let exec: (input: any, options: any) => Promise<any>;

  beforeEach(() => {
    flowsService = makeFlowsService();
    tool = new SetCommentAutomationStatusTool(flowsService as any);
    exec = (tool.run() as any).execute;
  });

  it('deve delegar para updateFlowStatus com org/profileId do contexto', async () => {
    flowsService.updateFlowStatus.mockResolvedValue({ id: 'f1', status: 'PAUSED' });
    const res = await exec(
      { flowId: 'f1', status: 'PAUSED' },
      makeOptions({ id: 'org-1' }, 'perfil-A')
    );
    expect(flowsService.updateFlowStatus).toHaveBeenCalledWith(
      'org-1',
      'f1',
      'PAUSED',
      'perfil-A'
    );
    expect(res.output).toEqual({ id: 'f1', status: 'PAUSED' });
  });

  it('deve retornar errors quando o service lanca', async () => {
    flowsService.updateFlowStatus.mockRejectedValue(new Error('Automacao nao encontrada'));
    const res = await exec(
      { flowId: 'f1', status: 'ACTIVE' },
      makeOptions({ id: 'org-1' }, undefined)
    );
    expect(res.errors).toContain('nao encontrada');
  });

  it('deve retornar erro quando nao ha organizacao no contexto', async () => {
    const res = await exec(
      { flowId: 'f1', status: 'ACTIVE' },
      makeOptions(null, undefined)
    );
    expect(res.errors).toBeDefined();
    expect(flowsService.updateFlowStatus).not.toHaveBeenCalled();
  });
});
