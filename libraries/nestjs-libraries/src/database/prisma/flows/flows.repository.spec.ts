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
});
