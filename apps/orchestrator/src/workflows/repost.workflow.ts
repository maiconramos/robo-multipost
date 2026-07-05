import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import { RepostActivity } from '@gitroom/orchestrator/activities/repost.activity';
import { pokeRepostSignal } from '@gitroom/orchestrator/signals/repost.signal';

const { runRepostCycle } = proxyActivities<RepostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// Recicla o workflow via continueAsNew a cada N ciclos para manter a history
// limitada — o Temporal forca a terminacao ao estourar o teto (~50k eventos /
// 50MB). ~500 ciclos ~= 7,5k eventos por geracao, folgado sob o limite.
const CYCLES_BEFORE_CONTINUE = 500;
// Backoff quando um ciclo falha (ex.: DB indisponivel logo apos um deploy) para
// nao deixar o workflow morrer. Alinhado ao piso de intervalo de 5 min.
const FAILURE_BACKOFF_MS = 5 * 60_000;

export async function repostWorkflow({ ruleId }: { ruleId: string }) {
  let poked = false;
  setHandler(pokeRepostSignal, () => {
    poked = true;
  });

  let cycles = 0;
  while (true) {
    cycles++;
    try {
      const result = await runRepostCycle(ruleId);
      if (result.ruleDisabled) {
        return;
      }
      const intervalMs = Math.max(result.intervalMinutes || 15, 5) * 60_000;
      poked = false;
      await condition(() => poked, intervalMs);
    } catch (err) {
      // Activity falhou apos os retries (ex.: getRuleFresh lancou porque o DB
      // ainda nao estava pronto no deploy). Loga, faz backoff e re-tenta o
      // ciclo — NAO deixa terminar o workflow.
      console.error(`[repost] rule=${ruleId} cycle failed, backing off`, err);
      await sleep(FAILURE_BACKOFF_MS);
    }

    // continueAsNew FICA FORA do try/catch: ele desenrola via throw de
    // controle; dentro do catch seria engolido e o workflow nunca reciclaria.
    if (cycles >= CYCLES_BEFORE_CONTINUE) {
      return await continueAsNew({ ruleId });
    }
  }
}
