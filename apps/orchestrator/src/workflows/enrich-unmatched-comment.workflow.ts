import { proxyActivities } from '@temporalio/workflow';
import type { FlowActivity } from '@gitroom/orchestrator/activities/flow.activity';

// Workflow simples sem estado: disparado quando o webhook do Instagram entrega
// comentario em mediaId desconhecida. Enriquece o UnmatchedComment com
// metadata (thumbnail, caption, badge "Anuncio") via Graph API para o usuario
// conseguir identificar o post na UI do Inbox.
//
// Retry exponencial mitiga rate limit do Graph (cache Redis de 24h evita
// rebatidas na maioria dos casos).
const { enrichUnmatchedComment } = proxyActivities<FlowActivity>({
  startToCloseTimeout: '30 seconds',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 5,
    backoffCoefficient: 2,
    initialInterval: '5 seconds',
  },
});

export async function enrichUnmatchedCommentWorkflow(
  unmatchedCommentId: string
) {
  await enrichUnmatchedComment(unmatchedCommentId);
}
