import type { Type } from '@nestjs/common';
import { TemporalModule } from 'nestjs-temporal-core';
import type { WorkerDefinition } from 'nestjs-temporal-core';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';

type TemporalWorkerSource = {
  identifier: string;
  maxConcurrentJob?: number;
};

export type TemporalWorkerDefinition = WorkerDefinition & {
  activityClasses: Array<Type<object>>;
  autoStart: true;
};

const parseConcurrencyDivider = (value?: string): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

export const buildTemporalWorkers = ({
  workflowsPath,
  activityClasses,
  integrations,
  excludeQueue,
  concurrencyDivider,
}: {
  workflowsPath?: string;
  activityClasses?: Array<Type<object>>;
  integrations: TemporalWorkerSource[];
  excludeQueue?: string;
  concurrencyDivider?: string;
}): TemporalWorkerDefinition[] => {
  if (!workflowsPath) {
    throw new Error('Temporal workers require workflowsPath');
  }
  if (!activityClasses) {
    throw new Error('Temporal workers require activityClasses');
  }

  const excludedQueues = new Set(
    (excludeQueue || '')
      .split(',')
      .map((queue) => queue.trim())
      .filter(Boolean)
  );
  if (excludedQueues.has('main')) {
    throw new Error('EXCLUDE_QUEUE cannot exclude the main workflow queue');
  }

  const divider = parseConcurrencyDivider(concurrencyDivider);

  return [{ identifier: 'main', maxConcurrentJob: undefined }, ...integrations]
    .filter(({ identifier }) => !identifier.includes('-'))
    .map((integration) => ({
      integration,
      taskQueue: integration.identifier.split('-')[0],
    }))
    .filter(({ taskQueue }) => !excludedQueues.has(taskQueue))
    .map(({ integration, taskQueue }) => {
      const concurrency = integration.maxConcurrentJob
        ? Math.max(1, Math.floor(integration.maxConcurrentJob / divider))
        : undefined;

      return {
        taskQueue,
        // Todos os workflows do fork sao iniciados na fila main. As filas de
        // provider executam somente activities e nao precisam compilar bundle,
        // criar isolate V8 ou manter sticky workflow cache.
        ...(taskQueue === 'main' ? { workflowsPath } : {}),
        activityClasses,
        autoStart: true,
        ...(concurrency
          ? {
              workerOptions: {
                maxConcurrentActivityTaskExecutions: concurrency,
              },
            }
          : {}),
      };
    });
};

export const getTemporalModule = (
  isWorkers: boolean,
  path?: string,
  activityClasses?: Array<Type<object>>
) => {
  const workers = isWorkers
    ? buildTemporalWorkers({
        workflowsPath: path,
        activityClasses,
        integrations: socialIntegrationList,
        excludeQueue: process.env.EXCLUDE_QUEUE,
        concurrencyDivider: process.env.WORKER_CONCURRENCY_DIVIDER,
      })
    : undefined;

  if (workers) {
    console.log(
      `[temporal] workers=${workers.length} providerWorkers=activity-only ` +
        `divider=${parseConcurrencyDivider(
          process.env.WORKER_CONCURRENCY_DIVIDER
        )} excludeQueues=[${process.env.EXCLUDE_QUEUE || ''}]`
    );
  }

  return TemporalModule.register({
    isGlobal: true,
    connection: {
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
      ...(process.env.TEMPORAL_API_KEY
        ? { apiKey: process.env.TEMPORAL_API_KEY }
        : {}),
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    },
    taskQueue: 'main',
    logLevel: 'error',
    ...(workers ? { workers } : {}),
  });
};
