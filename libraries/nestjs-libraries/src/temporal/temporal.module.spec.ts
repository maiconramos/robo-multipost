jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  socialIntegrationList: [],
}));

jest.mock('nestjs-temporal-core', () => ({
  TemporalModule: {
    register: jest.fn((config) => config),
  },
}));

import { buildTemporalWorkers } from './temporal.module';

const activities = [class TestActivity {}];
const integrations = [
  { identifier: 'facebook', maxConcurrentJob: 100 },
  { identifier: 'reddit', maxConcurrentJob: 1 },
  { identifier: 'zernio-facebook', maxConcurrentJob: 5 },
];

const build = (overrides: Record<string, unknown> = {}) =>
  buildTemporalWorkers({
    workflowsPath: '/workflows/index.js',
    activityClasses: activities,
    integrations,
    excludeQueue: '',
    concurrencyDivider: '',
    ...overrides,
  });

describe('buildTemporalWorkers', () => {
  it('mantem workflows apenas na fila main e activities em cada provider', () => {
    const workers = build();

    expect(workers.map((worker) => worker.taskQueue)).toEqual([
      'main',
      'facebook',
      'reddit',
    ]);
    expect(workers[0]).toEqual(
      expect.objectContaining({
        taskQueue: 'main',
        workflowsPath: '/workflows/index.js',
        activityClasses: activities,
        autoStart: true,
      })
    );
    expect(workers[1]).not.toHaveProperty('workflowsPath');
    expect(workers[1].activityClasses).toBe(activities);
    expect(workers[2]).not.toHaveProperty('workflowsPath');
  });

  it('preserva a concorrencia atual quando o divisor nao esta configurado', () => {
    const workers = build();

    expect(workers[0]).not.toHaveProperty('workerOptions');
    expect(workers[1].workerOptions).toEqual({
      maxConcurrentActivityTaskExecutions: 100,
    });
    expect(workers[2].workerOptions).toEqual({
      maxConcurrentActivityTaskExecutions: 1,
    });
  });

  it('divide limites de provider sem permitir zero por worker', () => {
    const workers = build({ concurrencyDivider: '2' });

    expect(workers[1].workerOptions).toEqual({
      maxConcurrentActivityTaskExecutions: 50,
    });
    expect(workers[2].workerOptions).toEqual({
      maxConcurrentActivityTaskExecutions: 1,
    });
  });

  it('ignora divisor invalido em vez de alterar capacidade silenciosamente', () => {
    for (const concurrencyDivider of ['0', '-2', '1.5', 'texto']) {
      const workers = build({ concurrencyDivider });
      expect(workers[1].workerOptions).toEqual({
        maxConcurrentActivityTaskExecutions: 100,
      });
    }
  });

  it('exclui filas de provider por nome exato', () => {
    const workers = build({ excludeQueue: ' facebook, reddit ' });

    expect(workers.map((worker) => worker.taskQueue)).toEqual(['main']);
  });

  it('falha no boot se a configuracao tentar excluir a fila main', () => {
    expect(() => build({ excludeQueue: 'main,reddit' })).toThrow(
      'EXCLUDE_QUEUE cannot exclude the main workflow queue'
    );
  });

  it('exige bundle e activities ao criar workers', () => {
    expect(() => build({ workflowsPath: undefined })).toThrow(
      'Temporal workers require workflowsPath'
    );
    expect(() => build({ activityClasses: undefined })).toThrow(
      'Temporal workers require activityClasses'
    );
  });
});
