'use client';

import React, { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCredential } from '@gitroom/frontend/hooks/use-credentials.hook';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const PROVIDER = 'facebook';
const SENTINEL = '__REDACTED__';
const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
const DEFAULT_VERIFY_TOKEN = 'multipost';

type FieldKey =
  | 'clientId'
  | 'clientSecret'
  | 'instagramAppId'
  | 'instagramAppSecret'
  | 'webhookVerifyToken'
  | 'threadsAppId'
  | 'threadsAppSecret';

const ALL_FIELDS: FieldKey[] = [
  'clientId',
  'clientSecret',
  'instagramAppId',
  'instagramAppSecret',
  'webhookVerifyToken',
  'threadsAppId',
  'threadsAppSecret',
];

interface Props {
  configured: boolean;
  onMutate: () => void;
}

const LabeledInput: React.FC<{
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onCopy?: () => void;
}> = ({ label, placeholder, value, onChange, onCopy }) => (
  <div className="flex flex-col gap-[6px]">
    <div className="text-[13px] text-customColor18">{label}</div>
    <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor placeholder-textColor flex items-center">
      <input
        className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px] min-w-0"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="text-[11px] text-btnPrimary hover:opacity-80 px-[12px] whitespace-nowrap"
        >
          Copiar
        </button>
      )}
    </div>
  </div>
);

const ReadOnlyRow: React.FC<{ label: string; value?: string }> = ({
  label,
  value,
}) => (
  <div className="flex flex-col gap-[4px]">
    <div className="text-[13px] text-customColor18">{label}</div>
    <div className="text-[14px]">{value ?? MASK}</div>
  </div>
);

const ProductSection: React.FC<{
  iconUrl: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ iconUrl, title, description, children }) => (
  <div className="flex flex-col gap-[12px] bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[16px]">
    <div className="flex items-center gap-[10px]">
      <img src={iconUrl} alt={title} className="w-[22px] h-[22px] object-contain" />
      <div className="flex flex-col gap-[2px]">
        <div className="text-[14px] font-[600] text-textColor">{title}</div>
        {description && (
          <div className="text-[12px] text-customColor18">{description}</div>
        )}
      </div>
    </div>
    {children}
  </div>
);

const CopyRow: React.FC<{ label: string; value: string; onCopy: () => void }> = ({
  label,
  value,
  onCopy,
}) => (
  <div className="flex flex-col gap-[4px]">
    <span className="text-[11px] text-customColor18">{label}</span>
    <div className="flex items-center gap-[8px] bg-sixth border border-newTableBorder rounded-[4px] px-[12px] py-[8px]">
      <code className="text-[12px] text-textColor flex-1 truncate">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="text-[11px] text-btnPrimary hover:opacity-80"
      >
        Copiar
      </button>
    </div>
  </div>
);

export const MetaCredentialsCard: React.FC<Props> = ({
  configured,
  onMutate,
}) => {
  const t = useT();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const decision = useDecisionModal();
  const { data, isLoading, mutate } = useCredential(PROVIDER);

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [callbackUrl, setCallbackUrl] = useState<string>('');

  useEffect(() => {
    fetchApi('/flows/webhook-config')
      .then((r) => r.json())
      .then((d) => {
        const origin =
          typeof window !== 'undefined' ? window.location.origin : '';
        const url = d.callbackUrl.startsWith('http')
          ? d.callbackUrl
          : `${origin}${d.callbackUrl}`;
        setCallbackUrl(url);
      })
      .catch(() => {});
  }, [fetchApi]);

  useEffect(() => {
    if (editing && configured) {
      const initial: Record<string, string> = {};
      for (const key of ALL_FIELDS) initial[key] = '';
      // Verify Token sempre pre-preenchido com default quando o usuário edita
      initial.webhookVerifyToken = DEFAULT_VERIFY_TOKEN;
      setFormValues(initial);
    } else if (!configured) {
      // Primeira configuração: também pre-popular o verify token
      setFormValues((prev) => ({
        ...prev,
        webhookVerifyToken: prev.webhookVerifyToken || DEFAULT_VERIFY_TOKEN,
      }));
    }
  }, [editing, configured]);

  const handleField = useCallback((key: FieldKey, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const body: Record<string, string> = {};
      for (const key of ALL_FIELDS) {
        const value = formValues[key];
        if (configured && (!value || value === '')) {
          body[key] = SENTINEL;
        } else {
          body[key] = value || '';
        }
      }
      const method = configured ? 'PATCH' : 'POST';
      const res = await fetchApi(`/credentials/${PROVIDER}`, {
        method,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await mutate();
        onMutate();
        setEditing(false);
        setFormValues({});
        toaster.show(
          t('credentials_saved', 'Credenciais salvas com sucesso'),
          'success'
        );
      } else {
        toaster.show(
          t('credentials_save_error', 'Erro ao salvar credenciais'),
          'warning'
        );
      }
    } finally {
      setSaving(false);
    }
  }, [formValues, configured, fetchApi, mutate, onMutate, toaster, t]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchApi(`/credentials/${PROVIDER}/test`, {
        method: 'POST',
      });
      const result = await res.json().catch(() => ({
        ok: false,
        error: `HTTP ${res.status}`,
      }));
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        error: t('connection_test_error', 'Erro ao testar conexão'),
      });
    } finally {
      setTesting(false);
    }
  }, [fetchApi, t]);

  const handleDelete = useCallback(async () => {
    const approved = await decision.open({
      title: t('credentials_delete_title', 'Remover credenciais?'),
      description: t(
        'meta_credentials_delete_description',
        'Isso irá remover todas as credenciais Meta (Facebook, Instagram e Threads). A plataforma usará as variáveis de ambiente como fallback.'
      ),
      approveLabel: t('credentials_delete_approve', 'Sim, remover'),
      cancelLabel: t('credentials_delete_cancel', 'Cancelar'),
    });
    if (!approved) return;
    const res = await fetchApi(`/credentials/${PROVIDER}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await mutate();
      onMutate();
      setEditing(false);
      setTestResult(null);
      toaster.show(
        t('credentials_removed', 'Credenciais removidas'),
        'success'
      );
    } else {
      toaster.show(
        t('credentials_remove_error', 'Erro ao remover credenciais'),
        'warning'
      );
    }
  }, [fetchApi, mutate, onMutate, decision, toaster, t]);

  const copyToClipboard = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        toaster.show(
          t('copied_to_clipboard', 'Copiado para a área de transferência'),
          'success'
        );
      });
    },
    [toaster, t]
  );

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const showForm = !configured || editing;
  const verifyTokenValue =
    formValues.webhookVerifyToken || DEFAULT_VERIFY_TOKEN;

  return (
    <div className="bg-sixth border-fifth border rounded-[4px] overflow-hidden">
      <div
        className="flex items-center justify-between p-[16px] cursor-pointer hover:bg-boxHover transition-colors"
        onClick={toggle}
      >
        <div className="flex items-center gap-[12px]">
          <img
            src="/icons/platforms/meta.svg"
            alt="Meta"
            className="w-[28px] h-[20px] object-contain"
          />
          <div className="text-[15px] font-[500]">Meta</div>
          <div className="text-[12px] text-customColor18">
            {t('meta_products_label', 'Facebook · Instagram · Threads')}
          </div>
          {configured ? (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-customColor42/20 text-customColor42 px-[10px] py-[2px] text-[12px]">
              <span className="w-[6px] h-[6px] rounded-full bg-customColor42 inline-block" />
              {t('configured', 'Configurado')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-fifth px-[10px] py-[2px] text-[12px] text-customColor18">
              {t('using_env_var', 'Usando variável de ambiente')}
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={clsx('transition-transform', expanded && 'rotate-180')}
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
        <div className="border-t border-fifth p-[16px] flex flex-col gap-[16px]">
          {isLoading ? (
            <div className="animate-pulse text-customColor18">
              {t('loading', 'Carregando...')}
            </div>
          ) : !showForm ? (
            <>
              <ProductSection
                iconUrl="/icons/platforms/facebook.png"
                title={t('meta_product_facebook', 'Facebook')}
                description={t(
                  'meta_product_facebook_desc',
                  'Utilizando em OAuth de páginas do Facebook e Instagram'
                )}
              >
                <div className="grid grid-cols-2 gap-[12px]">
                  <ReadOnlyRow
                    label={t('meta_facebook_app_id', 'Facebook App ID')}
                  />
                  <ReadOnlyRow
                    label={t(
                      'meta_facebook_app_secret',
                      'Facebook App Secret'
                    )}
                  />
                </div>
              </ProductSection>

              <ProductSection
                iconUrl="/icons/platforms/instagram.png"
                title={t('meta_product_instagram', 'Instagram')}
                description={t(
                  'meta_product_instagram_desc',
                  'Utilizando para monitorar comentários e resposta de story em Automações'
                )}
              >
                <div className="grid grid-cols-2 gap-[12px]">
                  <ReadOnlyRow
                    label={t('meta_instagram_app_id', 'Instagram App ID')}
                  />
                  <ReadOnlyRow
                    label={t(
                      'meta_instagram_app_secret',
                      'Instagram App Secret'
                    )}
                  />
                </div>
                <ReadOnlyRow
                  label={t('verify_token', 'Verify Token')}
                  value={data?.data?.webhookVerifyToken || DEFAULT_VERIFY_TOKEN}
                />
                <div className="border-t border-fifth pt-[12px] flex flex-col gap-[8px]">
                  <div className="text-[12px] font-[600] text-textColor">
                    {t('meta_instagram_webhook', 'Webhook do Instagram')}
                  </div>
                  {callbackUrl && (
                    <CopyRow
                      label={t('callback_url', 'Callback URL')}
                      value={callbackUrl}
                      onCopy={() => copyToClipboard(callbackUrl)}
                    />
                  )}
                </div>
              </ProductSection>

              <ProductSection
                iconUrl="/icons/platforms/threads.png"
                title={t('meta_product_threads', 'Threads')}
              >
                <div className="grid grid-cols-2 gap-[12px]">
                  <ReadOnlyRow
                    label={t('meta_threads_app_id', 'Threads App ID')}
                  />
                  <ReadOnlyRow
                    label={t('meta_threads_app_secret', 'Threads App Secret')}
                  />
                </div>
              </ProductSection>

              {testResult && (
                <div
                  className={clsx(
                    'text-[13px]',
                    testResult.ok
                      ? 'text-customColor42'
                      : 'text-customColor19'
                  )}
                >
                  {testResult.ok
                    ? t('connection_ok', 'Conexão OK')
                    : testResult.error ||
                      t('connection_failed', 'Falha na conexão')}
                </div>
              )}

              <div className="flex items-center gap-[12px]">
                <Button onClick={() => setEditing(true)}>
                  {t('edit', 'Editar')}
                </Button>
                <Button onClick={handleTest} loading={testing} secondary>
                  {t('test_connection', 'Testar conexão')}
                </Button>
                <Button onClick={handleDelete} secondary>
                  {t('remove', 'Remover')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <ProductSection
                iconUrl="/icons/platforms/facebook.png"
                title={t('meta_product_facebook', 'Facebook')}
                description={t(
                  'meta_product_facebook_desc',
                  'Utilizando em OAuth de páginas do Facebook e Instagram'
                )}
              >
                <div className="grid grid-cols-2 gap-[12px]">
                  <LabeledInput
                    label={t('meta_facebook_app_id', 'Facebook App ID')}
                    placeholder={t(
                      'meta_facebook_app_id_placeholder',
                      'Cole o App ID do Facebook'
                    )}
                    value={formValues.clientId || ''}
                    onChange={(v) => handleField('clientId', v)}
                  />
                  <LabeledInput
                    label={t(
                      'meta_facebook_app_secret',
                      'Facebook App Secret'
                    )}
                    placeholder={t(
                      'meta_facebook_app_secret_placeholder',
                      'Cole o App Secret do Facebook'
                    )}
                    value={formValues.clientSecret || ''}
                    onChange={(v) => handleField('clientSecret', v)}
                  />
                </div>
              </ProductSection>

              <ProductSection
                iconUrl="/icons/platforms/instagram.png"
                title={t('meta_product_instagram', 'Instagram')}
                description={t(
                  'meta_product_instagram_desc',
                  'Utilizando para monitorar comentários e resposta de story em Automações'
                )}
              >
                <div className="grid grid-cols-2 gap-[12px]">
                  <LabeledInput
                    label={t('meta_instagram_app_id', 'Instagram App ID')}
                    placeholder={t(
                      'meta_instagram_app_id_placeholder',
                      'Produto Instagram API with Instagram Login → aba Setup'
                    )}
                    value={formValues.instagramAppId || ''}
                    onChange={(v) => handleField('instagramAppId', v)}
                  />
                  <LabeledInput
                    label={t(
                      'meta_instagram_app_secret',
                      'Instagram App Secret'
                    )}
                    placeholder={t(
                      'meta_instagram_app_secret_placeholder',
                      'Produto Instagram API with Instagram Login → aba Setup'
                    )}
                    value={formValues.instagramAppSecret || ''}
                    onChange={(v) => handleField('instagramAppSecret', v)}
                  />
                </div>
                <LabeledInput
                  label={t('verify_token', 'Verify Token')}
                  value={verifyTokenValue}
                  onChange={(v) => handleField('webhookVerifyToken', v)}
                  onCopy={() => copyToClipboard(verifyTokenValue)}
                />
                <div className="border-t border-fifth pt-[12px] flex flex-col gap-[8px]">
                  <div className="text-[12px] font-[600] text-textColor">
                    {t('meta_instagram_webhook', 'Webhook do Instagram')}
                  </div>
                  {callbackUrl && (
                    <CopyRow
                      label={t('callback_url', 'Callback URL')}
                      value={callbackUrl}
                      onCopy={() => copyToClipboard(callbackUrl)}
                    />
                  )}
                </div>
              </ProductSection>

              <ProductSection
                iconUrl="/icons/platforms/threads.png"
                title={t('meta_product_threads', 'Threads')}
              >
                <div className="grid grid-cols-2 gap-[12px]">
                  <LabeledInput
                    label={t('meta_threads_app_id', 'Threads App ID')}
                    placeholder={t(
                      'meta_threads_app_id_placeholder',
                      'Threads App ID do Meta Developer Portal'
                    )}
                    value={formValues.threadsAppId || ''}
                    onChange={(v) => handleField('threadsAppId', v)}
                  />
                  <LabeledInput
                    label={t('meta_threads_app_secret', 'Threads App Secret')}
                    placeholder={t(
                      'meta_threads_app_secret_placeholder',
                      'Threads App Secret do Meta Developer Portal'
                    )}
                    value={formValues.threadsAppSecret || ''}
                    onChange={(v) => handleField('threadsAppSecret', v)}
                  />
                </div>
              </ProductSection>

              <div className="flex items-center gap-[12px]">
                <Button onClick={handleSave} loading={saving}>
                  {t('save_credentials', 'Salvar credenciais')}
                </Button>
                {editing && (
                  <Button
                    onClick={() => {
                      setEditing(false);
                      setFormValues({});
                    }}
                    secondary
                  >
                    {t('cancel', 'Cancelar')}
                  </Button>
                )}
              </div>
            </>
          )}

          <a
            href="https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-customColor18 underline hover:font-bold"
          >
            {t(
              'meta_how_to_get_credentials',
              'Como obter estas credenciais →'
            )}
          </a>
        </div>
      )}
    </div>
  );
};

export default MetaCredentialsCard;
