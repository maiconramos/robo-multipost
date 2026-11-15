import { createPrismaRepositoryMock } from '../../../test';
import { ZernioAutomationsRepository } from './zernio-automations.repository';
const scope = { organizationId: 'org', profileId: 'client' };
describe('repositorio Zernio isolado', () => {
  it('nao le regra fora de perfil, versao ou provider', async () => {
    const mock = createPrismaRepositoryMock('flow');
    mock.model.flow.findFirst.mockResolvedValue(null);
    const repo = new ZernioAutomationsRepository({
      flow: mock.model.flow,
    } as any);
    await expect(repo.get(scope, 'flow')).rejects.toThrow('FLOW_NOT_FOUND');
    expect(mock.model.flow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          executionVersion: 3,
          integration: expect.objectContaining({
            providerIdentifier: 'zernio-instagram',
            profileId: 'client',
          }),
        }),
      })
    );
  });
  it('reserva via CAS e recusa concorrencia antes de mutacao remota', async () => {
    const mock = createPrismaRepositoryMock('flow');
    mock.model.flow.updateMany.mockResolvedValue({ count: 0 });
    const repo = new ZernioAutomationsRepository({
      flow: mock.model.flow,
    } as any);
    await expect(
      repo.write(scope, 'flow', 7, {
        schemaVersion: 1,
        configuration: {} as any,
        sync: { state: 'idle' },
      })
    ).rejects.toThrow('REVISION_CONFLICT');
    expect(mock.model.flow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          id: 'flow',
          revision: 7,
          executionVersion: 3,
        }),
        data: expect.objectContaining({ revision: { increment: 1 } }),
      })
    );
  });
  it('exige perfil explicito', () => {
    const repo = new ZernioAutomationsRepository({} as any);
    expect(() => repo.list({ organizationId: 'org', profileId: '' })).toThrow(
      'PROFILE_REQUIRED'
    );
  });
});
