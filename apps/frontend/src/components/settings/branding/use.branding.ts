'use client';

import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { BrandingData } from '@gitroom/frontend/components/layout/dynamic.branding.provider';

export interface BrandingResponse {
  branding: BrandingData | null;
}

export const useBranding = () => {
  const fetch = useFetch();
  return useSWR<BrandingResponse>('/branding', async () => {
    const res = await fetch('/branding');
    if (!res.ok) return { branding: null };
    return res.json();
  });
};
