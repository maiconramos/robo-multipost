'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

interface ZernioProfile {
  _id: string;
  name: string;
  isDefault: boolean;
}

interface ZernioProfilesResponse {
  profiles: ZernioProfile[];
}

export const useZernioProfiles = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/integrations/zernio/profiles')).json();
  }, []);

  return useSWR<ZernioProfilesResponse>('zernio-profiles', load, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
};
