import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { FlowsRepository } from './flows.repository';

describe('FlowsRepository', () => {
  let repo: FlowsRepository;
  let flowExecution: ReturnType<typeof createPrismaRepositoryMock>;

  beforeEach(() => {
    flowExecution = createPrismaRepositoryMock('flowExecution');
    repo = new FlowsRepository(
      {} as any,
      {} as any,
      {} as any,
      flowExecution as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  describe('getExecution', () => {
    it('filtra por id e organizationId do flow para isolar o tenant', async () => {
      flowExecution.model.flowExecution.findFirst.mockResolvedValue(null);

      await repo.getExecution('exec-1', 'org-1');

      expect(flowExecution.model.flowExecution.findFirst).toHaveBeenCalledWith({
        where: { id: 'exec-1', flow: { organizationId: 'org-1' } },
      });
    });
  });

  describe('getExecutions', () => {
    it('filtra por flowId e organizationId do flow para isolar o tenant', async () => {
      flowExecution.model.flowExecution.findMany.mockResolvedValue([]);

      await repo.getExecutions('flow-1', 'org-1', 2, 20);

      expect(flowExecution.model.flowExecution.findMany).toHaveBeenCalledWith({
        where: { flowId: 'flow-1', flow: { organizationId: 'org-1' } },
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 20,
      });
    });
  });

  describe('getFailedExecutions', () => {
    it('filtra status=FAILED cross-flow por org e traz o perfil de origem', async () => {
      flowExecution.model.flowExecution.findMany.mockResolvedValue([]);

      await repo.getFailedExecutions('org-1', undefined, 50);

      const arg = flowExecution.model.flowExecution.findMany.mock
        .calls[0][0] as any;
      expect(arg.where.status).toBe('FAILED');
      expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
      expect(arg.where.flow.organizationId).toBe('org-1');
      expect(arg.where.flow.profileId).toBeUndefined();
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
      expect(arg.take).toBe(50);
      expect(arg.select.flow.select.profile.select).toEqual({
        id: true,
        name: true,
      });
    });

    it('aplica profileId ao filtro do flow quando informado', async () => {
      flowExecution.model.flowExecution.findMany.mockResolvedValue([]);

      await repo.getFailedExecutions('org-1', 'prof-2');

      const arg = flowExecution.model.flowExecution.findMany.mock
        .calls[0][0] as any;
      expect(arg.where.flow.profileId).toBe('prof-2');
    });
  });

  describe('getExecutionEventContext', () => {
    it('traz org/perfil/flow + snapshot do canal para o StatusEvent', async () => {
      (flowExecution.model.flowExecution as any).findUnique = jest
        .fn()
        .mockResolvedValue(null);

      await repo.getExecutionEventContext('exec-1');

      const arg = (flowExecution.model.flowExecution as any).findUnique.mock
        .calls[0][0] as any;
      expect(arg.where).toEqual({ id: 'exec-1' });
      expect(arg.select.flow.select).toEqual({
        id: true,
        name: true,
        organizationId: true,
        profileId: true,
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
            name: true,
            picture: true,
          },
        },
      });
    });
  });
});
