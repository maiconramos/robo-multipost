import { proxyActivities } from '@temporalio/workflow';
import type { FlowActivity } from '@gitroom/orchestrator/activities/flow.activity';

// Workflow curto e sem estado disparado pelo webhook de messaging_postbacks.
// Cada clique cria uma nova execucao — nao temos workflow dormente de 23h.
// Caminho "Stateless postback handler" (B): todo o contexto vem do row
// PendingPostback no banco, workflow so orquestra as activities.
const {
  getPendingPostback,
  consumePendingPostback,
  checkIgFollowStatus,
  sendFinalDm,
  sendAlreadyFollowedGate,
  updateExecution,
  appendExecutionLog,
} = proxyActivities<FlowActivity>({
  startToCloseTimeout: '2 minutes',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
    initialInterval: '5 seconds',
  },
});

export async function followGateResolveWorkflow(input: {
  pendingPostbackId: string;
}) {
  const pb = await getPendingPostback(input.pendingPostbackId);
  if (!pb) return;

  // Status race-condition safeguard: se outro clique ja processou, no-op.
  if (pb.status !== 'PENDING') {
    return;
  }

  // Agora temos consent: o clique no postback abriu a janela de messaging
  // de 24h e populou o contexto que o is_user_follow_business precisa.
  const follows = await checkIgFollowStatus(
    pb.integrationId,
    pb.organizationId,
    pb.igSenderId,
    'comment'
  );

  await appendExecutionLog(pb.originExecutionId, {
    nodeId: 'postback_gate',
    nodeType: 'GATE_RESOLVE',
    status: follows ? 'gate_passed' : 'gate_blocked',
    timestamp: new Date().toISOString(),
    error: `attempt=${pb.attemptCount} follows=${follows} kind=${pb.kind}`,
  });

  if (follows) {
    await sendFinalDm(pb.id);
    await consumePendingPostback(pb.id);
    await updateExecution(pb.originExecutionId, {
      status: 'COMPLETED' as any,
      completedAt: new Date(),
    });
    return;
  }

  // Nao segue ainda. Limite maxAttempts previne loop infinito de "Ja segui!".
  // Ao atingir o limite, envia desculpa e encerra a execucao.
  const willExhaust = pb.attemptCount + 1 >= pb.maxAttempts;
  if (willExhaust) {
    await sendAlreadyFollowedGate(pb.id, { exhausted: true });
    await consumePendingPostback(pb.id);
    await updateExecution(pb.originExecutionId, {
      status: 'COMPLETED' as any,
      completedAt: new Date(),
      error: 'gate_max_attempts',
    });
    await appendExecutionLog(pb.originExecutionId, {
      nodeId: 'postback_gate',
      nodeType: 'GATE_RESOLVE',
      status: 'gate_exhausted',
      timestamp: new Date().toISOString(),
      error: `attempts=${pb.attemptCount + 1} max=${pb.maxAttempts}`,
    });
    return;
  }

  // Ainda ha tentativas: activity cria nova PendingPostback 'already_followed'
  // e envia o gate DM com botao "Ja segui!". Execucao permanece
  // WAITING_POSTBACK aguardando o proximo clique.
  await sendAlreadyFollowedGate(pb.id, { exhausted: false });
}
