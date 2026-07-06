'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Select } from '@gitroom/react/form/select';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type WorkspaceLanguage = 'pt' | 'en';

interface LanguageResponse {
  language: WorkspaceLanguage;
}

export const useLanguagePreference = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/settings/language')).json();
  }, []);

  return useSWR<LanguageResponse>('language-preference', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const LanguagePreferenceComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading, mutate } = useLanguagePreference();

  const [localValue, setLocalValue] = useState<WorkspaceLanguage>('pt');

  useEffect(() => {
    if (data?.language) {
      setLocalValue(data.language);
    }
  }, [data]);

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = event.target.value as WorkspaceLanguage;

      setLocalValue(newValue);

      await fetch('/settings/language', {
        method: 'POST',
        body: JSON.stringify({ language: newValue }),
      });

      mutate({ language: newValue });
      toaster.show(t('settings_updated', 'Settings updated'), 'success');
    },
    [fetch, mutate, toaster, t]
  );

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
        {t('settings_language_title', 'Language')}
      </div>
      <div className="flex items-center justify-between gap-[24px]">
        <div className="flex flex-col flex-1">
          <div className="text-[14px]">
            {t('settings_language_label', 'Workspace language')}
          </div>
          <div className="text-[12px] text-customColor18">
            {t(
              'settings_language_description',
              'Sets the language of the emails and notifications sent by this workspace.'
            )}
          </div>
        </div>
        <div className="w-[200px]">
          <Select
            name="language"
            label=""
            disableForm={true}
            hideErrors={true}
            value={localValue}
            onChange={handleChange}
          >
            <option value="pt">
              {t('settings_language_pt', 'Portuguese')}
            </option>
            <option value="en">{t('settings_language_en', 'English')}</option>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default LanguagePreferenceComponent;
