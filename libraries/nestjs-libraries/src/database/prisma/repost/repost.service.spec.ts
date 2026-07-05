jest.mock('nostr-tools', () => ({
  getPublicKey: jest.fn(),
  Relay: jest.fn(),
  finalizeEvent: jest.fn(),
  SimplePool: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { RepostService } from './repost.service';
import { RepostRepository } from './repost.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MockProxy } from 'jest-mock-extended';

describe('RepostService.runNow', () => {
  let service: RepostService;
  let repository: MockProxy<RepostRepository> & RepostRepository;
  let signalWithStart: jest.Mock;

  beforeEach(() => {
    repository = createMock<RepostRepository>();
    signalWithStart = jest.fn();
    const temporal: any = {
      client: {
        getRawClient: () => ({ workflow: { signalWithStart } }),
      },
    };

    service = new RepostService(
      repository,
      temporal,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('envia signal pokeRepost via signalWithStart com USE_EXISTING quando regra ativa', async () => {
    repository.getRuleById.mockResolvedValue({
      id: 'rule-1',
      enabled: true,
    } as any);

    const result = await service.runNow('org-1', 'rule-1');

    expect(signalWithStart).toHaveBeenCalledWith(
      'repostWorkflow',
      expect.objectContaining({
        workflowId: 'repost-rule-rule-1',
        signal: 'pokeRepost',
        signalArgs: [],
        args: [{ ruleId: 'rule-1' }],
        workflowIdConflictPolicy: 'USE_EXISTING',
        taskQueue: 'main',
      })
    );
    expect(result).toEqual({ success: true });
  });

  it('lanca BadRequestException quando regra esta pausada', async () => {
    repository.getRuleById.mockResolvedValue({
      id: 'rule-1',
      enabled: false,
    } as any);

    await expect(service.runNow('org-1', 'rule-1')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(signalWithStart).not.toHaveBeenCalled();
  });

  it('retorna success:false quando Temporal falha (sem lancar)', async () => {
    repository.getRuleById.mockResolvedValue({
      id: 'rule-1',
      enabled: true,
    } as any);
    signalWithStart.mockRejectedValue(new Error('temporal down'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await service.runNow('org-1', 'rule-1');

    expect(result).toEqual({ success: false });
    errorSpy.mockRestore();
  });
});

describe('RepostService.reconcileWorkflows', () => {
  let service: RepostService;
  let repository: MockProxy<RepostRepository> & RepostRepository;
  let start: jest.Mock;

  beforeEach(() => {
    repository = createMock<RepostRepository>();
    start = jest.fn();
    const temporal: any = {
      client: {
        getRawClient: () => ({ workflow: { start } }),
      },
    };

    service = new RepostService(
      repository,
      temporal,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('inicia workflow com USE_EXISTING para cada regra habilitada', async () => {
    repository.findAllEnabled.mockResolvedValue([
      { id: 'r1', organizationId: 'o1' },
      { id: 'r2', organizationId: 'o2' },
    ] as any);

    const result = await service.reconcileWorkflows();

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledWith(
      'repostWorkflow',
      expect.objectContaining({
        workflowId: 'repost-rule-r1',
        taskQueue: 'main',
        args: [{ ruleId: 'r1' }],
        workflowIdConflictPolicy: 'USE_EXISTING',
      })
    );
    expect(result).toEqual({ total: 2, reconciled: 2 });
  });

  it('nao aborta o loop quando o start falha em uma regra', async () => {
    repository.findAllEnabled.mockResolvedValue([
      { id: 'r1', organizationId: 'o1' },
      { id: 'r2', organizationId: 'o2' },
    ] as any);
    start.mockRejectedValueOnce(new Error('temporal down'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await service.reconcileWorkflows();

    expect(result).toEqual({ total: 2, reconciled: 1 });
    errorSpy.mockRestore();
  });

  it('no-op quando nao ha regras habilitadas', async () => {
    repository.findAllEnabled.mockResolvedValue([] as any);

    const result = await service.reconcileWorkflows();

    expect(start).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 0, reconciled: 0 });
  });
});
