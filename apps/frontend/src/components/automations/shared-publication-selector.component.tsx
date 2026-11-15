'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import {
  selectedPublicationPreviews,
  isPublishedScheduledPreview,
} from './shared-publication-preview';
import { useSharedFlowData } from './hooks/use-shared-flows';
import type {
  AutomationPostMode,
  ScheduledAutomationPostView,
  ScheduledAutomationPostsView,
} from '@gitroom/nestjs-libraries/dtos/flows/scheduled-post.dto';
export interface PublicationChoice {
  mode: AutomationPostMode;
  postIds: string[];
  scheduledPostId?: string;
}
export interface PublicationPreview {
  id: string;
  permalink?: string;
  caption?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp?: string;
  isPublished?: boolean;
  locatedById?: boolean;
}
export function AutomationPublicationSelector({
  integrationId,
  platform = 'instagram',
  mode,
  postIds,
  scheduledPostId,
  posts,
  onChange,
  disabled = false,
  loading = false,
  error = false,
  onRetry,
  onLoadMore,
  loadingMore = false,
  onPreviewChange,
  specificContent,
  showSpecificContentWhenScheduled = false,
  scopeNote,
  scheduledEnabled = true,
  allowNext = true,
  maxSpecificPosts = 100,
}: PublicationChoice & {
  integrationId: string;
  platform?: 'instagram' | 'facebook';
  posts: PublicationPreview[];
  onChange: (value: PublicationChoice) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  onPreviewChange?: (posts: PublicationPreview[]) => void;
  specificContent?: ReactNode;
  showSpecificContentWhenScheduled?: boolean;
  scopeNote?: ReactNode;
  scheduledEnabled?: boolean;
  allowNext?: boolean;
  maxSpecificPosts?: number;
}) {
  const t = useT();
  const { resolvedLanguage } = useTranslationSettings();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const lastSelection = useRef<
    | {
        integrationId: string;
        choice: PublicationChoice;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    if (lastSelection.current?.integrationId !== integrationId)
      lastSelection.current = undefined;
    if (mode === 'specific' || mode === 'scheduled')
      lastSelection.current = {
        integrationId,
        choice: {
          mode,
          postIds: [...postIds],
          ...(scheduledPostId ? { scheduledPostId } : {}),
        },
      };
  }, [integrationId, mode, postIds, scheduledPostId]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledAutomationPostView[]>([]);
  const query = new URLSearchParams({
    ...(cursor ? { cursor } : {}),
    ...(scheduledPostId ? { selectedId: scheduledPostId } : {}),
  });
  const result = useSharedFlowData<ScheduledAutomationPostsView>(
    integrationId && scheduledEnabled
      ? `/automation-scheduled-posts/${integrationId}?${query}`
      : null
  );
  useEffect(() => {
    setScheduled([]);
    setCursor(null);
    setOpen(false);
  }, [integrationId]);
  useEffect(() => {
    if (result.data?.posts)
      setScheduled((old) => {
        const next = [
          ...new Map(
            [
              ...(cursor ? old : []),
              ...result.data!.posts,
              ...(result.data!.selected ? [result.data!.selected] : []),
            ].map((p) => [p.id, p])
          ).values(),
        ];
        return JSON.stringify(next) === JSON.stringify(old) ? old : next;
      });
  }, [result.data, cursor]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]'
        ) || []
      );
    controls()[0]?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        const items = controls(),
          first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('keydown', close);
      previous?.focus();
    };
  }, [open]);
  const previewItems = selectedPublicationPreviews(
    { mode, postIds, scheduledPostId },
    posts,
    scheduled
  );
  const previewSignature = JSON.stringify([integrationId, previewItems]);
  const notifiedPreview = useRef('');
  useEffect(() => {
    if (onPreviewChange && notifiedPreview.current !== previewSignature) {
      notifiedPreview.current = previewSignature;
      onPreviewChange(previewItems);
    }
  }, [previewSignature, onPreviewChange]);
  const choices = [
    ...scheduled.map((p) => ({
      ...p,
      scheduled: true,
      isPublished: undefined as boolean | undefined,
      locatedById: undefined as boolean | undefined,
      timestamp: p.publishDate,
    })),
    ...posts
      .filter(
        (p) =>
          (mode === 'specific' && postIds.includes(p.id)) ||
          !scheduled.some((s) => isPublishedScheduledPreview(s, p, platform))
      )
      .map((p) => ({ ...p, scheduled: false, status: undefined })),
  ];
  const selected = (p: (typeof choices)[number]) =>
    p.scheduled
      ? mode === 'scheduled' && scheduledPostId === p.id
      : mode === 'specific' && postIds.includes(p.id);
  const visible = [...choices]
    .sort((a, b) => Number(selected(b)) - Number(selected(a)))
    .slice(0, 4);
  const isChoiceDisabled = (p: (typeof choices)[number]) =>
    disabled ||
    (!p.scheduled &&
      postIds.length >= maxSpecificPosts &&
      !postIds.includes(p.id)) ||
    (p.scheduled && p.status !== 'waiting' && p.id !== scheduledPostId);
  const choose = (p: (typeof choices)[number]) => {
    if (isChoiceDisabled(p)) return;
    if (p.scheduled)
      onChange({ mode: 'scheduled', postIds: [], scheduledPostId: p.id });
    else {
      const ids = mode === 'specific' ? postIds : [];
      onChange({
        mode: 'specific',
        postIds: ids.includes(p.id)
          ? ids.filter((id) => id !== p.id)
          : [...ids, p.id].slice(0, maxSpecificPosts),
      });
    }
  };
  const thumbnail = (p: (typeof choices)[number]) => (
    <>
      {p.thumbnailUrl || p.mediaUrl ? (
        p.mediaType === 'VIDEO' && !p.thumbnailUrl ? (
          <video
            src={`${p.mediaUrl}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={p.thumbnailUrl || p.mediaUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <span className="text-[11px] text-newTextColor/60 p-2">
          {t('shared_post_no_image')}
        </span>
      )}
      {p.scheduled && p.status === 'waiting' && (
        <span className="absolute left-1 top-1 rounded bg-newBgColorInner px-1.5 py-0.5 text-[10px] font-medium text-textColor shadow-sm">
          {t('scheduled_badge')}
        </span>
      )}
      {platform === 'facebook' &&
        !p.scheduled &&
        (p.isPublished === false || p.locatedById) && (
          <span className="absolute left-1 top-1 max-w-[calc(100%-8px)] truncate rounded bg-newBgColorInner px-1.5 py-0.5 text-[10px] font-medium text-textColor shadow-sm">
            {t(
              p.isPublished === false
                ? 'fb_post_dark_badge'
                : 'fb_post_by_id_badge'
            )}
          </span>
        )}
      {selected(p) && (
        <span
          className="absolute bottom-1 right-1 rounded-full bg-btnPrimary text-white px-1.5"
          aria-hidden="true"
        >
          ✓
        </span>
      )}
    </>
  );
  const scoped = mode === 'specific' || mode === 'scheduled';
  const radio = (value: AutomationPostMode, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer text-[13px]">
      <input
        type="radio"
        className="accent-btnPrimary h-4 w-4"
        disabled={disabled}
        checked={value === 'specific' ? scoped : mode === value}
        onChange={() => {
          const previous = lastSelection.current;
          onChange(
            value === 'specific' && previous?.integrationId === integrationId
              ? { ...previous.choice, postIds: [...previous.choice.postIds] }
              : { mode: value, postIds: [] }
          );
        }}
      />
      {label}
    </label>
  );
  return (
    <div className="space-y-2">
      <div
        className={`rounded-lg border p-3 ${
          scoped ? 'border-btnPrimary bg-btnPrimary/5' : 'border-newTableBorder'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          {radio(
            'specific',
            t(
              platform === 'facebook'
                ? 'automation_facebook_specific_post'
                : 'wizard_specific_post'
            )
          )}
          {scoped && (
            <button
              type="button"
              disabled={disabled}
              aria-label={t('automation_select_publications')}
              title={t('automation_select_publications')}
              onClick={() => {
                setCursor(null);
                void result.mutate();
                setOpen(true);
              }}
              className="shrink-0 rounded-md p-1.5 hover:bg-boxHover focus-visible:ring-2 focus-visible:ring-btnPrimary disabled:opacity-40"
            >
              <svg
                aria-hidden="true"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
              </svg>
            </button>
          )}
        </div>
        {scoped && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {visible.map((p) => (
                <button
                  type="button"
                  key={`${p.scheduled}:${p.id}`}
                  disabled={isChoiceDisabled(p)}
                  aria-label={p.caption || t('shared_post_no_caption')}
                  aria-pressed={selected(p)}
                  onClick={() => choose(p)}
                  className={`relative aspect-square rounded-md overflow-hidden border-2 bg-boxHover flex items-center justify-center ${
                    selected(p) ? 'border-btnPrimary' : 'border-transparent'
                  }`}
                >
                  {thumbnail(p)}
                  <span className="sr-only">
                    {p.caption || t('shared_post_no_caption')}
                  </span>
                </button>
              ))}
            </div>

            {mode === 'scheduled' &&
              scheduled.find((p) => p.id === scheduledPostId)?.status !==
                'published' && (
                <p role="status" className="text-xs text-newTextColor/70">
                  {t(
                    `scheduled_status_${
                      scheduled.find((p) => p.id === scheduledPostId)?.status ||
                      'unavailable'
                    }`
                  )}
                </p>
              )}
            {postIds.length >= maxSpecificPosts && (
              <p role="status" className="text-xs text-newTextColor/60">
                {t('shared_posts_limit')}
              </p>
            )}
            {(mode === 'specific' || showSpecificContentWhenScheduled) &&
              specificContent}
          </div>
        )}
      </div>
      <div
        className={`rounded-lg border p-3 ${
          mode === 'all'
            ? 'border-btnPrimary bg-btnPrimary/5'
            : 'border-newTableBorder'
        }`}
      >
        {radio(
          'all',
          t(
            platform === 'facebook'
              ? 'automation_facebook_all_posts'
              : 'wizard_all_posts'
          )
        )}
        {mode === 'all' && scopeNote && (
          <p className="mt-2 text-xs text-newTextColor/70">{scopeNote}</p>
        )}
      </div>
      {allowNext && (
        <div
          className={`rounded-lg border p-3 ${
            mode === 'next_publication'
              ? 'border-btnPrimary bg-btnPrimary/5'
              : 'border-newTableBorder'
          }`}
        >
          {radio('next_publication', t('wizard_next_publication'))}
          {mode === 'next_publication' && scopeNote && (
            <p className="mt-2 text-xs text-newTextColor/70">{scopeNote}</p>
          )}
          {mode === 'next_publication' && (
            <p className="text-[11px] text-newTextColor/60 mt-2 ml-6">
              {t('automation_next_unreserved_hint')}
            </p>
          )}
        </div>
      )}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('automation_select_publications')}
            className="bg-newBgColorInner border border-newTableBorder rounded-xl w-full max-w-[700px] max-h-[80dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-newTableBorder flex justify-between items-center">
              <h3 className="text-base font-semibold">
                {t('automation_select_publications')}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('close')}
                className="p-2"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-auto space-y-3">
              {(loading || result.isLoading) && (
                <p role="status" className="text-sm">
                  {t('shared_posts_loading')}
                </p>
              )}
              {(error || result.error) && (
                <div role="alert" className="text-sm">
                  <p>{t('shared_posts_error')}</p>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      onRetry?.();
                      void result.mutate();
                    }}
                  >
                    {t('fb_auto_retry')}
                  </button>
                </div>
              )}
              {!choices.length &&
                !loading &&
                !result.isLoading &&
                !error &&
                !result.error && (
                  <p className="text-sm">{t('shared_posts_empty')}</p>
                )}
              <div className="grid grid-cols-3 gap-2.5">
                {choices.map((p) => (
                  <button
                    type="button"
                    key={`${p.scheduled}:${p.id}`}
                    disabled={isChoiceDisabled(p)}
                    aria-label={p.caption || t('shared_post_no_caption')}
                    aria-pressed={selected(p)}
                    onClick={() => choose(p)}
                    className={`text-left rounded-lg border-2 overflow-hidden disabled:opacity-60 ${
                      selected(p) ? 'border-btnPrimary' : 'border-transparent'
                    }`}
                  >
                    <div className="relative aspect-square bg-boxHover flex items-center justify-center">
                      {thumbnail(p)}
                    </div>
                    <div className="p-2">
                      <p className="text-xs line-clamp-2">
                        {p.caption || t('shared_post_no_caption')}
                      </p>
                      {p.timestamp && (
                        <time
                          className="block mt-2 text-[11px] text-newTextColor/60"
                          dateTime={p.timestamp}
                        >
                          {new Date(p.timestamp).toLocaleString(
                            resolvedLanguage === 'pt'
                              ? 'pt-BR'
                              : resolvedLanguage
                          )}
                        </time>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {(onLoadMore || result.data?.nextCursor) && (
                <button
                  type="button"
                  disabled={loadingMore || result.isLoading}
                  className="text-sm text-btnPrimary"
                  onClick={() => {
                    onLoadMore?.();
                    if (result.data?.nextCursor)
                      setCursor(result.data.nextCursor);
                  }}
                >
                  {t('shared_more_posts')}
                </button>
              )}
            </div>
            <div className="border-t border-newTableBorder p-4 space-y-3">
              {scheduledEnabled && (
                <p className="text-xs text-newTextColor/60">
                  {t('automation_scheduled_exclusive_hint')}
                </p>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-btnPrimary text-white px-4 py-2 rounded-lg text-sm"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
