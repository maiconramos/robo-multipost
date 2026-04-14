'use client';

import React, { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCredential } from '@gitroom/frontend/hooks/use-credentials.hook';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { MessagingTokensSection } from '@gitroom/frontend/components/settings/messaging-tokens-section.component';

const PROVIDER = 'facebook';
const SENTINEL = '__REDACTED__';
const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
const DEFAULT_VERIFY_TOKEN = 'multipost';

type SectionId = 'facebook' | 'instagram' | 'threads';

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

const FIELDS_BY_SECTION: Record<SectionId, FieldKey[]> = {
  facebook: ['clientId', 'clientSecret'],
  instagram: ['instagramAppId', 'instagramAppSecret', 'webhookVerifyToken'],
  threads: ['threadsAppId', 'threadsAppSecret'],
};

interface Props {
  configured: boolean;
  onMutate: () => void;
}

const PencilIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.3 2.7a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L5.4 12.6l-2.4.4.4-2.4L11.3 2.7Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PlugIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M5 2v3M11 2v3M4 5h8v3a4 4 0 0 1-8 0V5Zm4 8v2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.5 4h11M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4m2 0v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4h8Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Spinner: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="animate-spin"
  >
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
    <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

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

const IconButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
  variant?: 'default' | 'danger';
}> = ({ onClick, disabled, label, icon, variant = 'default' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className={clsx(
      'flex items-center gap-[4px] text-[12px] whitespace-nowrap px-[8px] py-[4px] rounded-[4px] transition-opacity',
      disabled && 'opacity-40 cursor-not-allowed',
      !disabled && variant === 'default' && 'text-btnPrimary hover:opacity-80',
      !disabled && variant === 'danger' && 'text-customColor19 hover:opacity-80'
    )}
  >
    {icon}
    {label}
  </button>
);

const ProductSection: React.FC<{
  iconUrl: string;
  title: string;
  description?: string;
  sectionConfigured?: boolean;
  showActionButtons?: boolean;
  isEditing?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onTest?: () => void;
  onRemove?: () => void;
  saving?: boolean;
  testing?: boolean;
  testResult?: { ok: boolean; error?: string } | null;
  editLabel?: string;
  saveLabel?: string;
  cancelLabel?: string;
  testLabel?: string;
  removeLabel?: string;
  testOkLabel?: string;
  testFailLabel?: string;
  children: React.ReactNode;
}> = ({
  iconUrl,
  title,
  description,
  sectionConfigured,
  showActionButtons,
  isEditing,
  canEdit,
  onEdit,
  onSave,
  onCancel,
  onTest,
  onRemove,
  saving,
  testing,
  testResult,
  editLabel = 'Editar',
  saveLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  testLabel = 'Testar',
  removeLabel = 'Remover',
  testOkLabel = 'Conexão OK',
  testFailLabel = 'Falha na conexão',
  children,
}) => (
  <div className="flex flex-col gap-[12px] bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[16px]">
    <div className="flex items-start justify-between gap-[12px]">
      <div className="flex items-center gap-[10px]">
        <img src={iconUrl} alt={title} className="w-[22px] h-[22px] object-contain" />
        <div className="flex flex-col gap-[2px]">
          <div className="text-[14px] font-[600] text-textColor">{title}</div>
          {description && (
            <div className="text-[12px] text-customColor18">{description}</div>
          )}
        </div>
      </div>
      {showActionButtons && !isEditing && (
        <div className="flex items-center gap-[4px]">
          {sectionConfigured && onTest && (
            <IconButton
              onClick={onTest}
              disabled={!canEdit || testing}
              label={testLabel}
              icon={testing ? <Spinner /> : <PlugIcon />}
            />
          )}
          {onEdit && (
            <IconButton
              onClick={onEdit}
              disabled={!canEdit}
              label={editLabel}
              icon={<PencilIcon />}
            />
          )}
          {sectionConfigured && onRemove && (
            <IconButton
              onClick={onRemove}
              disabled={!canEdit}
              label={removeLabel}
              icon={<TrashIcon />}
              variant="danger"
            />
          )}
        </div>
      )}
    </div>
    {children}
    {isEditing && (
      <div className="flex items-center gap-[8px] pt-[4px]">
        <Button onClick={onSave} loading={saving}>
          {saveLabel}
        </Button>
        <Button onClick={onCancel} secondary>
          {cancelLabel}
        </Button>
      </div>
    )}
    {testResult && !isEditing && (
      <div
        className={clsx(
          'text-[12px] px-[10px] py-[6px] rounded-[4px] border',
          testResult.ok
            ? 'text-customColor42 border-customColor42/30 bg-customColor42/5'
            : 'text-customColor19 border-customColor19/30 bg-customColor19/5'
        )}
      >
        {testResult.ok ? testOkLabel : testResult.error || testFailLabel}
      </div>
    )}
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
  const [editingSection, setEditingSection] = useState<SectionId | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingSection, setTestingSection] = useState<SectionId | null>(null);
  const [testResults, setTestResults] = useState<
    Partial<Record<SectionId, { ok: boolean; error?: string } | null>>
  >({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [callbackUrl, setCallbackUrl] = useState<string>('');
  const [remoteVerifyToken, setRemoteVerifyToken] = useState<string>(
    DEFAULT_VERIFY_TOKEN
  );

  const sectionConfigured: Record<SectionId, boolean> = {
    facebook:
      data?.data?.clientId === SENTINEL ||
      data?.data?.clientSecret === SENTINEL,
    instagram:
      data?.data?.instagramAppId === SENTINEL ||
      data?.data?.instagramAppSecret === SENTINEL,
    threads:
      data?.data?.threadsAppId === SENTINEL ||
      data?.data?.threadsAppSecret === SENTINEL,
  };

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
        if (d.verifyToken) setRemoteVerifyToken(d.verifyToken);
      })
      .catch(() => {});
  }, [fetchApi, data]);

  const handleField = useCallback((key: FieldKey, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const startEdit = useCallback(
    (section: SectionId) => {
      setTestResults((prev) => ({ ...prev, [section]: null }));
      const initial: Record<string, string> = {};
      for (const key of FIELDS_BY_SECTION[section]) {
        initial[key] = '';
      }
      // Pré-preenche o Verify Token com o valor atual (vindo de /webhook-config)
      // só quando a seção editada é Instagram.
      if (section === 'instagram') {
        initial.webhookVerifyToken = remoteVerifyToken;
      }
      setFormValues(initial);
      setEditingSection(section);
    },
    [remoteVerifyToken]
  );

  const cancelEdit = useCallback(() => {
    setEditingSection(null);
    setFormValues({});
  }, []);

  const handleSaveSection = useCallback(
    async (section: SectionId) => {
      setSaving(true);
      setTestResults((prev) => ({ ...prev, [section]: null }));
      try {
        const sectionFields = new Set<FieldKey>(FIELDS_BY_SECTION[section]);
        const body: Record<string, string> = {};
        for (const key of ALL_FIELDS) {
          if (sectionFields.has(key)) {
            const value = formValues[key];
            if (configured && (!value || value === '')) {
              body[key] = SENTINEL;
            } else {
              body[key] = value || '';
            }
          } else {
            // Campos fora da seção editada são sempre preservados
            body[key] = SENTINEL;
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
          setEditingSection(null);
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
    },
    [formValues, configured, fetchApi, mutate, onMutate, toaster, t]
  );

  const handleInitialSetup = useCallback(async () => {
    setSaving(true);
    setTestResults({});
    try {
      const body: Record<string, string> = {};
      for (const key of ALL_FIELDS) {
        body[key] = formValues[key] || '';
      }
      if (!body.webhookVerifyToken) {
        body.webhookVerifyToken = DEFAULT_VERIFY_TOKEN;
      }
      const res = await fetchApi(`/credentials/${PROVIDER}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await mutate();
        onMutate();
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
  }, [formValues, fetchApi, mutate, onMutate, toaster, t]);

  const handleTestSection = useCallback(
    async (section: SectionId) => {
      setTestingSection(section);
      setTestResults((prev) => ({ ...prev, [section]: null }));
      try {
        const res = await fetchApi(
          `/credentials/${PROVIDER}/test?section=${section}`,
          { method: 'POST' }
        );
        const result = await res.json().catch(() => ({
          ok: false,
          error: `HTTP ${res.status}`,
        }));
        setTestResults((prev) => ({ ...prev, [section]: result }));
      } catch (err) {
        setTestResults((prev) => ({
          ...prev,
          [section]: {
            ok: false,
            error: t('connection_test_error', 'Erro ao testar conexão'),
          },
        }));
      } finally {
        setTestingSection(null);
      }
    },
    [fetchApi, t]
  );

  const handleRemoveSection = useCallback(
    async (section: SectionId) => {
      const sectionTitles: Record<SectionId, string> = {
        facebook: t('meta_product_facebook', 'Facebook'),
        instagram: t('meta_product_instagram', 'Instagram'),
        threads: t('meta_product_threads', 'Threads'),
      };
      const approved = await decision.open({
        title: t('credentials_delete_title', 'Remover credenciais?'),
        description: t(
          'meta_credentials_delete_section_description',
          'Esta ação remove as credenciais desta seção. As outras seções permanecem intactas.'
        ).replace('{{section}}', sectionTitles[section]),
        approveLabel: t('credentials_delete_approve', 'Sim, remover'),
        cancelLabel: t('credentials_delete_cancel', 'Cancelar'),
      });
      if (!approved) return;

      const sectionFields = new Set<FieldKey>(FIELDS_BY_SECTION[section]);
      const body: Record<string, string> = {};
      for (const key of ALL_FIELDS) {
        // Fields of the section being removed → explicit empty string (clear).
        // Other fields → SENTINEL (preserve existing).
        body[key] = sectionFields.has(key) ? '' : SENTINEL;
      }

      const res = await fetchApi(`/credentials/${PROVIDER}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await mutate();
        onMutate();
        setTestResults((prev) => ({ ...prev, [section]: null }));
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
    },
    [fetchApi, mutate, onMutate, decision, toaster, t]
  );

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

  // Em setup inicial (nada configurado), todas as seções aparecem como inputs
  // com um único Save global no rodapé. Depois de configurado, a edição é
  // por seção com um lápis e Save/Cancel inline.
  const isInitialSetup = !configured;
  const initialVerifyTokenValue =
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
          ) : isInitialSetup ? (
            <>
              {/* SETUP INICIAL — todas seções como inputs, um Save global */}
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
                  value={initialVerifyTokenValue}
                  onChange={(v) => handleField('webhookVerifyToken', v)}
                  onCopy={() => copyToClipboard(initialVerifyTokenValue)}
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
                <Button onClick={handleInitialSetup} loading={saving}>
                  {t('save_credentials', 'Salvar credenciais')}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* CONFIGURADO — edição por seção com ações per-section */}
              <ProductSection
                iconUrl="/icons/platforms/facebook.png"
                title={t('meta_product_facebook', 'Facebook')}
                description={t(
                  'meta_product_facebook_desc',
                  'Utilizando em OAuth de páginas do Facebook e Instagram'
                )}
                sectionConfigured={sectionConfigured.facebook}
                showActionButtons
                canEdit={editingSection === null && testingSection === null}
                isEditing={editingSection === 'facebook'}
                onEdit={() => startEdit('facebook')}
                onSave={() => handleSaveSection('facebook')}
                onCancel={cancelEdit}
                onTest={() => handleTestSection('facebook')}
                onRemove={() => handleRemoveSection('facebook')}
                saving={saving}
                testing={testingSection === 'facebook'}
                testResult={testResults.facebook}
                editLabel={t('edit', 'Editar')}
                saveLabel={t('save', 'Salvar')}
                cancelLabel={t('cancel', 'Cancelar')}
                testLabel={t('test', 'Testar')}
                removeLabel={t('remove', 'Remover')}
                testOkLabel={t('connection_ok', 'Conexão OK')}
                testFailLabel={t('connection_failed', 'Falha na conexão')}
              >
                {editingSection === 'facebook' ? (
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
                ) : (
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
                )}
              </ProductSection>

              <ProductSection
                iconUrl="/icons/platforms/instagram.png"
                title={t('meta_product_instagram', 'Instagram')}
                description={t(
                  'meta_product_instagram_desc',
                  'Utilizando para monitorar comentários e resposta de story em Automações'
                )}
                sectionConfigured={sectionConfigured.instagram}
                showActionButtons
                canEdit={editingSection === null && testingSection === null}
                isEditing={editingSection === 'instagram'}
                onEdit={() => startEdit('instagram')}
                onSave={() => handleSaveSection('instagram')}
                onCancel={cancelEdit}
                onRemove={() => handleRemoveSection('instagram')}
                saving={saving}
                editLabel={t('edit', 'Editar')}
                saveLabel={t('save', 'Salvar')}
                cancelLabel={t('cancel', 'Cancelar')}
                removeLabel={t('remove', 'Remover')}
              >
                {editingSection === 'instagram' ? (
                  <>
                    <div className="grid grid-cols-2 gap-[12px]">
                      <LabeledInput
                        label={t(
                          'meta_instagram_app_id',
                          'Instagram App ID'
                        )}
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
                        onChange={(v) =>
                          handleField('instagramAppSecret', v)
                        }
                      />
                    </div>
                    <LabeledInput
                      label={t('verify_token', 'Verify Token')}
                      value={
                        formValues.webhookVerifyToken || DEFAULT_VERIFY_TOKEN
                      }
                      onChange={(v) => handleField('webhookVerifyToken', v)}
                      onCopy={() =>
                        copyToClipboard(
                          formValues.webhookVerifyToken ||
                            DEFAULT_VERIFY_TOKEN
                        )
                      }
                    />
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-[12px]">
                      <ReadOnlyRow
                        label={t(
                          'meta_instagram_app_id',
                          'Instagram App ID'
                        )}
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
                      value={remoteVerifyToken}
                    />
                  </>
                )}
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
                <div className="border-t border-fifth pt-[12px]">
                  <MessagingTokensSection />
                </div>
              </ProductSection>

              <ProductSection
                iconUrl="/icons/platforms/threads.png"
                title={t('meta_product_threads', 'Threads')}
                sectionConfigured={sectionConfigured.threads}
                showActionButtons
                canEdit={editingSection === null && testingSection === null}
                isEditing={editingSection === 'threads'}
                onEdit={() => startEdit('threads')}
                onSave={() => handleSaveSection('threads')}
                onCancel={cancelEdit}
                onRemove={() => handleRemoveSection('threads')}
                saving={saving}
                editLabel={t('edit', 'Editar')}
                saveLabel={t('save', 'Salvar')}
                cancelLabel={t('cancel', 'Cancelar')}
                removeLabel={t('remove', 'Remover')}
              >
                {editingSection === 'threads' ? (
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
                      label={t(
                        'meta_threads_app_secret',
                        'Threads App Secret'
                      )}
                      placeholder={t(
                        'meta_threads_app_secret_placeholder',
                        'Threads App Secret do Meta Developer Portal'
                      )}
                      value={formValues.threadsAppSecret || ''}
                      onChange={(v) => handleField('threadsAppSecret', v)}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-[12px]">
                    <ReadOnlyRow
                      label={t('meta_threads_app_id', 'Threads App ID')}
                    />
                    <ReadOnlyRow
                      label={t('meta_threads_app_secret', 'Threads App Secret')}
                    />
                  </div>
                )}
              </ProductSection>

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
