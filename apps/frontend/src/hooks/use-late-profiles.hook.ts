'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

interface LateProfile {
  _id: string;
  name: string;
  isDefault: boolean;
}

interface LateProfilesResponse {
  profiles: LateProfile[];
}

export const useLateProfiles = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/integrations/late/profiles')).json();
  }, []);

  return useSWR<LateProfilesResponse>('late-profiles', load, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
};
