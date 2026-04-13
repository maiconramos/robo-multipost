'use client';

import { FC, useCallback, useState } from 'react';
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

const FlowSwitch: FC<{ active: boolean; onChange: (next: boolean) => void }> = ({ active, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={active}
    onClick={() => onChange(!active)}
    className={`relative inline-flex h-[24px] w-[44px] flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${active ? 'bg-customColor42' : 'bg-fifth'}`}
  >
    <span
      className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 mt-[1px] ${active ? 'translate-x-[22px]' : 'translate-x-[1px]'}`}
    />
  </button>
);

export const FlowSummaryComponent: FC<FlowSummaryProps> = ({
  flow,
  onSwitchToAdvanced,
  onMutate,
}) => {
  const t = useT();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [flowName, setFlowName] = useState(flow.name || '');

  const triggerNode = flow.nodes?.find((n: any) => n.type === 'TRIGGER');
  const replyNode = flow.nodes?.find((n: any) => n.type === 'REPLY_COMMENT');
  const dmNode = flow.nodes?.find((n: any) => n.type === 'SEND_DM');

  const triggerConfig = safeParseJson(triggerNode?.data);
  const replyConfig = safeParseJson(replyNode?.data);
  const dmConfig = safeParseJson(dmNode?.data);

  const handleNameSave = useCallback(async () => {
    setEditingName(false);
    const trimmed = flowName.trim();
    if (!trimmed || trimmed === flow.name) {
      setFlowName(flow.name || '');
      return;
    }
    try {
      await fetchApi(`/flows/${flow.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed }),
      });
      onMutate();
    } catch {
      setFlowName(flow.name || '');
      toaster.show(t('failed_to_rename_flow', 'Falha ao renomear automacao'), 'warning');
    }
  }, [flowName, flow.id, flow.name, fetchApi, onMutate, toaster, t]);

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
      <div className="flex items-center justify-between gap-[12px] flex-wrap">
        <div className="flex items-center gap-[12px]">
          {editingName ? (
            <input
              autoFocus
              className="text-[18px] font-semibold text-textColor bg-transparent border-b border-textColor outline-none px-[2px]"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') {
                  setFlowName(flow.name);
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <h2
              className="text-[18px] font-semibold text-textColor cursor-pointer hover:opacity-70"
              onClick={() => setEditingName(true)}
              title={t('click_to_rename', 'Clique para renomear')}
            >
              {flowName || flow.name}
            </h2>
          )}
          <div className="flex items-center gap-[8px]">
            <FlowSwitch
              active={flow.status === 'ACTIVE'}
              onChange={(active) => handleStatusChange(active ? 'ACTIVE' : 'PAUSED')}
            />
            <span className={`text-[12px] ${flow.status === 'ACTIVE' ? 'text-customColor42' : 'text-customColor18'}`}>
              {flow.status === 'ACTIVE'
                ? t('flow_status_active', 'Active')
                : flow.status === 'PAUSED'
                ? t('flow_status_paused', 'Paused')
                : t('flow_status_draft', 'Draft')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-[8px]">
          <button
            onClick={() => router.push(`/automacoes/${flow.id}/wizard`)}
            className="rounded-[4px] border border-btnPrimary bg-btnPrimary/10 px-[12px] py-[6px] text-[12px] text-textColor hover:opacity-80"
          >
            {t('edit_in_wizard', 'Edit in Quick mode')}
          </button>
          <button
            onClick={onSwitchToAdvanced}
            className="rounded-[4px] border border-fifth bg-btnSimple px-[12px] py-[6px] text-[12px] text-textColor hover:bg-boxHover"
          >
            {t('edit_advanced', 'Open in Flow Builder')}
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
            {triggerConfig.triggerType === 'story_reply'
              ? t('trigger_type_story', 'Resposta ao story')
              : t('trigger_type_comment', 'Comentario em publicacao')}
          </h3>
          <p className="text-[12px] text-customColor18">
            {triggerConfig.mode === 'next_publication'
              ? triggerConfig.triggerType === 'story_reply'
                ? t('summary_next_story', 'Aguardando proximo story')
                : t('summary_next_publication', 'Aguardando proxima publicacao')
              : triggerConfig.triggerType === 'story_reply'
              ? triggerConfig.storyIds?.length
                ? t('summary_specific_stories', '{count} story(ies) especifico(s)').replace('{count}', String(triggerConfig.storyIds.length))
                : t('summary_all_stories', 'Qualquer story')
              : triggerConfig.postIds?.length
              ? t('summary_specific_posts', '{count} specific post(s)').replace('{count}', String(triggerConfig.postIds.length))
              : t('summary_all_posts', 'Todos os posts')}
          </p>
          {triggerConfig.keywords?.length > 0 && (
            <p className="text-[11px] text-customColor18 mt-[4px]">
              {t('trigger_keywords_label', 'Palavras-chave')}: {triggerConfig.keywords.join(', ')}
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
