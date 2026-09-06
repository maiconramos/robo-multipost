import { Controller, Get, Logger, Res } from '@nestjs/common';
import { Response } from 'express';
import { Connection } from '@temporalio/client';

const TEMPORAL_TASK_QUEUE_TYPE_WORKFLOW = 1; // TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW
const TEMPORAL_TASK_QUEUE_TYPE_ACTIVITY = 2; // TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY
const TEMPORAL_TASK_QUEUE_KIND_NORMAL = 1; // TaskQueueKind.TASK_QUEUE_KIND_NORMAL

type HealthTaskQueueType = 'workflow' | 'activity';

const parseQueueList = (value: string): string[] => [
  ...new Set(
    value
      .split(',')
      .map((queue) => queue.trim())
      .filter(Boolean)
  ),
];

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 10000
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function openTemporalConnection(): Promise<Connection> {
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  return Connection.connect({
    address,
    ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
    ...(process.env.TEMPORAL_API_KEY
      ? { apiKey: process.env.TEMPORAL_API_KEY }
      : {}),
  });
}

@Controller('health')
export class HealthController {
  private readonly _logger = new Logger(HealthController.name);

  @Get('/status')
  async getHealthStatus(@Res() res: Response) {
    let connection: Connection | undefined;
    try {
      connection = await openTemporalConnection();
      const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
      await withTimeout(
        connection.workflowService.describeNamespace({ namespace })
      );
      return res.status(200).json({ status: 'ok' });
    } catch {
      return res.status(500).json({ status: 'error' });
    } finally {
      await connection?.close().catch(() => {});
    }
  }

  /**
   * Diagnostico de "No Workers Running" no Temporal — observabilidade ativa.
   *
   * Para cada fila critica de workflow (default 'main') e cada fila de
   * activities configurada, consulta `describeTaskQueue` no Temporal Server e
   * reporta o numero de pollers do tipo correto. Se algum poller estiver
   * ausente, retorna 503 — cron/uptime externo detecta e alerta.
   *
   * Workers Temporal podem ficar "online" do ponto de vista do PM2 mas sem
   * registrar no task queue (zombie state, OOM partial). Esse endpoint
   * captura essa condicao especifica que `pm2 list` nao detecta.
   */
  @Get('/workers')
  async getWorkersStatus(@Res() res: Response) {
    const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
    const workflowQueues = parseQueueList(
      process.env.TEMPORAL_HEALTH_TASK_QUEUES || 'main'
    );
    const activityQueues = parseQueueList(
      process.env.TEMPORAL_HEALTH_ACTIVITY_TASK_QUEUES || ''
    );
    const queues: Array<{
      taskQueue: string;
      taskType: HealthTaskQueueType;
      temporalTaskQueueType: number;
    }> = [
      ...workflowQueues.map((taskQueue) => ({
        taskQueue,
        taskType: 'workflow' as const,
        temporalTaskQueueType: TEMPORAL_TASK_QUEUE_TYPE_WORKFLOW,
      })),
      ...activityQueues.map((taskQueue) => ({
        taskQueue,
        taskType: 'activity' as const,
        temporalTaskQueueType: TEMPORAL_TASK_QUEUE_TYPE_ACTIVITY,
      })),
    ];

    let connection: Connection | undefined;
    try {
      connection = await openTemporalConnection();

      const results = await Promise.all(
        queues.map(async ({ taskQueue, taskType, temporalTaskQueueType }) => {
          try {
            const description = await withTimeout(
              connection!.workflowService.describeTaskQueue({
                namespace,
                taskQueue: {
                  name: taskQueue,
                  kind: TEMPORAL_TASK_QUEUE_KIND_NORMAL,
                },
                taskQueueType: temporalTaskQueueType,
              })
            );
            const pollers = description.pollers?.length ?? 0;
            return {
              taskQueue,
              taskType,
              pollers,
              healthy: pollers > 0,
            };
          } catch (err) {
            return {
              taskQueue,
              taskType,
              pollers: 0,
              healthy: false,
              error: (err as Error).message,
            };
          }
        })
      );

      const allHealthy = results.every((r) => r.healthy);
      const statusCode = allHealthy ? 200 : 503;

      if (!allHealthy) {
        const downQueues = results
          .filter((r) => !r.healthy)
          .map((r) => `${r.taskType}:${r.taskQueue}`)
          .join(', ');
        this._logger.warn(
          `Health check: task queues sem workers polling: ${downQueues}`
        );
      }

      return res.status(statusCode).json({
        status: allHealthy ? 'ok' : 'no_workers',
        namespace,
        queues: results,
      });
    } catch (err) {
      this._logger.error(
        `Health check workers falhou: ${(err as Error).message}`
      );
      return res.status(500).json({
        status: 'error',
        message: (err as Error).message,
      });
    } finally {
      await connection?.close().catch(() => {});
    }
  }
}
