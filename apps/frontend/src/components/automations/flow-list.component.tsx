'use client';

import { FC, useCallback, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useFlows } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useRouter } from 'next/navigation';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { NovaAutomacaoModal } from '@gitroom/frontend/components/automations/nova-automacao-modal.component';

export const FlowListComponent: FC = () => {
  const t = useT();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: flows, isLoading, mutate } = useFlows();
  const [showNovaModal, setShowNovaModal] = useState(false);

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
            onClick={() => setShowNovaModal(true)}
            className="rounded-[4px] bg-btnPrimary px-[16px] py-[8px] text-[14px] text-white hover:opacity-80"
          >
            {t('new_automation', 'Nova Automacao')}
          </button>
        </div>
      </div>

      <NovaAutomacaoModal
        open={showNovaModal}
        onClose={() => setShowNovaModal(false)}
        onCreated={() => mutate()}
      />


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
