'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useCredentialsList } from '@gitroom/frontend/hooks/use-credentials.hook';
import { ProviderCredentialForm } from '@gitroom/frontend/components/settings/provider-credential-form.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';

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

const WebhookConfigSection: React.FC = () => {
  const t = useT();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const [webhookConfig, setWebhookConfig] = useState<{
    callbackUrl: string;
    verifyToken: string;
  } | null>(null);

  useEffect(() => {
    fetchApi('/flows/webhook-config')
      .then((r) => r.json())
      .then((data) => {
        const origin =
          typeof window !== 'undefined' ? window.location.origin : '';
        const url = data.callbackUrl.startsWith('http')
          ? data.callbackUrl
          : `${origin}${data.callbackUrl}`;
        setWebhookConfig({ callbackUrl: url, verifyToken: data.verifyToken });
      })
      .catch(() => {
        // non-critical
      });
  }, [fetchApi]);

  const copyToClipboard = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        toaster.show(
          t('copied_to_clipboard', 'Copiado para a area de transferencia'),
          'success'
        );
      });
    },
    [toaster, t]
  );

  if (!webhookConfig) return null;

  return (
    <div className="mt-[16px] border-t border-fifth pt-[16px] flex flex-col gap-[12px]">
      <div className="text-[13px] font-semibold text-textColor">
        {t('webhook_config_title', 'Configuracao do webhook Instagram')}
      </div>
      <p className="text-[12px] text-customColor18">
        {t(
          'webhook_config_instructions',
          'Cole estes valores no Meta Developer Portal > Produtos > Webhooks > Instagram:'
        )}
      </p>
      <div className="flex flex-col gap-[8px]">
        <div className="flex flex-col gap-[4px]">
          <span className="text-[11px] text-customColor18">
            {t('callback_url', 'Callback URL')}
          </span>
          <div className="flex items-center gap-[8px] bg-newBgColorInner border border-newTableBorder rounded-[4px] px-[12px] py-[8px]">
            <code className="text-[12px] text-textColor flex-1 truncate">
              {webhookConfig.callbackUrl}
            </code>
            <button
              onClick={() => copyToClipboard(webhookConfig.callbackUrl)}
              className="text-[11px] text-btnPrimary hover:opacity-80"
            >
              {t('copy', 'Copiar')}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-[4px]">
          <span className="text-[11px] text-customColor18">
            {t('verify_token', 'Verify Token')}
          </span>
          <div className="flex items-center gap-[8px] bg-newBgColorInner border border-newTableBorder rounded-[4px] px-[12px] py-[8px]">
            <code className="text-[12px] text-textColor flex-1">
              {webhookConfig.verifyToken}
            </code>
            <button
              onClick={() => copyToClipboard(webhookConfig.verifyToken)}
              className="text-[11px] text-btnPrimary hover:opacity-80"
            >
              {t('copy', 'Copiar')}
            </button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-customColor18">
        {t(
          'webhook_subscribed_fields',
          'Campos assinados: comments, messages'
        )}
      </p>
    </div>
  );
};

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
          />
          {config.provider === 'facebook' && <WebhookConfigSection />}
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
