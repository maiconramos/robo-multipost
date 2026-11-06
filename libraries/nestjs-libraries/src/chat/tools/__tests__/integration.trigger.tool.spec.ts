jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: jest.fn(),
  socialIntegrationList: [],
}));
jest.mock('@gitroom/nestjs-libraries/crypto/integration-token.helper', () => ({
  decryptIntegrationToken: (_enc: unknown, stored: string) => stored,
}));

import { IntegrationTriggerTool } from '../integration.trigger.tool';

const makeOptions = (org: any, profileId?: string) => ({
  requestContext: {
    get: (k: string) =>
      ((
        {
          organization: org === null ? undefined : JSON.stringify(org),
          profileId,
        } as Record<string, any>
      )[k]),
  },
});

// Mesmo escopo da tool de agendamento: o canal precisa ser do perfil ativo da
// sessao MCP (antes qualquer canal da org era acionavel por id).
describe('IntegrationTriggerTool (escopo por perfil)', () => {
  const build = (integration: any) => {
    const integrationService = {
      getIntegrationById: jest.fn().mockResolvedValue(integration),
    };
    const manager = { getAllTools: jest.fn().mockReturnValue({}) };
    const tool = new IntegrationTriggerTool(
      manager as any,
      integrationService as any,
      {} as any,
      {} as any,
      { getProfileById: jest.fn().mockResolvedValue({ id: 'prof-1' }) } as any
    );
    return { exec: (tool.run() as any).execute, manager };
  };

  it('canal de outro perfil nao e acionado', async () => {
    const { exec, manager } = build({
      id: 'int-1',
      profileId: 'prof-2',
      providerIdentifier: 'x',
      token: 'tok',
    });
    const res = await exec(
      { integrationId: 'int-1', methodName: 'x', dataSchema: [] },
      makeOptions({ id: 'org-1' }, 'prof-1')
    );
    expect(res).toEqual({
      output: [{ error: 'Integration does not belong to the active profile' }],
    });
    expect(manager.getAllTools).not.toHaveBeenCalled();
  });

  it('canal do perfil ativo (ou sessao sem perfil) segue o fluxo normal', async () => {
    const { exec } = build({
      id: 'int-1',
      profileId: 'prof-1',
      providerIdentifier: 'x',
      token: 'tok',
    });
    const same = await exec(
      { integrationId: 'int-1', methodName: 'x', dataSchema: [] },
      makeOptions({ id: 'org-1' }, 'prof-1')
    );
    const noProfile = await exec(
      {
        integrationId: 'int-1',
        methodName: 'x',
        dataSchema: [],
        profileId: 'prof-1',
      },
      makeOptions({ id: 'org-1' })
    );
    expect(JSON.stringify(same)).not.toMatch(/does not belong/);
    expect(JSON.stringify(noProfile)).not.toMatch(/does not belong/);
  });
});
