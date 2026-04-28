import { proxyActivities, sleep } from '@temporalio/workflow';
import type { FlowActivity } from '@gitroom/orchestrator/activities/flow.activity';

const {
  getFlowWithNodes,
  replyToComment,
  sendDirectMessage,
  sendStoryDirectMessage,
  checkIgFollowStatus,
  evaluateCondition,
  updateExecution,
  appendExecutionLog,
  createPendingPostback,
  sendOpeningDmWithPostback,
} = proxyActivities<FlowActivity>({
  startToCloseTimeout: '5 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
    initialInterval: '10 seconds',
  },
});

const FOLLOW_GATE_DEFAULT =
  'Olá! Esse conteúdo é exclusivo para seguidores. Me segue aqui e responde o story de novo para eu te enviar 💙';

export interface FlowExecutionInput {
  executionId: string;
  flowId: string;
  integrationId: string;
  // Comment-based trigger fields (triggerType omitted or 'comment_on_post')
  triggerType?: 'comment_on_post' | 'story_reply';
  igCommentId?: string;
  igCommenterId?: string;
  igCommenterName?: string;
  igMediaId?: string;
  commentText?: string;
  // Story reply trigger fields (triggerType='story_reply')
  igSenderId?: string;
  igSenderName?: string;
  igStoryId?: string;
  igThreadId?: string;
  igMessageId?: string;
  messageText?: string;
  reaction?: string;
}

/** Mutable context passed through the graph traversal. */
interface TraversalContext {
  /**
   * Collected DM messages. Meta only allows ONE private reply per comment
   * and `recipient: { id }` requires advanced access to instagram_manage_messages.
   * So we collect all DM texts during traversal and send them as a single
   * combined private reply at the end.
   */
  dmMessages: string[];
  /**
   * Optional button attached to the DM. Only one button is supported by Meta's
   * button template, so the last SEND_DM node with a button wins.
   */
  dmButtonText?: string;
  dmButtonUrl?: string;
  /**
   * Sinaliza que o TRIGGER ja pausou a execucao em WAITING_POSTBACK
   * (follow-gate 2 etapas). O top-level workflow nao deve sobrescrever
   * o status para COMPLETED — quem retoma e o followGateResolveWorkflow.
   */
  awaitingPostback?: boolean;
}

export async function flowExecutionWorkflow(input: FlowExecutionInput) {
  try {
    const flow = await getFlowWithNodes(input.flowId);
    if (!flow) {
      await updateExecution(input.executionId, {
        status: 'FAILED' as any,
        error: 'Flow not found',
        completedAt: new Date(),
      });
      return;
    }

    // Find the TRIGGER node
    const triggerNode = flow.nodes.find((n: any) => n.type === 'TRIGGER');
    if (!triggerNode) {
      await updateExecution(input.executionId, {
        status: 'FAILED' as any,
        error: 'No trigger node found',
        completedAt: new Date(),
      });
      return;
    }

    const ctx: TraversalContext = { dmMessages: [] };

    // Traverse the graph starting from the trigger node
    await traverseNode(
      triggerNode.id,
      flow.nodes,
      flow.edges,
      input,
      flow.integrationId || input.integrationId,
      flow.organizationId,
      0,
      ctx
    );

    // Se o TRIGGER pausou para aguardar postback (follow-gate 2 etapas),
    // nao enviamos DMs aqui nem marcamos COMPLETED — o gate controla o fluxo.
    if (ctx.awaitingPostback) {
      return;
    }

    // Send all collected DM messages.
    // - comment_on_post: ONE private reply per comment (Meta limit), combined.
    // - story_reply: regular DM using recipient:{id} — user already opened
    //   the 24h messaging window by replying to the story.
    if (ctx.dmMessages.length > 0) {
      const combinedMessage = ctx.dmMessages.join('\n\n');
      const integrationId = flow.integrationId || input.integrationId;

      if (input.triggerType === 'story_reply' && input.igSenderId) {
        await sendStoryDirectMessage(
          integrationId,
          flow.organizationId,
          input.igSenderId,
          combinedMessage,
          ctx.dmButtonText,
          ctx.dmButtonUrl
        );
      } else if (input.igCommenterId && input.igCommentId) {
        await sendDirectMessage(
          integrationId,
          flow.organizationId,
          input.igCommenterId,
          combinedMessage,
          input.igCommentId,
          ctx.dmButtonText,
          ctx.dmButtonUrl
        );
      }
    }

    await updateExecution(input.executionId, {
      status: 'COMPLETED' as any,
      completedAt: new Date(),
    });
  } catch (err: any) {
    await updateExecution(input.executionId, {
      status: 'FAILED' as any,
      error: err?.message || 'Unknown error',
      completedAt: new Date(),
    });
    throw err;
  }
}

async function traverseNode(
  nodeId: string,
  nodes: any[],
  edges: any[],
  input: FlowExecutionInput,
  integrationId: string,
  orgId: string,
  depth: number,
  ctx: TraversalContext
): Promise<void> {
  if (depth > 50) {
    throw new Error('Max traversal depth exceeded');
  }

  const node = nodes.find((n: any) => n.id === nodeId);
  if (!node) return;

  await updateExecution(input.executionId, {
    currentNodeId: nodeId,
  });

  await appendExecutionLog(input.executionId, {
    nodeId,
    nodeType: node.type,
    status: 'entered',
    timestamp: new Date().toISOString(),
  });

  // Execute node based on type
  try {
  switch (node.type) {
    case 'TRIGGER': {
      // If trigger has keywords, evaluate them — skip flow if no match
      const triggerConfig = safeParseJson(node.data);
      if (triggerConfig.keywords?.length) {
        const matches = await evaluateCondition(
          node.data || '{}',
          triggerText(input)
        );
        if (!matches) {
          await appendExecutionLog(input.executionId, {
            nodeId,
            nodeType: node.type,
            status: 'skipped',
            timestamp: new Date().toISOString(),
            error: 'keywords_not_matched',
          });
          return;
        }
      }

      // Follow gate 2 etapas para comentarios: is_user_follow_business nao eh
      // confiavel antes do usuario abrir janela de messaging. Entao:
      //   1. Responde publicamente no comentario.
      //   2. Envia DM inicial com botao postback (abre janela ao clicar).
      //   3. Cria PendingPostback e pausa em WAITING_POSTBACK.
      //   4. followGateResolveWorkflow retoma quando o clique chegar.
      // Story replies continuam usando o check direto — a janela ja esta
      // aberta no momento da resposta.
      if (
        triggerConfig.requireFollow &&
        input.triggerType === 'comment_on_post' &&
        input.igCommentId &&
        input.igMediaId &&
        input.igCommenterId
      ) {
        // 1. Resposta publica no comentario (se configurada no flow).
        const replyNode = nodes.find((n: any) => n.type === 'REPLY_COMMENT');
        if (replyNode) {
          const cfg = safeParseJson(replyNode.data);
          const rawMsg = pickReplyMessage(cfg);
          const msg = interpolateVariables(rawMsg, input);
          if (msg) {
            await replyToComment(
              integrationId,
              orgId,
              input.igCommentId,
              input.igMediaId,
              msg
            );
          }
        }

        // 2. Snapshots vindos do nó SEND_DM (se houver) para servir como
        // conteudo da DM final apos confirmacao do follow.
        const dmNode = nodes.find((n: any) => n.type === 'SEND_DM');
        const dmCfg = dmNode ? safeParseJson(dmNode.data) : {};
        const finalDmMessage = interpolateVariables(
          dmCfg.message || dmCfg.template || '',
          input
        );

        // 3. Cria pending postback e envia opening DM com botao.
        const pending = await createPendingPostback({
          flowId: input.flowId,
          originExecutionId: input.executionId,
          integrationId,
          organizationId: orgId,
          igSenderId: input.igCommenterId,
          igCommenterName: input.igCommenterName,
          igMediaId: input.igMediaId,
          igCommentId: input.igCommentId,
          kind: 'initial',
          maxAttempts: triggerConfig.maxGateAttempts ?? 3,
          snapshotFinalDm: finalDmMessage || undefined,
          snapshotFinalBtnText: dmCfg.buttonText || undefined,
          snapshotFinalBtnUrl: dmCfg.buttonUrl || undefined,
          snapshotGateDm: triggerConfig.followGateMessage || undefined,
          snapshotAlreadyBtnText:
            triggerConfig.alreadyFollowedButtonText || undefined,
          snapshotExhaustedMessage:
            triggerConfig.gateExhaustedMessage || undefined,
          openingDmMessage: triggerConfig.openingDmMessage || undefined,
          openingDmButtonText:
            triggerConfig.openingDmButtonText || undefined,
        });

        await sendOpeningDmWithPostback(pending.id);

        // 4. Pausa a execucao ate o clique do usuario chegar.
        ctx.awaitingPostback = true;
        await updateExecution(input.executionId, {
          status: 'WAITING_POSTBACK' as any,
          currentNodeId: nodeId,
        });
        await appendExecutionLog(input.executionId, {
          nodeId,
          nodeType: node.type,
          status: 'awaiting_postback',
          timestamp: new Date().toISOString(),
          error: `pendingPostbackId=${pending.id}`,
        });
        return;
      }

      // Follow gate: when the sender doesn't follow the IG business account,
      // reply with a customizable gate message instead of the configured DM
      // (and drop any button — the CTA is "follow us and reply again").
      // Works for both story_reply and comment_on_post triggers.
      if (triggerConfig.requireFollow) {
        const senderId =
          input.triggerType === 'story_reply'
            ? input.igSenderId
            : input.igCommenterId;
        if (senderId) {
          const source =
            input.triggerType === 'story_reply' ? 'story_reply' : 'comment';
          const follows = await checkIgFollowStatus(
            integrationId,
            orgId,
            senderId,
            source
          );
          await appendExecutionLog(input.executionId, {
            nodeId,
            nodeType: node.type,
            status: 'follow_check',
            timestamp: new Date().toISOString(),
            error: `source=${source} follows=${follows}`,
          });
          if (!follows) {
            const gateText = interpolateVariables(
              (triggerConfig.followGateMessage as string | undefined) ||
                FOLLOW_GATE_DEFAULT,
              input
            );
            ctx.dmMessages.push(gateText);
            ctx.dmButtonText = undefined;
            ctx.dmButtonUrl = undefined;
            await appendExecutionLog(input.executionId, {
              nodeId,
              nodeType: node.type,
              status: 'completed',
              timestamp: new Date().toISOString(),
              error: 'follow_gate_applied',
            });
            return;
          }
        }
      }
      break;
    }

    case 'CONDITION': {
      const matches = await evaluateCondition(
        node.data || '{}',
        triggerText(input)
      );

      // Find the correct outgoing edge based on match result.
      // Edges without sourceHandle (e.g. from auto-connect) are treated
      // as "match" edges so the flow still works.
      const allOutgoing = edges.filter(
        (e: any) => e.sourceNodeId === nodeId
      );
      const matchEdge =
        allOutgoing.find((e: any) => e.sourceHandle === 'match') ||
        allOutgoing.find((e: any) => !e.sourceHandle);
      const noMatchEdge = allOutgoing.find(
        (e: any) => e.sourceHandle === 'no_match'
      );

      await appendExecutionLog(input.executionId, {
        nodeId,
        nodeType: node.type,
        status: 'completed',
        timestamp: new Date().toISOString(),
        error: matches ? 'branch:match' : 'branch:no_match',
      });

      const nextEdge = matches ? matchEdge : noMatchEdge;
      if (nextEdge) {
        await traverseNode(
          nextEdge.targetNodeId,
          nodes,
          edges,
          input,
          integrationId,
          orgId,
          depth + 1,
          ctx
        );
      }
      return; // Don't fall through to default edge traversal
    }

    case 'REPLY_COMMENT': {
      const config = safeParseJson(node.data);
      const messages = Array.isArray(config.messages) && config.messages.length > 0
        ? config.messages as string[]
        : null;
      const rawMessage = messages
        ? messages[Math.floor(Math.random() * messages.length)]
        : (config.message || config.template || '');
      const message = interpolateVariables(rawMessage, input);
      if (message) {
        await replyToComment(
          integrationId,
          orgId,
          input.igCommentId,
          input.igMediaId,
          message
        );
      }
      break;
    }

    case 'SEND_DM': {
      const config = safeParseJson(node.data);
      const message = interpolateVariables(
        config.message || config.template || '',
        input
      );
      if (message) {
        // Collect message — all DMs are sent as a single private reply at the end.
        ctx.dmMessages.push(message);
      }
      if (config.buttonText && config.buttonUrl) {
        ctx.dmButtonText = config.buttonText;
        ctx.dmButtonUrl = config.buttonUrl;
      }
      break;
    }

    case 'DELAY': {
      const config = safeParseJson(node.data);
      const durationMs = parseDuration(
        config.duration || 0,
        config.unit || 'seconds'
      );
      if (durationMs > 0) {
        await sleep(durationMs);
      }
      break;
    }
  }

  await appendExecutionLog(input.executionId, {
    nodeId,
    nodeType: node.type,
    status: 'completed',
    timestamp: new Date().toISOString(),
  });
  } catch (nodeErr: any) {
    await appendExecutionLog(input.executionId, {
      nodeId,
      nodeType: node.type,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: nodeErr?.message || 'Unknown error',
    });
    throw nodeErr;
  }

  // Follow all outgoing edges (for non-CONDITION nodes)
  const outgoingEdges = edges.filter(
    (e: any) => e.sourceNodeId === nodeId
  );

  for (const edge of outgoingEdges) {
    await traverseNode(
      edge.targetNodeId,
      nodes,
      edges,
      input,
      integrationId,
      orgId,
      depth + 1,
      ctx
    );
  }
}

function safeParseJson(data: string): Record<string, any> {
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Escolhe aleatoriamente uma mensagem do array `messages`, ou cai em
// `message`/`template`. Usado no TRIGGER de follow-gate 2 etapas para
// reaproveitar a mesma logica do no REPLY_COMMENT.
function pickReplyMessage(config: Record<string, any>): string {
  const messages =
    Array.isArray(config.messages) && config.messages.length > 0
      ? (config.messages as string[])
      : null;
  if (messages) {
    return messages[Math.floor(Math.random() * messages.length)];
  }
  return config.message || config.template || '';
}

function triggerText(input: FlowExecutionInput): string {
  return input.messageText || input.commentText || input.reaction || '';
}

function interpolateVariables(
  template: string,
  input: FlowExecutionInput
): string {
  const senderName =
    input.igCommenterName ||
    input.igSenderName ||
    input.igCommenterId ||
    input.igSenderId ||
    '';
  const senderId = input.igCommenterId || input.igSenderId || '';
  const mediaId = input.igMediaId || input.igStoryId || '';
  return template
    .replace(/\{commenter_name\}/g, senderName)
    .replace(/\{commenter_id\}/g, senderId)
    .replace(/\{comment_text\}/g, triggerText(input))
    .replace(/\{media_id\}/g, mediaId);
}

function parseDuration(duration: number, unit: string): number {
  switch (unit) {
    case 'minutes':
      return duration * 60 * 1000;
    case 'hours':
      return duration * 60 * 60 * 1000;
    default:
      return duration * 1000;
  }
}
