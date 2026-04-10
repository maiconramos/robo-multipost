'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useFlows } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useRouter } from 'next/navigation';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';

export const FlowListComponent: FC = () => {
  const t = useT();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: flows, isLoading, mutate } = useFlows();
  const { data: integrations } = useIntegrationList();
  const [showCreate, setShowCreate] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowIntegrationId, setNewFlowIntegrationId] = useState('');
  const [creating, setCreating] = useState(false);
  const [webhookCheck, setWebhookCheck] = useState<{
    loading: boolean;
    ok?: boolean;
    error?: string;
  }>({ loading: false });
  useEffect(() => {
    if (!newFlowIntegrationId) {
      setWebhookCheck({ loading: false });
      return;
    }
    setWebhookCheck({ loading: true });
    fetchApi(
      `/flows/integrations/${newFlowIntegrationId}/webhook-status`
    )
      .then((r) => r.json())
      .then((data) => {
        setWebhookCheck({
          loading: false,
          ok: data.ok,
          error: data.error,
        });
      })
      .catch(() => {
        setWebhookCheck({
          loading: false,
          ok: false,
          error: t(
            'webhook_check_failed',
            'Nao foi possivel verificar o webhook'
          ),
        });
      });
  }, [newFlowIntegrationId, fetchApi, t]);

  const instagramIntegrations = useMemo(() => {
    if (!Array.isArray(integrations)) return [];
    return integrations.filter(
      (i: any) => i.identifier === 'instagram'
    );
  }, [integrations]);

  const handleCreate = useCallback(async () => {
    if (!newFlowName.trim() || !newFlowIntegrationId) return;
    setCreating(true);
    try {
      const response = await fetchApi('/flows', {
        method: 'POST',
        body: JSON.stringify({
          name: newFlowName,
          integrationId: newFlowIntegrationId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toaster.show(
          body.message || t('failed_to_create_flow', 'Falha ao criar automacao'),
          'warning'
        );
        return;
      }
      const created = await response.json();
      await mutate();
      setShowCreate(false);
      setNewFlowName('');
      setNewFlowIntegrationId('');
      toaster.show(t('flow_created', 'Automacao criada com sucesso'), 'success');
      router.push(`/automacoes/${created.id}`);
    } catch {
      toaster.show(t('failed_to_create_flow', 'Falha ao criar automacao'), 'warning');
    } finally {
      setCreating(false);
    }
  }, [newFlowName, newFlowIntegrationId, fetchApi, mutate, router, t, toaster]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetchApi(`/flows/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          toaster.show(t('failed_to_delete_flow', 'Falha ao excluir automacao'), 'warning');
          return;
        }
        await mutate();
        toaster.show(t('flow_deleted', 'Automacao excluida'), 'success');
      } catch {
        toaster.show(t('failed_to_delete_flow', 'Falha ao excluir automacao'), 'warning');
      }
    },
    [fetchApi, mutate, t, toaster]
  );

  if (isLoading) return <LoadingComponent />;

  return (
    <div className="flex flex-col gap-[16px] p-[24px] flex-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-textColor">
            {t('automacoes', 'Automations')}
          </h1>
          <p className="text-[14px] text-customColor18 mt-[4px]">
            {t(
              'automacoes_description',
              'Create automations to automatically respond to Instagram comments'
            )}
          </p>
        </div>
        <div className="flex items-center gap-[8px]">
          <button
            onClick={() => router.push('/automacoes/nova')}
            className="rounded-[4px] bg-btnPrimary px-[16px] py-[8px] text-[14px] text-white hover:opacity-80"
          >
            {t('new_automation', 'New Automation')}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-[4px] border border-fifth bg-btnSimple px-[16px] py-[8px] text-[14px] text-textColor hover:bg-boxHover"
          >
            {t('start_from_scratch', 'Flow Builder')}
          </button>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="rounded-[4px] border border-fifth bg-sixth p-[24px]">
          <h3 className="text-[14px] font-semibold text-textColor mb-[16px]">
            {t('create_new_flow', 'Create New Automation')}
          </h3>
          <div className="flex flex-col gap-[16px]">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[14px] text-textColor">
                {t('flow_name', 'Name')}
              </label>
              <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
                <input
                  type="text"
                  className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px]"
                  placeholder={t('flow_name_placeholder', 'My Instagram Automation')}
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[14px] text-textColor">
                {t('select_instagram_account', 'Instagram Account')}
              </label>
              {instagramIntegrations.length === 0 ? (
                <p className="text-[13px] text-customColor19">
                  {t(
                    'no_instagram_connected',
                    'No Instagram account connected. Go to Integrations to connect one first.'
                  )}
                </p>
              ) : (
                <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
                  <select
                    className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px] appearance-none"
                    value={newFlowIntegrationId}
                    onChange={(e) => setNewFlowIntegrationId(e.target.value)}
                  >
                    <option value="">
                      {t('select_account', 'Select an account...')}
                    </option>
                    {instagramIntegrations.map((ig: any) => (
                      <option key={ig.id} value={ig.id}>
                        {ig.name || ig.display || ig.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {newFlowIntegrationId && (
              <div className="flex flex-col gap-[4px]">
                {webhookCheck.loading ? (
                  <p className="text-[12px] text-customColor18">
                    {t('checking_webhook', 'Verificando webhook...')}
                  </p>
                ) : webhookCheck.ok ? (
                  <p className="text-[12px] text-customColor42">
                    {t('webhook_ok', 'Webhook configurado corretamente')}
                  </p>
                ) : webhookCheck.error ? (
                  <div className="rounded-[4px] border border-customColor13/40 bg-customColor13/10 p-[12px]">
                    <p className="text-[12px] text-customColor13 whitespace-pre-wrap leading-[1.5]">
                      {webhookCheck.error}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
            <div className="flex gap-[8px]">
              <button
                onClick={handleCreate}
                disabled={
                  creating ||
                  !newFlowName.trim() ||
                  !newFlowIntegrationId ||
                  !webhookCheck.ok
                }
                className="rounded-[4px] bg-btnPrimary px-[16px] py-[8px] text-[14px] text-white hover:opacity-80 disabled:opacity-50"
              >
                {creating
                  ? t('creating_flow', 'Creating...')
                  : t('create', 'Create')}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-[4px] border border-fifth bg-btnSimple px-[16px] py-[8px] text-[14px] text-textColor hover:opacity-80"
              >
                {t('cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flow list */}
      {!Array.isArray(flows) || flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-[64px] text-customColor18">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
          </svg>
          <p className="mt-[16px] text-[14px]">
            {t('no_flows_yet', 'No automations created yet')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow: any) => (
            <div
              key={flow.id}
              className="flex flex-col rounded-[4px] border border-fifth bg-sixth p-[16px] cursor-pointer hover:bg-boxHover transition-colors"
              onClick={() => router.push(`/automacoes/${flow.id}`)}
            >
              <div className="flex items-center justify-between mb-[8px]">
                <h3 className="text-[14px] font-semibold text-textColor truncate">{flow.name}</h3>
                <span
                  className={`rounded-[4px] px-[8px] py-[2px] text-[10px] ${
                    flow.status === 'ACTIVE'
                      ? 'bg-customColor42/20 text-customColor42'
                      : flow.status === 'PAUSED'
                      ? 'bg-customColor13/20 text-customColor13'
                      : 'bg-btnSimple text-customColor18'
                  }`}
                >
                  {flow.status === 'ACTIVE'
                    ? t('flow_status_active', 'Active')
                    : flow.status === 'PAUSED'
                    ? t('flow_status_paused', 'Paused')
                    : t('flow_status_draft', 'Draft')}
                </span>
              </div>

              {flow.integration && (
                <div className="flex items-center gap-[8px] mb-[8px]">
                  {flow.integration.picture && (
                    <img
                      src={flow.integration.picture}
                      alt=""
                      className="h-[20px] w-[20px] rounded-full"
                    />
                  )}
                  <span className="text-[12px] text-customColor18">
                    {flow.integration.name}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-[12px] text-customColor18 mt-auto pt-[8px]">
                <span>
                  {flow._count?.nodes || 0} {t('nodes', 'nodes')}
                </span>
                <span>
                  {flow._count?.executions || 0} {t('executions', 'executions')}
                </span>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(flow.id);
                }}
                className="mt-[8px] text-[12px] text-customColor19 hover:opacity-80 self-end"
              >
                {t('delete', 'Delete')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
