import { Controller, Get, Logger, Res } from '@nestjs/common';
import { Response } from 'express';
import { Connection } from '@temporalio/client';

const TEMPORAL_TASK_QUEUE_TYPE_WORKFLOW = 1; // TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW

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
      await Promise.race([
        connection.workflowService.describeNamespace({ namespace }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000)
        ),
      ]);
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
   * Para cada task queue critica (default 'main', override via env), consulta
   * `describeTaskQueue` no Temporal Server e reporta o numero de pollers
   * ativos. Se nenhum poller estiver registrado, retorna 503 — cron/uptime
   * externo (Uptime Kuma, Pingdom, cron interno) detecta e alerta.
   *
   * Workers Temporal podem ficar "online" do ponto de vista do PM2 mas sem
   * registrar no task queue (zombie state, OOM partial). Esse endpoint
   * captura essa condicao especifica que `pm2 list` nao detecta.
   */
  @Get('/workers')
  async getWorkersStatus(@Res() res: Response) {
    const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
    const queuesEnv =
      process.env.TEMPORAL_HEALTH_TASK_QUEUES || 'main';
    const queues = queuesEnv
      .split(',')
      .map((q) => q.trim())
      .filter(Boolean);

    let connection: Connection | undefined;
    try {
      connection = await openTemporalConnection();

      const results = await Promise.all(
        queues.map(async (taskQueue) => {
          try {
            const description = await Promise.race([
              connection!.workflowService.describeTaskQueue({
                namespace,
                taskQueue: { name: taskQueue, kind: 1 /* NORMAL */ },
                taskQueueType: TEMPORAL_TASK_QUEUE_TYPE_WORKFLOW,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 10000)
              ),
            ]);
            const pollers = description.pollers?.length ?? 0;
            return { taskQueue, pollers, healthy: pollers > 0 };
          } catch (err) {
            return {
              taskQueue,
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
          .map((r) => r.taskQueue)
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
