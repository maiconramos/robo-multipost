'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCredential } from '@gitroom/frontend/hooks/use-credentials.hook';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';

const SENTINEL = '__REDACTED__';
const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
}

interface ProviderCredentialFormProps {
  provider: string;
  fields: FieldDef[];
  label: string;
  docsUrl: string;
  onSaved?: () => void;
  onDeleted?: () => void;
  extraActions?: React.ReactNode;
}

export const ProviderCredentialForm: React.FC<ProviderCredentialFormProps> = ({
  provider,
  fields,
  label,
  docsUrl,
  onSaved,
  onDeleted,
  extraActions,
}) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const decision = useDecisionModal();
  const { data, isLoading, mutate } = useCredential(provider);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const configured = !!data?.data && Object.keys(data.data).length > 0;

  useEffect(() => {
    if (editing && configured) {
      const initial: Record<string, string> = {};
      for (const field of fields) {
        initial[field.key] = '';
      }
      setFormValues(initial);
    }
  }, [editing, configured, fields]);

  const handleFieldChange = useCallback(
    (key: string, value: string) => {
      setFormValues((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const body: Record<string, string> = {};
      for (const field of fields) {
        const value = formValues[field.key];
        if (configured && (!value || value === '')) {
          body[field.key] = SENTINEL;
        } else {
          body[field.key] = value || '';
        }
      }

      const method = configured ? 'PATCH' : 'POST';
      const res = await fetch(`/credentials/${provider}`, {
        method,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await mutate();
        onSaved?.();
        setEditing(false);
        setFormValues({});
        toaster.show('Credenciais salvas com sucesso', 'success');
      } else {
        toaster.show('Erro ao salvar credenciais', 'warning');
      }
    } finally {
      setSaving(false);
    }
  }, [fields, formValues, configured, provider, fetch, mutate, onSaved, toaster]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/credentials/${provider}/test`, {
        method: 'POST',
      });
      const result = await res.json();
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: 'Erro ao testar conexão' });
    } finally {
      setTesting(false);
    }
  }, [provider, fetch]);

  const handleDelete = useCallback(async () => {
    const approved = await decision.open({
      title: 'Remover credenciais?',
      description: `Isso irá remover as credenciais de ${label}. A plataforma usará as variáveis de ambiente como fallback.`,
      approveLabel: 'Sim, remover',
      cancelLabel: 'Cancelar',
    });
    if (!approved) return;

    const res = await fetch(`/credentials/${provider}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await mutate();
      onDeleted?.();
      setEditing(false);
      setTestResult(null);
      toaster.show('Credenciais removidas', 'success');
    } else {
      toaster.show('Erro ao remover credenciais', 'warning');
    }
  }, [provider, label, fetch, mutate, onDeleted, decision, toaster]);

  if (isLoading) {
    return (
      <div className="p-[16px]">
        <div className="animate-pulse text-customColor18">Carregando...</div>
      </div>
    );
  }

  if (configured && !editing) {
    return (
      <div className="flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[12px]">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-[4px]">
              <div className="text-[13px] text-customColor18">
                {field.label}
              </div>
              <div className="text-[14px]">{MASK}</div>
            </div>
          ))}
        </div>

        {testResult && (
          <div
            className={`text-[13px] ${
              testResult.ok ? 'text-customColor42' : 'text-customColor19'
            }`}
          >
            {testResult.ok
              ? 'Conexão OK'
              : testResult.error || 'Falha na conexão'}
          </div>
        )}

        <div className="flex items-center gap-[12px]">
          <Button onClick={() => setEditing(true)}>Editar</Button>
          <Button onClick={handleTest} loading={testing} secondary>
            Testar conexão
          </Button>
          <Button onClick={handleDelete} secondary>
            Remover
          </Button>
        </div>

        {extraActions && <div>{extraActions}</div>}

        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-customColor18 underline hover:font-bold"
        >
          Como obter estas credenciais &rarr;
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[12px]">
        {fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-[6px]">
            <div className="text-[14px]">{field.label}</div>
            <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor placeholder-textColor flex items-center">
              <input
                className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px]"
                type="text"
                placeholder={field.placeholder}
                value={formValues[field.key] || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-[12px]">
        <Button onClick={handleSave} loading={saving}>
          Salvar credenciais
        </Button>
        {editing && (
          <Button
            onClick={() => {
              setEditing(false);
              setFormValues({});
            }}
            secondary
          >
            Cancelar
          </Button>
        )}
      </div>

      <a
        href={docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[13px] text-customColor18 underline hover:font-bold"
      >
        Como obter estas credenciais &rarr;
      </a>
    </div>
  );
};

export default ProviderCredentialForm;
