'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

interface LateUsage {
  planName: string | null;
  uploads: { used: number; limit: number };
  profiles: { used: number; limit: number };
  lastReset: string | null;
}

export interface LateSettings {
  configured: boolean;
  usage: LateUsage | null;
}

export const useLateSettings = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/settings/late')).json();
  }, []);

  return useSWR<LateSettings>('late-settings', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};
