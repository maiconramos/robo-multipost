import { proxyActivities, sleep } from '@temporalio/workflow';
import { RepostActivity } from '@gitroom/orchestrator/activities/repost.activity';

const { runRepostCycle } = proxyActivities<RepostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export async function repostWorkflow({ ruleId }: { ruleId: string }) {
  while (true) {
    const result = await runRepostCycle(ruleId);
    if (result.ruleDisabled) {
      return;
    }
    const intervalMs = Math.max(result.intervalMinutes || 15, 5) * 60_000;
    await sleep(intervalMs);
  }
}
