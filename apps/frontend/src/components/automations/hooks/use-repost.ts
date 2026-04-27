'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type RepostSourceType = 'INSTAGRAM_STORY' | 'INSTAGRAM_POST';

export type RepostDestinationFormat =
  | 'INSTAGRAM_POST'
  | 'INSTAGRAM_STORY'
  | 'FACEBOOK_REEL'
  | 'TIKTOK_FEED'
  | 'YOUTUBE_SHORT'
  | 'LINKEDIN_POST'
  | 'X_POST'
  | 'THREADS_POST'
  | 'PINTEREST_PIN';

export interface RepostDestination {
  integrationId: string;
  format: RepostDestinationFormat;
}

export interface RepostSourceOption {
  key: string; // `${integrationId}:${sourceType}`
  integrationId: string;
  sourceType: RepostSourceType;
  name: string;
  picture: string | null;
  providerIdentifier: string;
}

export interface RepostChannelOption {
  key: string; // `${integrationId}:${format}`
  integrationId: string;
  format: RepostDestinationFormat;
  name: string;
  picture: string | null;
  providerIdentifier: string;
}

export interface RepostRuleDestinationRow {
  id: string;
  integrationId: string;
  format: RepostDestinationFormat;
  integration?: {
    id: string;
    name: string;
    picture: string | null;
    providerIdentifier: string;
    disabled?: boolean;
  };
}

export interface RepostRule {
  id: string;
  organizationId: string;
  profileId: string;
  name: string;
  enabled: boolean;
  sourceIntegrationId: string;
  sourceType: RepostSourceType;
  destinations: RepostRuleDestinationRow[];
  intervalMinutes: number;
  filterIncludeVideos: boolean;
  filterIncludeImages: boolean;
  filterMaxDurationSeconds: number | null;
  filterHashtag: string | null;
  captionTemplate: string | null;
  lastSourceItemId: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceIntegration?: {
    id: string;
    name: string;
    picture: string | null;
    providerIdentifier: string;
  };
  _count?: { logs: number };
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
  publishedPosts:
    | {
        integrationId: string;
        postId: string;
        format?: RepostDestinationFormat;
        releaseUrl?: string;
        error?: string;
      }[]
    | null;
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
      (await fetchApi(path)).json() as Promise<RepostSourceOption[]>,
    [fetchApi]
  );
  return useSWR('/repost/source-candidates', load);
};

export const useRepostDestinationCandidates = (sourceType?: RepostSourceType | null) => {
  const fetchApi = useFetch();
  const load = useCallback(
    async (path: string) =>
      (await fetchApi(path)).json() as Promise<RepostChannelOption[]>,
    [fetchApi]
  );
  const url = sourceType
    ? `/repost/destination-candidates?sourceType=${sourceType}`
    : '/repost/destination-candidates';
  return useSWR(url, load);
};

export const SOURCE_TYPE_LABEL: Record<RepostSourceType, string> = {
  INSTAGRAM_STORY: 'Story',
  INSTAGRAM_POST: 'Reel/Feed',
};

export const FORMAT_LABEL: Record<RepostDestinationFormat, string> = {
  INSTAGRAM_POST: 'Reel/Feed',
  INSTAGRAM_STORY: 'Story',
  FACEBOOK_REEL: 'Reel',
  TIKTOK_FEED: 'Feed',
  YOUTUBE_SHORT: 'Short',
  LINKEDIN_POST: 'Post',
  X_POST: 'Tweet',
  THREADS_POST: 'Thread',
  PINTEREST_PIN: 'Pin',
};

export interface GroupedSource {
  integrationId: string;
  name: string;
  picture: string | null;
  providerIdentifier: string;
  sourceTypes: RepostSourceType[];
}

export interface GroupedDestination {
  integrationId: string;
  name: string;
  picture: string | null;
  providerIdentifier: string;
  formats: RepostDestinationFormat[];
}

export function groupSources(options: RepostSourceOption[]): GroupedSource[] {
  const byId = new Map<string, GroupedSource>();
  for (const o of options) {
    const existing = byId.get(o.integrationId);
    if (existing) {
      if (!existing.sourceTypes.includes(o.sourceType)) {
        existing.sourceTypes.push(o.sourceType);
      }
    } else {
      byId.set(o.integrationId, {
        integrationId: o.integrationId,
        name: o.name,
        picture: o.picture,
        providerIdentifier: o.providerIdentifier,
        sourceTypes: [o.sourceType],
      });
    }
  }
  return Array.from(byId.values());
}

export function groupDestinations(
  options: RepostChannelOption[]
): GroupedDestination[] {
  const byId = new Map<string, GroupedDestination>();
  for (const o of options) {
    const existing = byId.get(o.integrationId);
    if (existing) {
      if (!existing.formats.includes(o.format)) {
        existing.formats.push(o.format);
      }
    } else {
      byId.set(o.integrationId, {
        integrationId: o.integrationId,
        name: o.name,
        picture: o.picture,
        providerIdentifier: o.providerIdentifier,
        formats: [o.format],
      });
    }
  }
  return Array.from(byId.values());
}
