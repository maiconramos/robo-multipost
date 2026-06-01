import * as Sentry from '@sentry/nestjs';
import { createRequire } from 'node:module';
import { capitalize } from 'lodash';

// @sentry/profiling-node carrega um binario nativo (CPU profiler) ja no
// require do modulo. Em algumas imagens esse binario nao existe para a
// combinacao plataforma/ABI do Node em uso (ex.: linux-x64 + Node muito novo
// sem prebuild publicado) e o import estatico derrubava o processo inteiro —
// mesmo quando o Sentry nem estava configurado. Por isso carregamos o
// profiling de forma preguicosa, somente quando o Sentry esta ativo (DSN
// presente), e toleramos a ausencia do binario sem derrubar a aplicacao.
// createRequire evita o import estatico (que rodaria no load do modulo) sem
// precisar de eslint-disable.
const lazyRequire = createRequire(__filename);

export const initializeSentry = (appName: string, allowLogs = false) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return null;
  }

  const integrations: any[] = [
    Sentry.consoleLoggingIntegration({
      levels: ['log', 'info', 'warn', 'error', 'debug', 'assert', 'trace'],
    }),
    Sentry.openAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ];

  // Profiling e best-effort: se o binario nativo estiver ausente, seguimos
  // sem profiling em vez de derrubar o backend/orchestrator no boot.
  try {
    const { nodeProfilingIntegration } = lazyRequire('@sentry/profiling-node');
    integrations.unshift(nodeProfilingIntegration());
  } catch (err) {
    console.warn(
      '[sentry] profiler nativo indisponivel, seguindo sem profiling:',
      err instanceof Error ? err.message : err
    );
  }

  try {
    Sentry.init({
      initialScope: {
        tags: {
          service: appName,
          component: 'nestjs',
        },
        contexts: {
          app: {
            name: `Postiz ${capitalize(appName)}`,
          },
        },
      },
      environment: process.env.NODE_ENV || 'development',
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      spotlight: process.env.SENTRY_SPOTLIGHT === '1',
      integrations,
      tracesSampleRate: 1.0,
      enableLogs: true,

      // Profiling
      profileSessionSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.45,
      profileLifecycle: 'trace',
    });
  } catch (err) {
    console.log(err);
  }
  return true;
};
