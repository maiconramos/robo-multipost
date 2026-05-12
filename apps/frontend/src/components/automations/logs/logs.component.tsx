'use client';

import { FC, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  createInboxActions,
  useInbox,
  type UnmatchedCommentItem,
  type UnmatchedStatus,
} from '../hooks/use-unmatched-comments';
import { LinkFlowModal } from './link-flow.modal';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useRouter } from 'next/navigation';

interface Integration {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
}

const isInstagram = (i: Integration) =>
  i.identifier === 'instagram' || i.identifier === 'instagram-standalone';

const formatRelative = (iso: string, t: ReturnType<typeof useT>) => {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return t('logs_just_now', 'just now');
  if (minutes < 60)
    return t('logs_minutes_ago', '{{n}} min ago').replace(
      '{{n}}',
      String(minutes)
    );
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return t('logs_hours_ago', '{{n}}h ago').replace('{{n}}', String(hours));
  const days = Math.floor(hours / 24);
  return t('logs_days_ago', '{{n}}d ago').replace('{{n}}', String(days));
};

interface ItemRowProps {
  comment: UnmatchedCommentItem;
  onBind: () => void;
  onIgnore: () => void;
}

const ItemRow: FC<ItemRowProps> = ({ comment, onBind, onIgnore }) => {
  const t = useT();
  return (
    <div className="flex gap-[12px] p-[16px] rounded-[8px] border border-fifth bg-sixth hover:border-btnPrimary/40 transition-colors min-w-0 w-full">
      <div className="w-[80px] h-[80px] rounded-[6px] bg-newBgColorInner flex-shrink-0 overflow-hidden flex items-center justify-center border border-fifth">
        {comment.thumbnailUrl ? (
          <SafeImage
            src={comment.thumbnailUrl}
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[10px] text-customColor18 text-center px-[6px]">
            {comment.enrichmentError
              ? t('logs_no_metadata_error', 'Metadata unavailable')
              : t('logs_no_metadata', 'Loading...')}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-[8px] mb-[6px]">
          {comment.isAd && (
            <span className="text-[10px] uppercase font-semibold px-[8px] py-[2px] rounded-[4px] bg-orange-500/20 text-orange-300 border border-orange-500/30">
              {t('logs_ad_badge', 'Ad')}
            </span>
          )}
          <span className="text-[12px] text-customColor18">
            {formatRelative(comment.createdAt, t)}
          </span>
        </div>
        {comment.caption && (
          <p
            className="text-[12px] text-customColor18 mb-[6px] italic overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
            }}
          >
            {comment.caption}
          </p>
        )}
        <p
          className="text-[14px] text-textColor mb-[6px] leading-snug overflow-hidden break-words"
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
          }}
        >
          <span className="font-semibold">
            @{comment.igCommenterName ?? comment.igCommenterId}:
          </span>{' '}
          {comment.commentText}
        </p>
        {comment.permalink && (
          <a
            href={comment.permalink}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-btnPrimary hover:underline inline-flex items-center gap-[4px]"
          >
            {t('logs_open_post', 'Open post')}
            <svg
              width="12"
              height="12"
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
      <div className="flex flex-col gap-[8px] flex-shrink-0">
        <button
          type="button"
          onClick={onBind}
          className="text-[13px] px-[14px] py-[6px] rounded-[4px] bg-btnPrimary text-white hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          {t('logs_action_bind', 'Link')}
        </button>
        <button
          type="button"
          onClick={onIgnore}
          className="text-[13px] px-[14px] py-[6px] rounded-[4px] border border-fifth text-textColor hover:border-btnPrimary/50 transition-colors whitespace-nowrap"
        >
          {t('logs_action_ignore', 'Ignore')}
        </button>
      </div>
    </div>
  );
};

export const LogsComponent: FC = () => {
  const t = useT();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const modals = useModals();
  const router = useRouter();

  const { data: integrations } = useIntegrationList();
  const igIntegrations = useMemo<Integration[]>(
    () => (integrations ?? []).filter(isInstagram),
    [integrations]
  );

  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [status, setStatus] = useState<UnmatchedStatus>('PENDING');
  const [page, setPage] = useState(1);

  const effectiveIntegrationId =
    integrationId ?? igIntegrations[0]?.id ?? null;

  const {
    data: inbox,
    isLoading,
    mutate,
  } = useInbox(effectiveIntegrationId, status, page, 20);

  const actions = useMemo(
    () =>
      createInboxActions(fetchApi, {
        mutateInbox: () => mutate(),
      }),
    [fetchApi, mutate]
  );

  const openBindModal = (comment: UnmatchedCommentItem) => {
    modals.openModal({
      title: t('logs_bind_modal_title', 'Link comment to an automation'),
      withCloseButton: true,
      closeOnEscape: true,
      children: (close: () => void) => (
        <LinkFlowModal
          comment={comment}
          onClose={close}
          onSuccess={async () => {
            await mutate();
          }}
        />
      ),
    });
  };

  const handleIgnore = async (comment: UnmatchedCommentItem) => {
    if (
      !confirm(
        t(
          'logs_ignore_confirm',
          'Ignore this post forever? Future comments on it will not appear in Logs.'
        )
      )
    ) {
      return;
    }
    try {
      await actions.ignore(comment.id);
      toaster.show(
        t('logs_ignore_success', 'Post added to ignore list'),
        'success'
      );
    } catch (e: any) {
      toaster.show(
        e?.message || t('logs_ignore_failed', 'Failed to ignore'),
        'warning'
      );
    }
  };

  return (
    <div className="flex flex-col gap-[16px] p-[24px] flex-1 min-w-0">
      <div className="flex items-center gap-[12px]">
        <button
          type="button"
          onClick={() => router.push('/automacoes')}
          aria-label={t('back', 'Voltar')}
          className="text-customColor18 hover:text-textColor text-[18px]"
        >
          &larr;
        </button>
        <div>
          <h1 className="text-[20px] font-semibold text-textColor">
            {t('logs_title', 'Logs de comentários')}
          </h1>
          <p className="text-[14px] text-customColor18 mt-[4px]">
            {t(
              'logs_description',
              'Comments on media not yet monitored by any automation — typical of dark posts (the hidden copy Meta Ads creates from organic posts, with a different media_id).'
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-[12px] items-center bg-sixth border border-fifth rounded-[8px] p-[12px]">
        {igIntegrations.length === 0 ? (
          <p className="text-[13px] text-customColor18">
            {t(
              'logs_no_ig_integration',
              'No Instagram account connected. Connect one in Channels first.'
            )}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-[8px]">
              <span className="text-[13px] text-customColor18">
                {t('logs_account_label', 'Conta')}:
              </span>
              <div className="flex items-center gap-[6px] flex-wrap">
                {igIntegrations.map((i) => {
                  const active = effectiveIntegrationId === i.id;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => {
                        setIntegrationId(i.id);
                        setPage(1);
                      }}
                      className={`flex items-center gap-[6px] px-[10px] py-[5px] rounded-[4px] border text-[13px] transition-colors ${
                        active
                          ? 'border-btnPrimary bg-btnPrimary/10 text-textColor'
                          : 'border-fifth bg-newBgColorInner text-customColor18 hover:border-btnPrimary/40'
                      }`}
                    >
                      {i.picture && (
                        <img
                          src={i.picture}
                          alt=""
                          className="w-[20px] h-[20px] rounded-full object-cover"
                        />
                      )}
                      <span>{i.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ml-auto flex gap-[6px]">
              {(['PENDING', 'BOUND', 'IGNORED'] as UnmatchedStatus[]).map((s) => {
                const active = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatus(s);
                      setPage(1);
                    }}
                    className={`text-[13px] px-[12px] py-[5px] rounded-[4px] border transition-colors ${
                      active
                        ? 'border-btnPrimary bg-btnPrimary/10 text-textColor'
                        : 'border-fifth bg-newBgColorInner text-customColor18 hover:border-btnPrimary/40'
                    }`}
                  >
                    {s === 'PENDING' && t('logs_status_pending', 'Pendentes')}
                    {s === 'BOUND' && t('logs_status_bound', 'Vinculados')}
                    {s === 'IGNORED' && t('logs_status_ignored', 'Ignorados')}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-[40px]">
          <p className="text-[13px] text-customColor18">
            {t('loading', 'Carregando...')}
          </p>
        </div>
      )}

      {!isLoading && inbox && inbox.items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-[64px] text-customColor18 border border-fifth rounded-[8px] bg-sixth">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mb-[12px] opacity-50"
          >
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          <p className="text-[14px]">
            {t('logs_empty', 'Nenhum comentário nesta categoria.')}
          </p>
        </div>
      )}

      {!isLoading && inbox && inbox.items.length > 0 && (
        <div className="flex flex-col gap-[12px] min-w-0">
          {inbox.items.map((c) => (
            <ItemRow
              key={c.id}
              comment={c}
              onBind={() => openBindModal(c)}
              onIgnore={() => handleIgnore(c)}
            />
          ))}
        </div>
      )}

      {inbox && inbox.total > inbox.limit && (
        <div className="flex justify-center items-center gap-[12px] mt-[8px]">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="text-[13px] px-[12px] py-[6px] rounded-[4px] border border-fifth bg-sixth text-textColor hover:border-btnPrimary/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('previous', 'Anterior')}
          </button>
          <span className="text-[13px] text-customColor18">
            {t('pagination_page', 'Página')} {page} /{' '}
            {Math.max(1, Math.ceil(inbox.total / inbox.limit))}
          </span>
          <button
            type="button"
            disabled={inbox.items.length < inbox.limit}
            onClick={() => setPage(page + 1)}
            className="text-[13px] px-[12px] py-[6px] rounded-[4px] border border-fifth bg-sixth text-textColor hover:border-btnPrimary/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('next', 'Próxima')}
          </button>
        </div>
      )}
    </div>
  );
};
