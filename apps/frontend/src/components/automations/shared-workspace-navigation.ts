'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
export type WorkspaceMode = 'quick' | 'flow' | 'history';
export type WorkspaceNavigation = {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  quickDisabled?: boolean;
  flowDisabled?: boolean;
  flowDisabledReason?: string;
  historyDisabled?: boolean;
  error?: string | null;
  readOnly?: boolean;
  switching?: boolean;
  onEditorState?: (state: { dirty: boolean; busy: boolean }) => void;
};
export function readWorkspaceMode(params: {
  get: (key: string) => string | null;
}): WorkspaceMode | undefined {
  const mode = params.get('view');
  if (mode === 'quick' || mode === 'flow' || mode === 'history') return mode;
  if (params.get('tab') === 'history') return 'history';
  return undefined;
}
export function useWorkspaceMode(
  fallback: WorkspaceMode,
  allow?: (mode: WorkspaceMode) => boolean | Promise<boolean>,
  onCommit?: (mode: WorkspaceMode) => void
) {
  const params = useSearchParams();
  const requested = readWorkspaceMode(params);
  const [mode, setMode] = useState<WorkspaceMode>(requested ?? fallback);
  const current = useRef(mode);
  const permit = useRef(allow);
  permit.current = allow;
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const sequence = useRef(0);
  const write = useCallback((next: WorkspaceMode, replace: boolean) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('tab');
    url.searchParams.set('view', next);
    window.history[replace ? 'replaceState' : 'pushState'](
      null,
      '',
      url.pathname + url.search + url.hash
    );
  }, []);
  const select = useCallback(
    async (next: WorkspaceMode, external = false) => {
      const ticket = ++sequence.current;
      if (next === current.current) return;
      const allowed = (await permit.current?.(next)) ?? true;
      if (ticket !== sequence.current) return;
      if (!allowed) {
        write(current.current, true);
        return;
      }
      commit.current?.(next);
      current.current = next;
      setMode(next);
      if (!external) write(next, false);
    },
    [write]
  );
  useEffect(() => {
    if (requested) void select(requested, true);
  }, [requested, select]);
  useEffect(() => {
    const pop = (): void =>
      void select(
        readWorkspaceMode(new URLSearchParams(window.location.search)) ??
          fallback,
        true
      );
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [fallback, select]);
  return {
    mode,
    onModeChange: (next: WorkspaceMode) => {
      void select(next);
    },
  };
}
const fields: Record<string, Set<string>> = {
  TRIGGER: new Set([
    'triggerType',
    'mode',
    'postIds',
    'storyIds',
    'scheduledPostId',
    'keywords',
    'matchMode',
    'matchReactions',
    'requireFollow',
    'followGateMessage',
    'openingDmMessage',
    'openingDmButtonText',
    'alreadyFollowedButtonText',
    'gateExhaustedMessage',
    'maxGateAttempts',
  ]),
  REPLY_COMMENT: new Set(['message', 'messages']),
  SEND_DM: new Set([
    'variants',
    'message',
    'messages',
    'buttonText',
    'buttonUrl',
  ]),
};
// A quick save rebuilds the linear graph. Reject anything it cannot represent.
export function legacyQuickCompatible(flow: any): boolean {
  if (!Array.isArray(flow?.nodes) || !Array.isArray(flow?.edges)) return false;
  const nodes = flow.nodes;
  if (!nodes.length) return flow.edges.length === 0; // Prepared, empty draft.
  if (nodes.filter((n: any) => n.type === 'TRIGGER').length !== 1) return false;
  const types = new Set<string>();
  for (const node of nodes) {
    if (!fields[node.type] || types.has(node.type)) return false;
    types.add(node.type);
    try {
      const config =
        typeof node.data === 'string'
          ? JSON.parse(node.data || '{}')
          : node.data ?? {};
      if (!config || Array.isArray(config) || typeof config !== 'object')
        return false;
      if (Object.keys(config).some((key) => !fields[node.type].has(key)))
        return false;
      if (node.type === 'TRIGGER') {
        if (
          config.triggerType &&
          !['comment_on_post', 'story_reply'].includes(config.triggerType)
        )
          return false;
        if (
          config.mode &&
          !['all', 'specific', 'scheduled', 'next_publication'].includes(
            config.mode
          )
        )
          return false;
        if (
          (config.triggerType === 'story_reply' ||
            node.label === 'story_reply') &&
          (types.has('REPLY_COMMENT') ||
            config.matchMode === 'all' ||
            (config.keywords?.length && config.matchReactions !== false) ||
            (config.matchReactions === false && !config.keywords?.length))
        )
          return false;
      }
    } catch {
      return false;
    }
  }
  const trigger = nodes.find((n: any) => n.type === 'TRIGGER');
  const config =
    typeof trigger.data === 'string'
      ? JSON.parse(trigger.data || '{}')
      : trigger.data ?? {};
  if (
    (config.triggerType === 'story_reply' || trigger.label === 'story_reply') &&
    types.has('REPLY_COMMENT')
  )
    return false;
  const expected = [
    trigger,
    nodes.find((n: any) => n.type === 'REPLY_COMMENT'),
    nodes.find((n: any) => n.type === 'SEND_DM'),
  ].filter(Boolean);
  return (
    flow.edges.length === expected.length - 1 &&
    expected
      .slice(1)
      .every((node: any, index: number) =>
        flow.edges.some(
          (edge: any) =>
            edge.sourceNodeId === expected[index].id &&
            edge.targetNodeId === node.id &&
            !edge.sourceHandle
        )
      )
  );
}
