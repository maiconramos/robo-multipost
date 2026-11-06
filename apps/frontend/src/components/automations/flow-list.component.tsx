'use client';

import { sharedFailureCode } from './shared-flow-ui';
import { useSharedFlowData } from './hooks/use-shared-flows';
import type { SharedFlowView } from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';
import { FC, useCallback, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useFlows } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { NovaAutomacaoModal } from '@gitroom/frontend/components/automations/nova-automacao-modal.component';
import { RepostListComponent } from '@gitroom/frontend/components/automations/repost/repost-list.component';
import { PlatformIconBadge } from '@gitroom/frontend/components/launches/helpers/platform-icon.helper';

type FlowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

interface FlowTriggerNode {
  id: string;
  type: string;
  data: string | Record<string, any> | null;
}

interface FlowListItem {
  id: string;
  name: string;
  description?: string | null;
  status: FlowStatus;
  triggerPostIds: string | null;
  integration?: {
    id: string;
    name: string;
    picture: string | null;
    providerIdentifier: string;
  } | null;
  nodes?: FlowTriggerNode[];
  _count?: { nodes: number; executions: number };
  shared?: SharedFlowView;
}

interface TriggerSummary {
  scheduled?: boolean;
  keywords: string[];
  postsCount: number | null;
}

const parseJsonSafe = (value: unknown): any => {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const buildTriggerSummary = (flow: FlowListItem): TriggerSummary => {
  const triggerNode =
    flow.nodes?.find((n) => n.type === 'TRIGGER') ?? flow.nodes?.[0];
  const triggerData = parseJsonSafe(triggerNode?.data ?? null);
  const rawKeywords = Array.isArray(triggerData?.keywords)
    ? triggerData.keywords
    : [];
  const keywords = rawKeywords
    .filter(
      (k: unknown): k is string => typeof k === 'string' && k.trim().length > 0
    )
    .map((k: string) => k.trim());

  const postIdsParsed = parseJsonSafe(flow.triggerPostIds);
  const postsCount = Array.isArray(postIdsParsed) ? postIdsParsed.length : null;

  return { keywords, postsCount, scheduled: triggerData?.mode === 'scheduled' };
};

export const FlowListComponent: FC = () => {
  const t = useT();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: flows, isLoading, mutate, error: legacyError } = useFlows();
  const {
    data: sharedFlows,
    error: sharedError,
    isLoading: sharedLoading,
    mutate: mutateShared,
  } = useSharedFlowData<SharedFlowView[]>('/flows-v2');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showNovaModal, setShowNovaModal] = useState(false);

  const toggleFlow = useCallback(
    async (flow: FlowListItem) => {
      if (flow.status === 'DRAFT' || flow.status === 'ARCHIVED') return;
      const next: FlowStatus = flow.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      try {
        const res = await fetchApi(`/flows/${flow.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) {
          toaster.show(
            t('flow_toggle_failed', 'Falha ao alterar o status da automação'),
            'warning'
          );
          return;
        }
        await mutate();
      } catch {
        toaster.show(
          t('flow_toggle_failed', 'Falha ao alterar o status da automação'),
          'warning'
        );
      }
    },
    [fetchApi, mutate, t, toaster]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetchApi(`/flows/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          toaster.show(
            t('failed_to_delete_flow', 'Falha ao excluir automação'),
            'warning'
          );
          return;
        }
        await mutate();
        toaster.show(t('flow_deleted', 'Automação excluída'), 'success');
      } catch {
        toaster.show(
          t('failed_to_delete_flow', 'Falha ao excluir automação'),
          'warning'
        );
      }
    },
    [fetchApi, mutate, t, toaster]
  );

  const sharedAction = async (flow: SharedFlowView, archive = false) => {
    if (busyId) return;
    if (archive && !window.confirm(t('shared_archive_confirm'))) return;
    setBusyId(flow.id);
    setListError(null);
    try {
      const response = await fetchApi(
        `/flows-v2/${flow.id}${archive ? '' : '/status'}`,
        {
          method: archive ? 'DELETE' : 'POST',
          body: JSON.stringify({
            expectedRevision: flow.revision,
            ...(archive
              ? {}
              : { status: flow.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }),
          }),
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const code = sharedFailureCode(response.status, body);
        const conflictName =
          ['MESSENGER_RULE_CONFLICT', 'MESSENGER_PRIORITY_CONFLICT'].includes(
            code
          ) && typeof body.conflictingFlowName === 'string'
            ? ` · ${body.conflictingFlowName.slice(0, 200)}`
            : '';
        setListError(
          t(`shared_error_${code.toLowerCase()}`, t('shared_save_failed')) +
            conflictName
        );
        if (code === 'REVISION_CONFLICT') await mutateShared();
        return;
      }
      await mutateShared();
    } catch {
      setListError(t('shared_save_failed'));
    } finally {
      setBusyId(null);
    }
  };
  const rows: FlowListItem[] = [
    ...(Array.isArray(flows) ? flows : []),
    ...(Array.isArray(sharedFlows)
      ? sharedFlows
          .filter((f) => f.status !== 'ARCHIVED')
          .map((f) => ({
            id: f.id,
            name: f.name,
            status: f.status as FlowStatus,
            triggerPostIds: null,
            shared: f,
          }))
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 flex-1 min-w-0 w-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold text-textColor">
            {t('automacoes', 'Automations')}
          </h1>
          <p className="text-[14px] text-customColor18 mt-[4px]">
            {t(
              'shared_list_description',
              'Responda comentários e mensagens nos seus canais conectados'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => router.push('/automations/logs')}
            className="rounded-[4px] border border-fifth bg-sixth px-[16px] py-[8px] text-[14px] text-textColor hover:border-btnPrimary/50 transition-colors"
            title={t(
              'logs_button_tooltip',
              'Comments on posts not monitored (ad dark posts)'
            )}
          >
            {t('shared_logs', 'Log')}
          </button>
          <button
            onClick={() => setShowNovaModal(true)}
            className="rounded-[4px] bg-btnPrimary px-[16px] py-[8px] text-[14px] text-white hover:opacity-80"
          >
            {t('new_automation', 'Nova Automação')}
          </button>
        </div>
      </div>

      <NovaAutomacaoModal
        open={showNovaModal}
        onClose={() => setShowNovaModal(false)}
        onCreated={() => mutate()}
      />

      {(legacyError || sharedError || listError) && (
        <div
          role="alert"
          className="rounded-xl border border-amber-600/40 p-4 text-sm space-y-2"
        >
          <p>{listError || t('shared_list_partial_error')}</p>
          <button
            className="underline"
            onClick={() => {
              setListError(null);
              void mutate();
              void mutateShared();
            }}
          >
            {t('fb_auto_retry')}
          </button>
        </div>
      )}
      {(isLoading || sharedLoading) && (
        <p role="status" className="text-sm text-newTextColor/60">
          {t('loading')}
        </p>
      )}

      {!rows.length &&
      !isLoading &&
      !sharedLoading &&
      !legacyError &&
      !sharedError ? (
        <div className="flex flex-col items-center justify-center py-[64px] text-customColor18 border border-fifth rounded-[8px] bg-sixth">
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
            {t(
              'flow_list_empty',
              'Nenhuma automação criada ainda. Crie uma para começar.'
            )}
          </p>
        </div>
      ) : rows.length > 0 ? (
        <div className="rounded-[8px] border border-newTableBorder bg-newBgColorInner overflow-x-auto min-w-0 max-w-full">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-newBgColorInner text-[11px] uppercase tracking-wide text-customColor18">
              <tr>
                <th className="px-[16px] py-[12px] w-[160px]">
                  {t('flow_list_col_status', 'Status')}
                </th>
                <th className="px-[16px] py-[12px]">
                  {t('flow_list_col_description', 'Descrição')}
                </th>
                <th className="px-[16px] py-[12px]">
                  {t('flow_list_col_account', 'Conta')}
                </th>
                <th className="px-[16px] py-[12px] w-[120px]">
                  {t('flow_list_col_executions', 'Execuções')}
                </th>
                <th className="px-[16px] py-[12px] whitespace-nowrap text-right">
                  {t('flow_list_col_actions', 'Ações')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((flow, idx) => (
                <FlowRow
                  key={`${flow.shared ? 'shared' : 'legacy'}:${flow.id}`}
                  flow={flow}
                  isLast={idx === rows.length - 1}
                  busy={busyId === flow.id}
                  onToggle={() =>
                    flow.shared ? sharedAction(flow.shared) : toggleFlow(flow)
                  }
                  onEdit={() =>
                    router.push(
                      flow.shared
                        ? `/automations/${flow.id}`
                        : `/automations/instagram/${flow.id}`
                    )
                  }
                  onDelete={() =>
                    flow.shared
                      ? sharedAction(flow.shared, true)
                      : handleDelete(flow.id)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-[16px] pt-[16px] border-t border-fifth">
        <RepostListComponent />
      </div>
    </div>
  );
};

interface RowProps {
  flow: FlowListItem;
  isLast: boolean;
  busy?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const STATUS_BADGE_STYLE: Record<FlowStatus, { bg: string; color: string }> = {
  ACTIVE: { bg: 'rgba(34,197,94,0.15)', color: '#16a34a' },
  PAUSED: { bg: 'rgba(82,82,91,0.18)', color: '#a1a1aa' },
  DRAFT: { bg: 'rgba(245,158,11,0.15)', color: '#d97706' },
  ARCHIVED: { bg: 'rgba(82,82,91,0.18)', color: '#a1a1aa' },
};

const FlowRow: FC<RowProps> = ({
  flow,
  isLast,
  busy,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const t = useT();
  const isActive = flow.status === 'ACTIVE';
  const isToggleDisabled =
    busy || flow.status === 'DRAFT' || flow.status === 'ARCHIVED';
  const execCount = flow.shared ? '—' : flow._count?.executions ?? 0;
  const integration = flow.integration;
  const summary = buildTriggerSummary(flow);
  if (flow.shared) {
    summary.keywords =
      parseJsonSafe(
        flow.shared.definition.nodes.find((n) => n.type === 'TRIGGER')?.data
      )?.keywords || [];
  }

  const statusLabel =
    flow.status === 'ACTIVE'
      ? t('flow_status_active', 'Ativa')
      : flow.status === 'PAUSED'
      ? t('flow_status_paused', 'Pausada')
      : flow.status === 'DRAFT'
      ? t('flow_status_draft', 'Rascunho')
      : t('flow_status_archived', 'Arquivada');

  const badgeStyle = STATUS_BADGE_STYLE[flow.status];

  const keywordsPart =
    summary.keywords.length === 0
      ? t('flow_trigger_no_keywords', 'Sem palavras-chave')
      : summary.keywords.slice(0, 2).join(', ') +
        (summary.keywords.length > 2 ? ` +${summary.keywords.length - 2}` : '');

  const sharedTrigger =
    flow.shared &&
    parseJsonSafe(
      flow.shared.definition.nodes.find((n) => n.type === 'TRIGGER')?.data
    );
  const postsPart =
    sharedTrigger?.triggerType === 'messenger_message'
      ? `${t('messenger_trigger_message')} · ${t('messenger_priority')}: ${
          sharedTrigger.priority
        }`
      : flow.shared
      ? flow.shared.channels
          .map((c) =>
            c.postMode === 'all'
              ? t('shared_all')
              : c.postMode === 'scheduled'
              ? t('scheduled_selected_post')
              : c.postMode === 'next_publication'
              ? t('shared_next')
              : t('shared_selected_count', { count: c.postIds.length })
          )
          .join(' · ')
      : summary.scheduled
      ? t('scheduled_selected_post')
      : summary.postsCount == null
      ? t('flow_trigger_all_posts', 'Todos os posts')
      : t('flow_trigger_posts_count', '{{count}} posts').replace(
          '{{count}}',
          String(summary.postsCount)
        );

  return (
    <tr
      className={`group hover:bg-boxHover transition-colors ${
        isLast ? '' : 'border-b border-fifth'
      }`}
    >
      <td className="px-[16px] py-[14px]">
        <div className="flex items-center gap-[10px]">
          <button
            type="button"
            onClick={onToggle}
            disabled={isToggleDisabled}
            role="switch"
            aria-checked={isActive}
            aria-label={
              isActive
                ? t('flow_toggle_pause', 'Pausar automação')
                : t('flow_toggle_activate', 'Ativar automação')
            }
            className="relative inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: isActive ? '#22c55e' : '#52525b',
            }}
          >
            <span
              className={`pointer-events-none absolute top-[2px] left-[2px] inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
                isActive ? 'translate-x-[20px]' : 'translate-x-0'
              }`}
            />
          </button>
          <span
            className="rounded-[4px] px-[8px] py-[2px] text-[10px] font-medium"
            style={{
              backgroundColor: badgeStyle.bg,
              color: badgeStyle.color,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </td>

      <td className="px-[16px] py-[14px]">
        <button
          type="button"
          onClick={onEdit}
          className="text-left hover:underline"
        >
          <div className="text-[13px] font-medium text-textColor truncate max-w-[360px]">
            {flow.name}
          </div>
          <div className="text-[11px] text-customColor18 mt-[2px] truncate max-w-[360px]">
            {keywordsPart}
            <span className="mx-[6px] text-customColor19">•</span>
            {postsPart}
          </div>
        </button>
      </td>

      <td className="px-[16px] py-[14px]">
        {flow.shared ? (
          <div className="space-y-2">
            {flow.shared.channels.map((c) => (
              <div
                key={c.integrationId}
                className="flex items-center gap-2 text-xs"
              >
                <PlatformIconBadge identifier={c.platform} size={24} />
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        ) : integration ? (
          <div className="flex items-center gap-[10px]">
            <PlatformIconBadge
              identifier={integration.providerIdentifier}
              size={32}
              zernioBadgeSize={15}
              zernioBadgeRadius={15}
            />
            <span className="text-[12px] text-textColor truncate max-w-[180px]">
              {integration.name}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-customColor19">
            {t('flow_account_missing', 'Conta removida')}
          </span>
        )}
      </td>

      <td className="px-[16px] py-[14px]">
        {flow.shared ? (
          <a
            className="text-sm underline"
            href={`/automations/${flow.id}?tab=history`}
          >
            {t('show_history')}
          </a>
        ) : (
          <span className="text-[14px] font-semibold text-textColor">
            {execCount}
          </span>
        )}
      </td>

      <td className="px-[16px] py-[14px] whitespace-nowrap">
        <div className="flex items-center justify-end gap-[8px]">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-[6px] rounded-[4px] border border-newTableBorder bg-newBgColorInner px-[10px] py-[6px] text-[12px] text-textColor hover:bg-boxHover"
          >
            {t('flow_action_edit', 'Editar')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title={
              flow.shared
                ? t('shared_archive')
                : t('flow_action_delete', 'Excluir')
            }
            className="inline-flex items-center gap-[6px] rounded-[4px] border border-[#ef4444]/50 bg-transparent px-[10px] py-[6px] text-[12px] text-[#ef4444] hover:bg-[#ef4444]/10"
          >
            {flow.shared
              ? t('shared_archive')
              : t('flow_action_delete', 'Excluir')}
          </button>
        </div>
      </td>
    </tr>
  );
};
