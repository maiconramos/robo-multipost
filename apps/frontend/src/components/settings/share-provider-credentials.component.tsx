'use client';

import React, { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface ShareResponse {
  enabled: boolean;
}

// Toggle exibido apenas no perfil Default: compartilha as credenciais OAuth do
// Default com os perfis que nao configuraram as proprias. Espelha o padrao do
// compartilhamento Zernio.
const ShareProviderCredentialsComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();

  const load = useCallback(async () => {
    return (await fetch('/settings/share-provider-credentials')).json();
  }, []);
  const { data, isLoading, mutate } = useSWR<ShareResponse>(
    'share-provider-credentials',
    load,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const handleToggle = useCallback(async () => {
    const newValue = !data?.enabled;
    mutate({ enabled: newValue }, false);
    await fetch('/settings/share-provider-credentials', {
      method: 'POST',
      body: JSON.stringify({ enabled: newValue }),
    });
    mutate({ enabled: newValue });
    toaster.show(t('settings_updated', 'Settings updated'), 'success');
  }, [data, fetch, mutate, toaster, t]);

  if (isLoading) {
    return null;
  }

  return (
    <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="flex items-center justify-between gap-[24px]">
        <div className="flex flex-col flex-1">
          <div className="text-[14px]">
            {t(
              'share_provider_credentials',
              'Compartilhar credenciais com os perfis'
            )}
          </div>
          <div className="text-[12px] text-customColor18">
            {t(
              'share_provider_credentials_description',
              'Quando ligado, perfis sem credenciais próprias usam as credenciais deste perfil (Default). Quando desligado, cada perfil precisa configurar as suas (ou cai nas variáveis de ambiente).'
            )}
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            data?.enabled ? 'bg-customColor6' : 'bg-customColor18'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              data?.enabled ? 'translate-x-[20px]' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

export default ShareProviderCredentialsComponent;
