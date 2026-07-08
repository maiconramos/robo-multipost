import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';

const { refreshExpiringTokens } = proxyActivities<IntegrationsActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

const ONE_HOUR_MS = 60 * 60_000;
// Recicla via continueAsNew a cada N ciclos para manter a history limitada (o
// Temporal forca a terminacao ao estourar ~50k eventos). Em cadencia diaria a
// history ja e minima; 500 ciclos e folgado.
const CYCLES_BEFORE_CONTINUE = 500;
// Backoff quando um ciclo falha (ex.: DB/Temporal indisponivel logo apos deploy)
// para nao deixar o workflow morrer.
const FAILURE_BACKOFF_MS = 5 * 60_000;

/**
 * Workflow SINGLETON (`refresh-tokens-cron`) que renova proativamente, em lote,
 * todos os canais cujo token expira em <= 1 dia — cobrindo providers SEM
 * `refreshCron` por-canal (linkedin, instagram-facebook, etc.), que antes so
 * eram renovados pelo comando CLI (sem scheduler => nunca).
 *
 * Loop resiliente conforme apps/orchestrator/CLAUDE.md pitfall #9: try/catch com
 * backoff no corpo + continueAsNew FORA do try/catch (ele desenrola via throw de
 * controle que um catch engoliria). Reconciliado no boot pelo
 * StartupMigrationService (RefreshIntegrationService.ensureRefreshTokensCronWorkflow).
 */
export async function refreshTokensCronWorkflow({
  intervalHours = 24,
}: { intervalHours?: number } = {}) {
  const intervalMs = Math.max(intervalHours, 1) * ONE_HOUR_MS;

  let cycles = 0;
  while (true) {
    cycles++;
    try {
      await refreshExpiringTokens();
      await sleep(intervalMs);
    } catch (err) {
      // Loga SOMENTE name+message — nunca o objeto de erro cru. Hoje so erros de
      // infra (DB/Temporal) chegam aqui (refreshTokens engole as excecoes
      // por-canal), mas uma ApplicationFailure RefreshToken/BadBody carrega em
      // details[].body o corpo da requisicao com refresh_token/client_secret;
      // defense-in-depth, mesmo padrao dos catches de refresh no service.
      console.error(
        `[refresh-tokens-cron] cycle failed, backing off: ${
          (err as Error)?.name || 'Error'
        }: ${(err as Error)?.message || 'sem detalhe'}`
      );
      await sleep(FAILURE_BACKOFF_MS);
    }

    // continueAsNew FICA FORA do try/catch (ver pitfall #9).
    if (cycles >= CYCLES_BEFORE_CONTINUE) {
      return await continueAsNew({ intervalHours });
    }
  }
}
