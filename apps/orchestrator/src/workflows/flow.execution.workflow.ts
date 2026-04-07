import { proxyActivities, sleep } from '@temporalio/workflow';
import type { FlowActivity } from '@gitroom/orchestrator/activities/flow.activity';

const {
  getFlowWithNodes,
  replyToComment,
  sendDirectMessage,
  evaluateCondition,
  updateExecution,
  appendExecutionLog,
} = proxyActivities<FlowActivity>({
  startToCloseTimeout: '5 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
    initialInterval: '10 seconds',
  },
});

export interface FlowExecutionInput {
  executionId: string;
  flowId: string;
  igCommentId: string;
  igCommenterId: string;
  igCommenterName?: string;
  igMediaId: string;
  commentText: string;
  integrationId: string;
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

    // Send all collected DM messages as a single private reply.
    // Meta only allows ONE private reply per comment, and recipient:{id}
    // requires advanced access (instagram_manage_messages App Review).
    if (ctx.dmMessages.length > 0) {
      const combinedMessage = ctx.dmMessages.join('\n\n');
      await sendDirectMessage(
        flow.integrationId || input.integrationId,
        flow.organizationId,
        input.igCommenterId,
        combinedMessage,
        input.igCommentId
      );
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
          input.commentText
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
      break;
    }

    case 'CONDITION': {
      const matches = await evaluateCondition(
        node.data || '{}',
        input.commentText
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

function interpolateVariables(
  template: string,
  input: FlowExecutionInput
): string {
  return template
    .replace(/\{commenter_name\}/g, input.igCommenterName || input.igCommenterId)
    .replace(/\{commenter_id\}/g, input.igCommenterId)
    .replace(/\{comment_text\}/g, input.commentText)
    .replace(/\{media_id\}/g, input.igMediaId);
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
