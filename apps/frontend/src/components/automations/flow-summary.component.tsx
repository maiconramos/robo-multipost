'use client';

import { FC, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useRouter } from 'next/navigation';
import { FlowExecutionsComponent } from '@gitroom/frontend/components/automations/flow-executions.component';

interface FlowSummaryProps {
  flow: any;
  onSwitchToAdvanced: () => void;
  onMutate: () => void;
}

export const FlowSummaryComponent: FC<FlowSummaryProps> = ({
  flow,
  onSwitchToAdvanced,
  onMutate,
}) => {
  const t = useT();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const router = useRouter();

  const triggerNode = flow.nodes?.find((n: any) => n.type === 'TRIGGER');
  const replyNode = flow.nodes?.find((n: any) => n.type === 'REPLY_COMMENT');
  const dmNode = flow.nodes?.find((n: any) => n.type === 'SEND_DM');

  const triggerConfig = safeParseJson(triggerNode?.data);
  const replyConfig = safeParseJson(replyNode?.data);
  const dmConfig = safeParseJson(dmNode?.data);

  const handleStatusChange = useCallback(
    async (status: string) => {
      try {
        const res = await fetchApi(`/flows/${flow.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toaster.show(
            body.message || t('failed_to_change_status', 'Falha ao alterar status da automacao'),
            'warning'
          );
          return;
        }
        onMutate();
        toaster.show(
          status === 'ACTIVE'
            ? t('flow_activated', 'Automacao ativada')
            : t('flow_paused', 'Automacao pausada'),
          'success'
        );
      } catch {
        toaster.show(
          t('failed_to_change_status', 'Falha ao alterar status da automacao'),
          'warning'
        );
      }
    },
    [flow.id, fetchApi, onMutate, t, toaster]
  );

  return (
    <div className="flex flex-col gap-[16px] p-[24px] max-w-[800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <h2 className="text-[18px] font-semibold text-textColor">{flow.name}</h2>
          <span
            className={`rounded-[4px] px-[8px] py-[2px] text-[12px] ${
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

        <div className="flex items-center gap-[8px]">
          {flow.status === 'ACTIVE' ? (
            <button
              onClick={() => handleStatusChange('PAUSED')}
              className="rounded-[4px] bg-customColor13/20 text-customColor13 px-[12px] py-[6px] text-[12px] hover:opacity-80"
            >
              {t('pause_flow', 'Pause')}
            </button>
          ) : (
            <button
              onClick={() => handleStatusChange('ACTIVE')}
              className="rounded-[4px] bg-customColor42/20 text-customColor42 px-[12px] py-[6px] text-[12px] hover:opacity-80"
            >
              {t('activate_flow', 'Activate')}
            </button>
          )}
          <button
            onClick={() => router.push(`/automacoes/${flow.id}/wizard`)}
            className="rounded-[4px] border border-btnPrimary bg-btnPrimary/10 px-[12px] py-[6px] text-[12px] text-textColor hover:opacity-80"
          >
            {t('edit_in_wizard', 'Edit in Wizard')}
          </button>
          <button
            onClick={onSwitchToAdvanced}
            className="rounded-[4px] border border-fifth bg-btnSimple px-[12px] py-[6px] text-[12px] text-textColor hover:bg-boxHover"
          >
            {t('edit_advanced', 'Edit advanced')}
          </button>
        </div>
      </div>

      {/* Integration */}
      {flow.integration && (
        <div className="flex items-center gap-[8px]">
          {flow.integration.picture && (
            <img src={flow.integration.picture} alt="" className="h-[24px] w-[24px] rounded-full" />
          )}
          <span className="text-[13px] text-customColor18">{flow.integration.name}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
        {/* Trigger card */}
        <div className="rounded-[8px] border-l-[3px] border-l-green-500 border border-fifth bg-sixth p-[16px]">
          <h3 className="text-[13px] font-semibold text-textColor mb-[8px]">
            {t('summary_trigger', 'Trigger')}
          </h3>
          <p className="text-[12px] text-customColor18">
            {triggerConfig.postIds?.length
              ? t('summary_specific_posts', '{count} specific post(s)').replace('{count}', String(triggerConfig.postIds.length))
              : t('summary_all_posts', 'All posts')}
          </p>
          {triggerConfig.keywords?.length > 0 && (
            <p className="text-[11px] text-customColor18 mt-[4px]">
              {t('trigger_keywords_label', 'Keywords')}: {triggerConfig.keywords.join(', ')}
            </p>
          )}
        </div>

        {/* Reply card */}
        <div className={`rounded-[8px] border-l-[3px] border-l-blue-500 border border-fifth bg-sixth p-[16px] ${!replyNode ? 'opacity-50' : ''}`}>
          <h3 className="text-[13px] font-semibold text-textColor mb-[8px]">
            {t('summary_reply', 'Reply')}
          </h3>
          {replyConfig.message ? (
            <p className="text-[12px] text-customColor18 line-clamp-3">{replyConfig.message}</p>
          ) : (
            <p className="text-[12px] text-customColor18">{t('summary_not_configured', 'Not configured')}</p>
          )}
        </div>

        {/* DM card */}
        <div className={`rounded-[8px] border-l-[3px] border-l-purple-500 border border-fifth bg-sixth p-[16px] ${!dmNode ? 'opacity-50' : ''}`}>
          <h3 className="text-[13px] font-semibold text-textColor mb-[8px]">
            {t('summary_dm', 'Direct Message')}
          </h3>
          {dmConfig.message ? (
            <p className="text-[12px] text-customColor18 line-clamp-3 whitespace-pre-wrap">{dmConfig.message}</p>
          ) : (
            <p className="text-[12px] text-customColor18">{t('summary_not_configured', 'Not configured')}</p>
          )}
        </div>
      </div>

      {/* Execution history */}
      <div className="border-t border-fifth pt-[16px]">
        <h3 className="text-[14px] font-semibold text-textColor mb-[12px]">
          {t('flow_executions', 'Historico de Execucoes')}
        </h3>
        <FlowExecutionsComponent flowId={flow.id} />
      </div>
    </div>
  );
};

function safeParseJson(data?: string): Record<string, any> {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}
