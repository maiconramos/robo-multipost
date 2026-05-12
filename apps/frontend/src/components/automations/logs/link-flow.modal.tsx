'use client';

import { FC, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFlows } from '@gitroom/frontend/components/automations/hooks/use-flows';
import {
  createInboxActions,
  useAliasLookup,
  type UnmatchedCommentItem,
} from '../hooks/use-unmatched-comments';

interface FlowSummary {
  id: string;
  name: string;
  integrationId: string;
  status: string;
  nodes?: Array<{
    id: string;
    type: string;
    label?: string | null;
    data?: string | null;
  }>;
}

interface LinkFlowModalProps {
  comment: UnmatchedCommentItem;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

const isCommentOnPost = (flow: FlowSummary) => {
  // /flows endpoint nao retorna `label` no select de TRIGGER node (so id/type/data),
  // entao o tipo eh derivado exclusivamente de trigger.data.triggerType.
  const trigger = flow.nodes?.find((n) => n.type === 'TRIGGER');
  if (!trigger) return true;
  if (trigger.data) {
    try {
      const parsed = JSON.parse(trigger.data);
      return parsed?.triggerType !== 'story_reply';
    } catch {
      return true;
    }
  }
  return true;
};

export const LinkFlowModal: FC<LinkFlowModalProps> = ({
  comment,
  onClose,
  onSuccess,
}) => {
  const t = useT();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: flows, isLoading } = useFlows() as {
    data: FlowSummary[] | undefined;
    isLoading: boolean;
  };

  const { data: alreadyBound } = useAliasLookup(
    comment.integrationId,
    comment.igMediaId
  );

  const candidateFlows = useMemo(
    () =>
      (flows ?? []).filter(
        (f) =>
          f.integrationId === comment.integrationId &&
          // Apenas flows ACTIVE — flows DRAFT/PAUSED nao disparam mesmo
          // com alias criado, confundindo o usuario (parece vinculado mas
          // nao funciona ate ativar). Usuario precisa ativar o flow antes
          // de vincular um comentario orfao.
          f.status === 'ACTIVE' &&
          isCommentOnPost(f)
      ),
    [flows, comment.integrationId]
  );

  const actions = useMemo(
    () => createInboxActions(fetchApi),
    [fetchApi]
  );

  const handleBind = async () => {
    if (!selectedFlowId) return;
    setSubmitting(true);
    try {
      await actions.bind(comment.id, selectedFlowId);
      toaster.show(
        t('logs_bind_success', 'Comment linked to automation'),
        'success'
      );
      await onSuccess();
      onClose();
    } catch (e: any) {
      const detail = e?.detail?.message ?? e?.message ?? '';
      toaster.show(
        detail || t('logs_bind_failed', 'Failed to link'),
        'warning'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const translateStatus = (s: string) => {
    switch (s) {
      case 'ACTIVE':
        return t('flow_status_active', 'Active');
      case 'DRAFT':
        return t('flow_status_draft', 'Draft');
      case 'PAUSED':
        return t('flow_status_paused', 'Paused');
      case 'ARCHIVED':
        return t('flow_status_archived', 'Archived');
      default:
        return s;
    }
  };

  const statusBadgeClass = (s: string) => {
    switch (s) {
      case 'ACTIVE':
        return 'bg-green-500/15 text-green-400 border-green-500/30';
      case 'DRAFT':
        return 'bg-customColor18/15 text-customColor18 border-fifth';
      case 'PAUSED':
        return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
      case 'ARCHIVED':
        return 'bg-customColor18/10 text-customColor18 border-fifth';
      default:
        return 'bg-newBgColorInner text-customColor18 border-fifth';
    }
  };

  return (
    <div className="flex flex-col gap-[16px] p-[20px] w-[480px] max-w-full">
      {/* Comentário em destaque */}
      <div className="rounded-[8px] border border-fifth p-[12px] bg-newBgColorInner">
        <div className="flex items-center justify-between mb-[6px]">
          <span className="text-[11px] uppercase tracking-wide text-customColor18 font-medium">
            {t('logs_comment_preview_label', 'Comentário')}
          </span>
          {comment.permalink && (
            <a
              href={comment.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-btnPrimary hover:underline inline-flex items-center gap-[4px]"
            >
              {t('logs_open_post', 'Abrir no Instagram')}
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          )}
        </div>
        <p className="text-[14px] text-textColor leading-snug">
          <span className="font-semibold">
            @{comment.igCommenterName ?? comment.igCommenterId}:
          </span>{' '}
          {comment.commentText}
        </p>
      </div>

      {/* Aviso de já-vinculado */}
      {alreadyBound && alreadyBound.length > 0 && (
        <div className="rounded-[8px] border border-orange-500/40 p-[10px] bg-orange-500/10 flex gap-[8px] items-start">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-orange-400 flex-shrink-0 mt-[1px]"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[12px] text-orange-300 leading-snug">
            {t(
              'logs_already_bound_warning',
              'Este post já está vinculado a {{name}}'
            ).replace(
              '{{name}}',
              alreadyBound.map((b) => b.flow.name).join(', ')
            )}
          </p>
        </div>
      )}

      {/* Lista de flows */}
      <div className="flex flex-col gap-[8px]">
        <label className="block text-[13px] text-textColor font-medium">
          {t('logs_bind_modal_choose_flow', 'Escolha uma automação')}
        </label>
        {isLoading && (
          <p className="text-[12px] text-customColor18 py-[20px] text-center">
            {t('loading', 'Carregando...')}
          </p>
        )}
        {!isLoading && candidateFlows.length === 0 && (
          <div className="text-[12px] text-customColor18 py-[20px] text-center border border-dashed border-fifth rounded-[8px]">
            {t(
              'logs_no_compatible_flows',
              'Nenhuma automação compatível encontrada nesta conta.'
            )}
          </div>
        )}
        {!isLoading && candidateFlows.length > 0 && (
          <div className="max-h-[260px] overflow-y-auto flex flex-col gap-[6px] pr-[2px]">
            {candidateFlows.map((flow) => {
              const isSelected = selectedFlowId === flow.id;
              return (
                <label
                  key={flow.id}
                  className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[6px] cursor-pointer border transition-colors ${
                    isSelected
                      ? 'border-btnPrimary bg-btnPrimary/5'
                      : 'border-fifth hover:border-btnPrimary/50 bg-sixth'
                  }`}
                >
                  <input
                    type="radio"
                    checked={isSelected}
                    onChange={() => setSelectedFlowId(flow.id)}
                    className="accent-btnPrimary"
                  />
                  <span className="text-[13px] text-textColor flex-1 truncate">
                    {flow.name}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-semibold px-[8px] py-[2px] rounded-[4px] border ${statusBadgeClass(
                      flow.status
                    )}`}
                  >
                    {translateStatus(flow.status)}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-[8px] pt-[4px] border-t border-fifth -mx-[20px] px-[20px] pt-[16px] mt-[4px]">
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] px-[16px] py-[8px] rounded-[4px] border border-fifth bg-sixth text-textColor hover:border-btnPrimary/50 transition-colors"
        >
          {t('cancel', 'Cancelar')}
        </button>
        <button
          type="button"
          onClick={handleBind}
          disabled={!selectedFlowId || submitting}
          className="text-[13px] px-[16px] py-[8px] rounded-[4px] bg-btnPrimary text-white hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting
            ? t('logs_binding', 'Vinculando...')
            : t('logs_action_bind', 'Vincular')}
        </button>
      </div>
    </div>
  );
};
