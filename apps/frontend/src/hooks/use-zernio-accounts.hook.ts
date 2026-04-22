'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

export interface ZernioAccount {
  _id: string;
  platform: string;
  username: string;
  displayName: string;
  profileUrl: string;
  isActive: boolean;
}

interface ZernioAccountsResponse {
  accounts: ZernioAccount[];
}

export const useZernioAccounts = (zernioProfileId: string | null) => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    if (!zernioProfileId) return { accounts: [] };
    return (
      await fetch(`/integrations/zernio/accounts?profileId=${zernioProfileId}`)
    ).json();
  }, [zernioProfileId]);

  return useSWR<ZernioAccountsResponse>(
    zernioProfileId ? `zernio-accounts-${zernioProfileId}` : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  );
};
