'use client';

import React, { useCallback, useState } from 'react';
import { useCredentialsList } from '@gitroom/frontend/hooks/use-credentials.hook';
import { ProviderCredentialForm } from '@gitroom/frontend/components/settings/provider-credential-form.component';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import clsx from 'clsx';

const InstagramWebhookConfigurator: React.FC = () => {
  const fetchApi = useFetch();
  const toaster = useToaster();
  const [loading, setLoading] = useState(false);

  const handleConfigure = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(
        '/credentials/facebook/configure-instagram-webhook',
        { method: 'POST' }
      );
      const body = await res.json().catch(() => ({}));
      if (body.ok) {
        toaster.show(
          'Webhook Instagram configurado com sucesso na Meta',
          'success'
        );
      } else {
        toaster.show(
          body.error || 'Falha ao configurar webhook na Meta',
          'warning'
        );
      }
    } catch {
      toaster.show('Erro ao chamar API', 'warning');
    } finally {
      setLoading(false);
    }
  }, [fetchApi, toaster]);

  return (
    <div className="mt-[12px] flex flex-col gap-[8px]">
      <div className="text-[13px] text-customColor18">
        Configura automaticamente a callback URL e o Verify Token do webhook
        Instagram na Meta. Elimina o passo manual no Meta Developer Portal.
      </div>
      <div>
        <Button onClick={handleConfigure} loading={loading}>
          Configurar webhook Instagram na Meta
        </Button>
      </div>
    </div>
  );
};

interface ProviderConfig {
  provider: string;
  label: string;
  fields: { key: string; label: string; placeholder: string }[];
  docsUrl: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: 'facebook',
    label: 'Facebook / Instagram / Threads',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o App ID do Facebook',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o App Secret do Facebook',
      },
    ],
    docsUrl: 'https://developers.facebook.com',
  },
  {
    provider: 'tiktok',
    label: 'TikTok',
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
  },
  {
    provider: 'pinterest',
    label: 'Pinterest',
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
  },
  {
    provider: 'linkedin',
    label: 'LinkedIn',
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
  },
  {
    provider: 'twitter',
    label: 'Twitter / X',
    fields: [
      {
        key: 'clientId',
        label: 'API Key',
        placeholder: 'Cole a API Key do Twitter',
      },
      {
        key: 'clientSecret',
        label: 'API Secret',
        placeholder: 'Cole o API Secret do Twitter',
      },
    ],
    docsUrl: 'https://developer.twitter.com',
  },
  {
    provider: 'youtube',
    label: 'YouTube / Google',
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
  },
  {
    provider: 'reddit',
    label: 'Reddit',
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
  },
  {
    provider: 'discord',
    label: 'Discord',
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
  },
  {
    provider: 'slack',
    label: 'Slack',
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
  },
];

const ProviderCard: React.FC<{
  config: ProviderConfig;
  configured: boolean;
  onMutate: () => void;
}> = ({ config, configured, onMutate }) => {
  const [expanded, setExpanded] = useState(false);

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
            onSaved={onMutate}
            onDeleted={onMutate}
            extraActions={
              config.provider === 'facebook' && configured ? (
                <InstagramWebhookConfigurator />
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
};

export const CredentialsSettingsSection: React.FC = () => {
  const { data, isLoading, mutate } = useCredentialsList();

  const handleMutate = useCallback(() => {
    mutate();
  }, [mutate]);

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
        {PROVIDERS.map((config) => (
          <ProviderCard
            key={config.provider}
            config={config}
            configured={configuredMap.get(config.provider) || false}
            onMutate={handleMutate}
          />
        ))}
      </div>
    </div>
  );
};

export default CredentialsSettingsSection;
