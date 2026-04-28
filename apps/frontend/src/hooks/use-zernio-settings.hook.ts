'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

interface ZernioUsage {
  planName: string | null;
  uploads: { used: number; limit: number };
  profiles: { used: number; limit: number };
  lastReset: string | null;
}

export interface ZernioSettings {
  configured: boolean;
  usage: ZernioUsage | null;
}

export const useZernioSettings = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/settings/zernio')).json();
  }, []);

  return useSWR<ZernioSettings>('zernio-settings', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};
