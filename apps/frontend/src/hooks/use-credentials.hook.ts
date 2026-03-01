'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

export interface CredentialSummary {
  provider: string;
  configured: boolean;
  updatedAt: string;
}

export interface CredentialDetail {
  provider: string;
  data: Record<string, string>;
  updatedAt: string;
}

export const useCredentialsList = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/credentials')).json();
  }, []);

  return useSWR<CredentialSummary[]>('credentials-list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

export const useCredential = (provider: string) => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch(`/credentials/${provider}`)).json();
  }, [provider]);

  return useSWR<CredentialDetail>(
    provider ? `credential-${provider}` : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );
};
