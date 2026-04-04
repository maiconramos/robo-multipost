'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export const useFlows = () => {
  const fetch = useFetch();
  const load = useCallback(
    async (path: string) => {
      return await (await fetch(path)).json();
    },
    [fetch]
  );

  return useSWR('/flows', load);
};

export const useFlow = (id: string) => {
  const fetch = useFetch();
  const load = useCallback(
    async (path: string) => {
      return await (await fetch(path)).json();
    },
    [fetch]
  );

  return useSWR(`/flows/${id}`, load);
};

export const useFlowExecutions = (id: string) => {
  const fetch = useFetch();
  const load = useCallback(
    async (path: string) => {
      return await (await fetch(path)).json();
    },
    [fetch]
  );

  return useSWR(`/flows/${id}/executions`, load);
};
