import { resolve } from 'node:path';

import {
  parseReplayArguments,
  replayPostWorkflowHistory,
  resolveReplayHistoryPath,
} from './post-workflow-replay';

const startedHistory = (workflowType = 'postWorkflowV102') => ({
  events: [
    {
      eventId: '1',
      eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
      workflowExecutionStartedEventAttributes: {
        workflowType: { name: workflowType },
      },
    },
  ],
});

describe('post workflow history replay', () => {
  const cwd = '/workspace';

  it('remove o separador que o pnpm repassa ao script', () => {
    expect(
      parseReplayArguments(['--', 'tmp/temporal-replay/meta.json', 'post_1'])
    ).toEqual({
      historyPath: 'tmp/temporal-replay/meta.json',
      workflowId: 'post_1',
    });
  });

  it('aceita somente JSON dentro do diretorio temporario ignorado pelo Git', () => {
    expect(resolveReplayHistoryPath('tmp/temporal-replay/meta.json', cwd)).toBe(
      resolve(cwd, 'tmp/temporal-replay/meta.json')
    );

    expect(() =>
      resolveReplayHistoryPath('docs/meta-production.json', cwd)
    ).toThrow('tmp/temporal-replay');
    expect(() =>
      resolveReplayHistoryPath('tmp/temporal-replay/meta.txt', cwd)
    ).toThrow('arquivo .json');
  });

  it('recusa historico que nao pertence ao pipeline versionado de posts', async () => {
    const readFile = jest
      .fn()
      .mockResolvedValue(JSON.stringify(startedHistory('streakWorkflow')));
    const runReplayHistory = jest.fn();

    await expect(
      replayPostWorkflowHistory('tmp/temporal-replay/streak.json', {
        cwd,
        readFile,
        runReplayHistory,
        workflowsPath: '/workspace/apps/orchestrator/src/workflows/index.ts',
      })
    ).rejects.toThrow('workflow de publicacao suportado');
    expect(runReplayHistory).not.toHaveBeenCalled();
  });

  it('executa o replay real pelo SDK sem registrar o conteudo do historico', async () => {
    const history = startedHistory();
    const readFile = jest.fn().mockResolvedValue(JSON.stringify(history));
    const runReplayHistory = jest.fn().mockResolvedValue(undefined);

    await expect(
      replayPostWorkflowHistory('tmp/temporal-replay/facebook.json', {
        cwd,
        readFile,
        runReplayHistory,
        workflowsPath: '/workspace/apps/orchestrator/src/workflows/index.ts',
        workflowId: 'post_test',
      })
    ).resolves.toEqual({
      historyPath: resolve(cwd, 'tmp/temporal-replay/facebook.json'),
      workflowType: 'postWorkflowV102',
    });

    expect(runReplayHistory).toHaveBeenCalledWith(
      {
        workflowsPath: '/workspace/apps/orchestrator/src/workflows/index.ts',
      },
      history,
      'post_test'
    );
  });
});
