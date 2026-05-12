'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type UnmatchedStatus = 'PENDING' | 'BOUND' | 'IGNORED';

export interface UnmatchedCommentItem {
  id: string;
  integrationId: string;
  igMediaId: string;
  igCommentId: string;
  igCommenterId: string;
  igCommenterName?: string | null;
  commentText: string;
  status: UnmatchedStatus;
  permalink?: string | null;
  caption?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
  isAd?: boolean | null;
  enrichedAt?: string | null;
  enrichmentError?: string | null;
  boundFlowId?: string | null;
  boundAt?: string | null;
  ignoredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxResponse {
  items: UnmatchedCommentItem[];
  total: number;
  page: number;
  limit: number;
}

export interface FlowMediaAliasItem {
  id: string;
  flowId: string;
  integrationId: string;
  aliasMediaId: string;
  source: 'MANUAL' | 'WEBHOOK_INBOX';
  note?: string | null;
  boundBy?: string | null;
  boundAt: string;
  createdAt: string;
  updatedAt: string;
  // Metadata enriquecida no backend (cache Redis + Graph API). Pode ser
  // null quando o host nao suporta o campo ou a chamada falhou.
  permalink?: string | null;
  thumbnailUrl?: string | null;
  caption?: string | null;
  mediaType?: string | null;
  isAd?: boolean | null;
}

export interface AliasLookupItem {
  id: string;
  flowId: string;
  flow: { id: string; name: string };
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    usp.set(key, String(value));
  }
  const str = usp.toString();
  return str ? `?${str}` : '';
};

export const useInbox = (
  integrationId: string | null,
  status: UnmatchedStatus = 'PENDING',
  page = 1,
  limit = 20
) => {
  const fetchApi = useFetch();
  const key = integrationId
    ? `/automations/inbox${buildQuery({ integrationId, status, page, limit })}`
    : null;
  const load = useCallback(
    async (path: string): Promise<InboxResponse> => {
      const res = await fetchApi(path);
      return res.json();
    },
    [fetchApi]
  );
  return useSWR<InboxResponse>(key, load);
};

export const useAliases = (flowId: string | null) => {
  const fetchApi = useFetch();
  const key = flowId
    ? `/automations/aliases${buildQuery({ flowId })}`
    : null;
  const load = useCallback(
    async (path: string): Promise<FlowMediaAliasItem[]> => {
      const res = await fetchApi(path);
      return res.json();
    },
    [fetchApi]
  );
  return useSWR<FlowMediaAliasItem[]>(key, load);
};

export const useAliasLookup = (
  integrationId: string | null,
  aliasMediaId: string | null
) => {
  const fetchApi = useFetch();
  const key =
    integrationId && aliasMediaId
      ? `/automations/aliases/lookup${buildQuery({
          integrationId,
          aliasMediaId,
        })}`
      : null;
  const load = useCallback(
    async (path: string): Promise<AliasLookupItem[]> => {
      const res = await fetchApi(path);
      return res.json();
    },
    [fetchApi]
  );
  return useSWR<AliasLookupItem[]>(key, load);
};

/**
 * Helper de mutacoes — recebe os `mutate` por parametro para evitar violacao
 * de rules-of-hooks. Caller usa `useInbox`/`useAliases` no componente e
 * passa o mutate retornado.
 */
export const createInboxActions = (
  fetchApi: ReturnType<typeof useFetch>,
  mutators: {
    mutateInbox?: () => Promise<unknown>;
    mutateAliases?: () => Promise<unknown>;
  } = {}
) => {
  const bind = async (unmatchedCommentId: string, flowId: string) => {
    const res = await fetchApi('/automations/inbox/bind', {
      method: 'POST',
      body: JSON.stringify({ unmatchedCommentId, flowId }),
    });
    const data = await res.json();
    await mutators.mutateInbox?.();
    await mutators.mutateAliases?.();
    return data;
  };

  const ignore = async (unmatchedCommentId: string, reason?: string) => {
    const res = await fetchApi('/automations/inbox/ignore', {
      method: 'POST',
      body: JSON.stringify({ unmatchedCommentId, reason }),
    });
    const data = await res.json();
    await mutators.mutateInbox?.();
    return data;
  };

  const createAlias = async (flowId: string, aliasMediaId: string) => {
    const res = await fetchApi('/automations/aliases', {
      method: 'POST',
      body: JSON.stringify({ flowId, aliasMediaId }),
    });
    const data = await res.json();
    await mutators.mutateAliases?.();
    return data;
  };

  const deleteAlias = async (aliasId: string) => {
    const res = await fetchApi(`/automations/aliases/${aliasId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    await mutators.mutateAliases?.();
    return data;
  };

  return { bind, ignore, createAlias, deleteAlias };
};
