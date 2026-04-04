'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface KnowledgeDocument {
  id: string;
  profileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  chunkCount: number;
  errorMessage?: string | null;
  createdAt: string;
}

export interface KnowledgeListResponse {
  documents: KnowledgeDocument[];
  enabled: boolean;
}

export const useKnowledgeDocuments = (profileId: string | null) => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    if (!profileId) return { documents: [], enabled: false };
    const res = await fetch(`/settings/profiles/${profileId}/knowledge`, {
      method: 'GET',
    });
    return res.json();
  }, [fetch, profileId]);
  return useSWR<KnowledgeListResponse>(
    profileId ? `knowledge-docs-${profileId}` : null,
    loader,
    {
      refreshInterval: (data) =>
        data?.documents?.some((d) => d.status === 'PROCESSING') ? 2000 : 0,
    }
  );
};
