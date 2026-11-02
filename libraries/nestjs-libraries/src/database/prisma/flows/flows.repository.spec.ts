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
      expect(arg.where.flow.deletedAt).toBeNull();
      expect(arg.where.flow.OR).toEqual([
        { profileId: null },
        { profile: { deletedAt: null } },
      ]);
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


describe('isolamento em execucoes legadas ja ativas', () => {
  const integration = { internalId:'account', organizationId: 'o', profileId: 'p', disabled: false, deletedAt: null as Date | null };
  const flow = { id: 'f', organizationId: 'o', profileId: 'p', integrationId: 'i', integration };
  let repo: FlowsRepository;
  let model: any;
  let postbacks: any;
  beforeEach(() => {
    model = { findFirst: jest.fn(), findMany: jest.fn() };
    postbacks = { findUnique: jest.fn() };
    repo = new FlowsRepository({model:{flow:model}} as any, {} as any, {} as any, {} as any, {model:{pendingPostback:postbacks}} as any, {} as any, {} as any, {} as any);
  });
  it.each(['getActiveFlowsForIntegration', 'findPendingNextPublicationFlows'] as const)('%s exclui conta movida para outro perfil ou organizacao', async method => {
    model.findMany.mockResolvedValue([flow, {...flow, profileId:'other'}, {...flow, organizationId:'other'}, {...flow, integration:{...integration, disabled:true}}]);
    expect(await repo[method]('i')).toEqual([flow]);
  });
  it('bloqueia inicio e retomada de flow com conta de outro perfil', async () => {
    model.findFirst.mockResolvedValue({...flow, profileId:'other'});
    expect(await repo.getFlowById('f')).toBeNull();
    model.findFirst.mockResolvedValue(flow);
    expect(await repo.getFlowById('f')).toEqual(flow);
  });
  it('preserva integracao legada sem perfil apenas na mesma organizacao', async () => {
    model.findFirst.mockResolvedValue({...flow, integration:{...integration, profileId:null}});
    expect(await repo.getFlowById('f')).toBeTruthy();
    model.findFirst.mockResolvedValue({...flow, profileId:null});
    expect(await repo.getFlowById('f')).toBeNull();
  });
  it('rejeita clique valido encaminhado por outro remetente ou outra conta', async () => {
    const pb={id:'pb',flowId:'f',integrationId:'i',organizationId:'o',igSenderId:'original'};
    postbacks.findUnique.mockResolvedValue(pb);
    model.findFirst.mockResolvedValue({...flow,integration:{...integration,internalId:'account'}});
    const read=(identity:any)=>(repo.findPostbackByPayload as any)('signed-fixture',identity);
    expect(await read({senderIgsid:'other',igAccountId:'account'})).toBeNull();
    expect(await read({senderIgsid:'original',igAccountId:'other'})).toBeNull();
    expect(await read({senderIgsid:'original',igAccountId:'account'})).toEqual(pb);
  });
  it.each(['findPostbackById','findPostbackByPayload'] as const)('%s bloqueia snapshot cujo canal ou tenant diverge do flow', async method => {
    model.findFirst.mockResolvedValue(flow);
    for (const override of [{integrationId:'other'}, {organizationId:'other'}]) {
      postbacks.findUnique.mockResolvedValue({id:'pb', flowId:'f', integrationId:'i', organizationId:'o', igSenderId:'original', ...override});
      expect(await (repo[method] as any)('pb', {senderIgsid:'original',igAccountId:'account'})).toBeNull();
    }
    const pb = {id:'pb', flowId:'f', integrationId:'i', organizationId:'o', igSenderId:'original'};
    postbacks.findUnique.mockResolvedValue(pb);
    expect(await (repo[method] as any)('pb', {senderIgsid:'original',igAccountId:'account'})).toEqual(pb);
    model.findFirst.mockResolvedValue(null);
    expect(await (repo[method] as any)('pb', {senderIgsid:'original',igAccountId:'account'})).toBeNull();
  });
});

describe('FlowsRepository.updateFlowStatus', () => {
  it('automacao de outro perfil responde 404 (nao 500)', async () => {
    const flow = createPrismaRepositoryMock('flow');
    flow.model.flow.update.mockRejectedValue(
      Object.assign(new Error('Record to update not found'), { code: 'P2025' })
    );
    const repo = new FlowsRepository(
      flow as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await expect(
      repo.updateFlowStatus('org-1', 'flow-b', 'PAUSED' as any, 'prof-a')
    ).rejects.toMatchObject({ status: 404 });
    expect(flow.model.flow.update.mock.calls[0][0].where).toMatchObject({
      id: 'flow-b',
      organizationId: 'org-1',
      profileId: 'prof-a',
    });
  });
});
