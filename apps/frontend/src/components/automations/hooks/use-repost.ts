'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface RepostChannelCandidate {
  id: string;
  name: string;
  picture: string | null;
  providerIdentifier: string;
}

export interface RepostRule {
  id: string;
  organizationId: string;
  profileId: string;
  name: string;
  enabled: boolean;
  sourceIntegrationId: string;
  sourceType: 'INSTAGRAM_STORY';
  destinationIntegrationIds: string[];
  intervalMinutes: number;
  filterIncludeVideos: boolean;
  filterIncludeImages: boolean;
  filterMaxDurationSeconds: number | null;
  captionTemplate: string | null;
  lastSourceItemId: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepostLogRow {
  id: string;
  ruleId: string;
  sourceItemId: string;
  mediaType: string;
  mediaUrlOriginal: string;
  storedMediaId: string | null;
  status:
    | 'PENDING'
    | 'DOWNLOADED'
    | 'PUBLISHED'
    | 'PARTIAL'
    | 'SKIPPED'
    | 'FAILED';
  skippedReason: string | null;
  errorMessage: string | null;
  publishedPosts: {
    integrationId: string;
    postId: string;
    releaseUrl?: string;
    error?: string;
  }[] | null;
  discoveredAt: string;
  processedAt: string | null;
}

export const useRepostRules = () => {
  const fetchApi = useFetch();
  const load = useCallback(
    async (path: string) => (await fetchApi(path)).json() as Promise<RepostRule[]>,
    [fetchApi]
  );
  return useSWR('/repost/rules', load);
};

export const useRepostRule = (id: string | null) => {
  const fetchApi = useFetch();
  const load = useCallback(
    async (path: string) => (await fetchApi(path)).json() as Promise<RepostRule>,
    [fetchApi]
  );
  return useSWR(id ? `/repost/rules/${id}` : null, load);
};

export const useRepostLogs = (id: string | null, page = 1, size = 20) => {
  const fetchApi = useFetch();
  const load = useCallback(
    async (path: string) =>
      (await fetchApi(path)).json() as Promise<{
        rows: RepostLogRow[];
        total: number;
        page: number;
        size: number;
      }>,
    [fetchApi]
  );
  return useSWR(
    id ? `/repost/rules/${id}/logs?page=${page}&size=${size}` : null,
    load
  );
};

export const useRepostSourceCandidates = () => {
  const fetchApi = useFetch();
  const load = useCallback(
    async (path: string) =>
      (await fetchApi(path)).json() as Promise<RepostChannelCandidate[]>,
    [fetchApi]
  );
  return useSWR('/repost/source-candidates', load);
};

export const useRepostDestinationCandidates = () => {
  const fetchApi = useFetch();
  const load = useCallback(
    async (path: string) =>
      (await fetchApi(path)).json() as Promise<RepostChannelCandidate[]>,
    [fetchApi]
  );
  return useSWR('/repost/destination-candidates', load);
};
