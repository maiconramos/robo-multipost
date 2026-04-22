'use client';

import React, { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface ShareZernioResponse {
  shareZernioWithProfiles: boolean;
}

export const useShareZernioWithProfiles = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/settings/share-zernio-with-profiles')).json();
  }, []);

  return useSWR<ShareZernioResponse>('share-zernio-with-profiles', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const ShareZernioWithProfilesComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading, mutate } = useShareZernioWithProfiles();

  const handleToggle = useCallback(async () => {
    const newValue = !data?.shareZernioWithProfiles;

    mutate({ shareZernioWithProfiles: newValue }, false);

    await fetch('/settings/share-zernio-with-profiles', {
      method: 'POST',
      body: JSON.stringify({ enabled: newValue }),
    });

    mutate({ shareZernioWithProfiles: newValue });
    toaster.show(t('settings_updated', 'Settings updated'), 'success');
  }, [data, fetch, mutate, toaster, t]);

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="mt-[4px]">
        {t('zernio_sharing_settings', 'Zernio Sharing Settings')}
      </div>
      <div className="flex items-center justify-between gap-[24px]">
        <div className="flex flex-col flex-1">
          <div className="text-[14px]">
            {t('share_zernio_with_profiles', 'Share Zernio with Profiles')}
          </div>
          <div className="text-[12px] text-customColor18">
            {t(
              'share_zernio_with_profiles_description',
              'When enabled, profiles without their own Zernio API key will use the default workspace key. When disabled, each profile must configure its own Zernio API key.'
            )}
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            data?.shareZernioWithProfiles ? 'bg-customColor6' : 'bg-customColor18'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              data?.shareZernioWithProfiles ? 'translate-x-[20px]' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

export default ShareZernioWithProfilesComponent;
