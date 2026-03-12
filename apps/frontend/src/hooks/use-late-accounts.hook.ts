'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

export interface LateAccount {
  _id: string;
  platform: string;
  username: string;
  displayName: string;
  profileUrl: string;
  isActive: boolean;
}

interface LateAccountsResponse {
  accounts: LateAccount[];
}

export const useLateAccounts = (lateProfileId: string | null) => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    if (!lateProfileId) return { accounts: [] };
    return (
      await fetch(`/integrations/late/accounts?profileId=${lateProfileId}`)
    ).json();
  }, [lateProfileId]);

  return useSWR<LateAccountsResponse>(
    lateProfileId ? `late-accounts-${lateProfileId}` : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  );
};
