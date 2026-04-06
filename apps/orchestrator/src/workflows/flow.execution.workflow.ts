import { proxyActivities, sleep } from '@temporalio/workflow';
import type { FlowActivity } from '@gitroom/orchestrator/activities/flow.activity';

const {
  getFlowWithNodes,
  replyToComment,
  sendDirectMessage,
  evaluateCondition,
  updateExecution,
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
  igMediaId: string;
  commentText: string;
  integrationId: string;
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

    // Traverse the graph starting from the trigger node
    await traverseNode(
      triggerNode.id,
      flow.nodes,
      flow.edges,
      input,
      flow.integrationId || input.integrationId,
      flow.organizationId,
      0
    );

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
  depth: number
): Promise<void> {
  if (depth > 50) {
    throw new Error('Max traversal depth exceeded');
  }

  const node = nodes.find((n: any) => n.id === nodeId);
  if (!node) return;

  await updateExecution(input.executionId, {
    currentNodeId: nodeId,
  });

  // Execute node based on type
  switch (node.type) {
    case 'TRIGGER':
      // Trigger is the entry point — nothing to execute, just proceed
      break;

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

      const nextEdge = matches ? matchEdge : noMatchEdge;
      if (nextEdge) {
        await traverseNode(
          nextEdge.targetNodeId,
          nodes,
          edges,
          input,
          integrationId,
          orgId,
          depth + 1
        );
      }
      return; // Don't fall through to default edge traversal
    }

    case 'REPLY_COMMENT': {
      const config = safeParseJson(node.data);
      const message = interpolateVariables(
        config.message || config.template || '',
        input
      );
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
        await sendDirectMessage(
          integrationId,
          orgId,
          input.igCommenterId,
          message,
          input.igCommentId
        );
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
      depth + 1
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
    .replace(/\{commenter_name\}/g, input.igCommenterId)
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
