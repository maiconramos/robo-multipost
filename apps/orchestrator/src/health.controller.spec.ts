import { Connection } from '@temporalio/client';
import type { Response } from 'express';
import { HealthController } from './health.controller';

jest.mock('@temporalio/client', () => ({
  Connection: {
    connect: jest.fn(),
  },
}));

const connectMock = Connection.connect as jest.MockedFunction<
  typeof Connection.connect
>;

const createResponse = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    response: { status } as unknown as Response,
    status,
    json,
  };
};

describe('HealthController workers', () => {
  const originalEnv = process.env;
  const describeTaskQueue = jest.fn();
  const close = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.TEMPORAL_HEALTH_TASK_QUEUES;
    delete process.env.TEMPORAL_HEALTH_ACTIVITY_TASK_QUEUES;
    describeTaskQueue.mockResolvedValue({ pollers: [{ identity: 'worker' }] });
    connectMock.mockResolvedValue({
      workflowService: { describeTaskQueue },
      close,
    } as unknown as Connection);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('preserva a sonda workflow main por padrao', async () => {
    const res = createResponse();

    await new HealthController().getWorkersStatus(res.response);

    expect(describeTaskQueue).toHaveBeenCalledTimes(1);
    expect(describeTaskQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: { name: 'main', kind: 1 },
        taskQueueType: 1,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        queues: [
          {
            taskQueue: 'main',
            taskType: 'workflow',
            pollers: 1,
            healthy: true,
          },
        ],
      })
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('consulta filas de activities separadamente e remove duplicatas', async () => {
    process.env.TEMPORAL_HEALTH_TASK_QUEUES = ' main, main ';
    process.env.TEMPORAL_HEALTH_ACTIVITY_TASK_QUEUES =
      'facebook, instagram, facebook';
    const res = createResponse();

    await new HealthController().getWorkersStatus(res.response);

    expect(describeTaskQueue).toHaveBeenCalledTimes(3);
    expect(describeTaskQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: { name: 'facebook', kind: 1 },
        taskQueueType: 2,
      })
    );
    expect(describeTaskQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: { name: 'instagram', kind: 1 },
        taskQueueType: 2,
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        queues: expect.arrayContaining([
          expect.objectContaining({
            taskQueue: 'facebook',
            taskType: 'activity',
            healthy: true,
          }),
          expect.objectContaining({
            taskQueue: 'instagram',
            taskType: 'activity',
            healthy: true,
          }),
        ]),
      })
    );
  });

  it('retorna 503 quando uma fila de activity nao tem poller', async () => {
    process.env.TEMPORAL_HEALTH_ACTIVITY_TASK_QUEUES = 'facebook';
    describeTaskQueue.mockImplementation(({ taskQueueType }) =>
      Promise.resolve({
        pollers: taskQueueType === 2 ? [] : [{ identity: 'worker' }],
      })
    );
    const res = createResponse();

    await new HealthController().getWorkersStatus(res.response);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'no_workers',
        queues: expect.arrayContaining([
          {
            taskQueue: 'facebook',
            taskType: 'activity',
            pollers: 0,
            healthy: false,
          },
        ]),
      })
    );
  });
});
