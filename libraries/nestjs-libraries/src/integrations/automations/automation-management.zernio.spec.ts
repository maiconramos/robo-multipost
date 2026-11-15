jest.mock('../integration.manager', () => ({}));
import { createMock } from '../../test';
import { AutomationManagementService } from './automation-management.service';
import { ZernioAutomationsService } from './zernio-automations.service';
import { SharedFlowsService } from '../../database/prisma/flows-v2/shared-flows.service';
import { FlowsService } from '../../database/prisma/flows/flows.service';
const scope = { organizationId: 'o', profileId: 'p' };
describe('fachada de automacoes Zernio', () => {
  function setup() {
    const z = createMock<ZernioAutomationsService>(),
      shared = createMock<SharedFlowsService>(),
      flows = createMock<FlowsService>();
    shared.listChannels.mockResolvedValue([]);
    z.channels.mockResolvedValue([
      { id: 'zi', providerIdentifier: 'zernio-instagram' },
    ] as any);
    return {
      z,
      shared,
      flows,
      service: new AutomationManagementService(
        flows,
        shared,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        z
      ),
    };
  }
  it('descobre canal com motor explicito e cria sem chamar Graph ou V1', async () => {
    const { z, flows, service } = setup();
    z.create.mockResolvedValue({ id: 'z', executionVersion: 3 } as any);
    expect(
      await service.create(scope, {
        name: 'Regra',
        integrationId: 'zi',
        postMode: 'all',
        dmMessage: 'Oi',
      })
    ).toMatchObject({ executionVersion: 3 });
    expect(z.create).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ integrationId: 'zi' })
    );
    expect(flows.createDraftFlow).not.toHaveBeenCalled();
  });
  it('roteia detalhe e historico para o motor 3', async () => {
    const { z, service } = setup();
    await service.detail(scope, 'z', 3);
    await service.executionHistory(scope, 'z', 3, {});
    expect(z.get).toHaveBeenCalledWith(scope, 'z');
    expect(z.history).toHaveBeenCalledWith(scope, 'z', {});
  });
  it('nao permite canvas nativo na regra remota', async () => {
    const { z, service } = setup();
    await expect(
      service.canvas(scope, 'z', 3, { nodes: [], edges: [] })
    ).rejects.toThrow('ZERNIO_CANVAS_UNSUPPORTED');
    expect(z.update).not.toHaveBeenCalled();
  });
});
