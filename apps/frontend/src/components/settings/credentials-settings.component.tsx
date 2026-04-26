'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useCredentialsList } from '@gitroom/frontend/hooks/use-credentials.hook';
import { useZernioSettings } from '@gitroom/frontend/hooks/use-zernio-settings.hook';
import { ProviderCredentialForm } from '@gitroom/frontend/components/settings/provider-credential-form.component';
import { MetaCredentialsCard } from '@gitroom/frontend/components/settings/meta-credentials.component';
import { ZernioCredentialsCard } from '@gitroom/frontend/components/settings/zernio-settings.component';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import clsx from 'clsx';

interface ProviderConfig {
  provider: string;
  label: string;
  iconUrl: string;
  fields: { key: string; label: string; placeholder: string }[];
  docsUrl: string;
  callbackPath?: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: 'tiktok',
    label: 'TikTok',
    iconUrl: '/icons/platforms/tiktok.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client Key',
        placeholder: 'Cole o Client Key do TikTok',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do TikTok',
      },
    ],
    docsUrl: 'https://developers.tiktok.com',
    callbackPath: '/integrations/social/tiktok',
  },
  {
    provider: 'pinterest',
    label: 'Pinterest',
    iconUrl: '/icons/platforms/pinterest.png',
    fields: [
      {
        key: 'clientId',
        label: 'App ID',
        placeholder: 'Cole o App ID do Pinterest',
      },
      {
        key: 'clientSecret',
        label: 'App Secret',
        placeholder: 'Cole o App Secret do Pinterest',
      },
    ],
    docsUrl: 'https://developers.pinterest.com',
    callbackPath: '/integrations/social/pinterest',
  },
  {
    provider: 'linkedin',
    label: 'LinkedIn',
    iconUrl: '/icons/platforms/linkedin.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do LinkedIn',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do LinkedIn',
      },
    ],
    docsUrl: 'https://www.linkedin.com/developers',
    callbackPath: '/integrations/social/linkedin',
  },
  {
    provider: 'twitter',
    label: 'Twitter / X',
    iconUrl: '/icons/platforms/x.png',
    fields: [
      {
        key: 'clientId',
        label: 'Consumer Key',
        placeholder: 'Cole a Consumer Key do X',
      },
      {
        key: 'clientSecret',
        label: 'Access Token',
        placeholder: 'Cole o Access Token do X',
      },
    ],
    docsUrl: 'https://developer.twitter.com',
    callbackPath: '/integrations/social/x',
  },
  {
    provider: 'youtube',
    label: 'YouTube / Google',
    iconUrl: '/icons/platforms/youtube.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do Google',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do Google',
      },
    ],
    docsUrl: 'https://console.cloud.google.com',
    callbackPath: '/integrations/social/youtube',
  },
  {
    provider: 'reddit',
    label: 'Reddit',
    iconUrl: '/icons/platforms/reddit.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do Reddit',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do Reddit',
      },
    ],
    docsUrl: 'https://www.reddit.com/prefs/apps',
    callbackPath: '/integrations/social/reddit',
  },
  {
    provider: 'discord',
    label: 'Discord',
    iconUrl: '/icons/platforms/discord.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do Discord',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do Discord',
      },
      {
        key: 'botToken',
        label: 'Bot Token',
        placeholder: 'Cole o Bot Token do Discord',
      },
    ],
    docsUrl: 'https://discord.com/developers',
    callbackPath: '/integrations/social/discord',
  },
  {
    provider: 'slack',
    label: 'Slack',
    iconUrl: '/icons/platforms/slack.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do Slack',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do Slack',
      },
      {
        key: 'signingSecret',
        label: 'Signing Secret',
        placeholder: 'Cole o Signing Secret do Slack',
      },
    ],
    docsUrl: 'https://api.slack.com',
    callbackPath: '/integrations/social/slack',
  },
];

const ProviderCard: React.FC<{
  config: ProviderConfig;
  configured: boolean;
  onMutate: () => void;
}> = ({ config, configured, onMutate }) => {
  const [expanded, setExpanded] = useState(false);
  const { frontEndUrl } = useVariables();

  const callbackUrl = useMemo(() => {
    if (!config.callbackPath) return undefined;
    const base =
      frontEndUrl ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    if (!base) return undefined;
    return `${base.replace(/\/$/, '')}${config.callbackPath}`;
  }, [frontEndUrl, config.callbackPath]);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="bg-sixth border-fifth border rounded-[4px] overflow-hidden">
      <div
        className="flex items-center justify-between p-[16px] cursor-pointer hover:bg-boxHover transition-colors"
        onClick={toggle}
      >
        <div className="flex items-center gap-[12px]">
          <img
            src={config.iconUrl}
            alt={config.label}
            className="w-[24px] h-[24px] object-contain"
          />
          <div className="text-[15px] font-[500]">{config.label}</div>
          {configured ? (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-customColor42/20 text-customColor42 px-[10px] py-[2px] text-[12px]">
              <span className="w-[6px] h-[6px] rounded-full bg-customColor42 inline-block" />
              Configurado
            </span>
          ) : (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-fifth px-[10px] py-[2px] text-[12px] text-customColor18">
              Usando variável de ambiente
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={clsx(
            'transition-transform',
            expanded && 'rotate-180'
          )}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {expanded && (
        <div className="border-t border-fifth p-[16px]">
          <ProviderCredentialForm
            provider={config.provider}
            fields={config.fields}
            label={config.label}
            docsUrl={config.docsUrl}
            callbackUrl={callbackUrl}
            onSaved={onMutate}
            onDeleted={onMutate}
          />
        </div>
      )}
    </div>
  );
};

export const CredentialsSettingsSection: React.FC = () => {
  const { data, isLoading, mutate } = useCredentialsList();
  const { data: zernio, mutate: mutateZernio } = useZernioSettings();

  const handleMutate = useCallback(() => {
    mutate();
    mutateZernio();
  }, [mutate, mutateZernio]);

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">Carregando...</div>
      </div>
    );
  }

  const configuredMap = new Map(
    (data || []).map((c) => [c.provider, c.configured])
  );

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">Credenciais de Apps</h3>
      <div className="text-customColor18 mt-[4px]">
        Configure as credenciais OAuth de cada rede social para seu workspace.
        Isso permite que cada workspace use seus próprios apps em vez das
        variáveis de ambiente globais.
      </div>
      <div className="my-[16px] mt-[16px] flex flex-col gap-[8px]">
        <MetaCredentialsCard
          configured={configuredMap.get('facebook') || false}
          onMutate={handleMutate}
        />
        {PROVIDERS.map((config) => (
          <ProviderCard
            key={config.provider}
            config={config}
            configured={configuredMap.get(config.provider) || false}
            onMutate={handleMutate}
          />
        ))}
        <ZernioCredentialsCard
          configured={zernio?.configured ?? false}
          onMutate={handleMutate}
        />
      </div>
    </div>
  );
};

export default CredentialsSettingsSection;
