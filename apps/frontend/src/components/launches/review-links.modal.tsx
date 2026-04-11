'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import dayjs from 'dayjs';

type ReviewLinkRow = {
  id: string;
  allowComment: boolean;
  allowApprove: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string };
  _count: { comments: number };
};

function buildShareUrl(postId: string, token: string) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/p/${postId}?token=${token}`;
}

export const ReviewLinksModal: FC<{ postId: string; close?: () => void }> = ({
  postId,
  close,
}) => {
  const fetch = useFetch();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [allowComment, setAllowComment] = useState(true);
  const [allowApprove, setAllowApprove] = useState(true);
  const [justCreated, setJustCreated] = useState<{
    id: string;
    url: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loader = useCallback(async () => {
    return (await fetch(`/posts/${postId}/review-links`)).json();
  }, [postId]);
  const { data, mutate, isLoading } = useSWR(
    `review-links-${postId}`,
    loader
  );

  const links: ReviewLinkRow[] = useMemo(
    () => data?.reviewLinks || [],
    [data]
  );

  const create = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/posts/${postId}/review-links`, {
        method: 'POST',
        body: JSON.stringify({
          expiresInDays,
          allowComment,
          allowApprove,
        }),
      });
      if (!res.ok) {
        setError(t('request_failed', 'Request failed. Try again.'));
        return;
      }
      const payload = await res.json();
      setJustCreated({
        id: payload.id,
        url: buildShareUrl(postId, payload.token),
      });
      mutate();
    } catch {
      setError(t('request_failed', 'Request failed. Try again.'));
    } finally {
      setCreating(false);
    }
  }, [postId, expiresInDays, allowComment, allowApprove, mutate, t]);

  const copy = useCallback(async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [justCreated]);

  const revoke = useCallback(
    async (linkId: string) => {
      const confirmed = window.confirm(
        t(
          'confirm_revoke_review_link',
          'Revoke this review link? This cannot be undone.'
        )
      );
      if (!confirmed) return;
      const res = await fetch(
        `/posts/${postId}/review-links/${linkId}`,
        { method: 'DELETE' }
      );
      if (res.ok) mutate();
    },
    [postId, mutate, t]
  );

  return (
    <div className="p-5 text-white bg-newBgColorInner w-[600px] max-w-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t('client_review_links', 'Client review links')}
        </h2>
        {close && (
          <button
            type="button"
            className="text-gray-400 hover:text-white text-sm"
            onClick={close}
          >
            {t('close', 'Close')}
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400">
        {t(
          'client_review_links_help',
          'Generate a link to share this post with a client. They can comment or approve without signing in.'
        )}
      </p>

      <div className="border border-tableBorder rounded p-3 space-y-3 bg-third">
        <h3 className="text-sm font-semibold">
          {t('generate_new_link', 'Generate new link')}
        </h3>
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <label className="flex items-center gap-2">
            {t('expires_in_days', 'Expires in (days)')}
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) =>
                setExpiresInDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))
              }
              className="w-20 px-2 py-1 bg-black border border-tableBorder"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowComment}
              onChange={(e) => setAllowComment(e.target.checked)}
            />
            {t('allow_comments', 'Allow comments')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowApprove}
              onChange={(e) => setAllowApprove(e.target.checked)}
            />
            {t('allow_approve', 'Allow approve')}
          </label>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={create}
            loading={creating}
            disabled={!allowComment && !allowApprove}
          >
            {t('generate_link', 'Generate link')}
          </Button>
        </div>
        {justCreated && (
          <div className="border border-green-700 bg-green-900/20 rounded p-2 space-y-2">
            <p className="text-xs text-green-200">
              {t(
                'review_link_generated_once',
                'Save this URL now — the token is shown only once.'
              )}
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                readOnly
                value={justCreated.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 text-xs px-2 py-1 bg-black border border-tableBorder"
              />
              <Button type="button" onClick={copy}>
                {copied ? t('copied', 'Copied') : t('copy', 'Copy')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t('active_links', 'Active links')}
        </h3>
        {isLoading && (
          <p className="text-xs text-gray-400">{t('loading', 'Loading...')}</p>
        )}
        {!isLoading && !links.length && (
          <p className="text-xs text-gray-400">
            {t('no_review_links', 'No review links yet.')}
          </p>
        )}
        {links.map((link) => {
          const isRevoked = !!link.revokedAt;
          const isExpired =
            !!link.expiresAt && dayjs(link.expiresAt).isBefore(dayjs());
          const statusLabel = isRevoked
            ? t('revoked', 'Revoked')
            : isExpired
            ? t('expired', 'Expired')
            : t('active', 'Active');
          return (
            <div
              key={link.id}
              className="border border-tableBorder rounded p-2 text-xs flex flex-wrap items-center gap-3 bg-third"
            >
              <span
                className={`uppercase px-1 rounded ${
                  isRevoked || isExpired
                    ? 'bg-gray-700 text-gray-300'
                    : 'bg-green-900 text-green-200'
                }`}
              >
                {statusLabel}
              </span>
              <span className="text-gray-400">
                {t('created', 'Created')}:{' '}
                {dayjs(link.createdAt).format('YYYY-MM-DD HH:mm')}
              </span>
              {link.expiresAt && (
                <span className="text-gray-400">
                  {t('expires', 'Expires')}:{' '}
                  {dayjs(link.expiresAt).format('YYYY-MM-DD HH:mm')}
                </span>
              )}
              <span className="text-gray-400">
                {t('interactions', 'Interactions')}: {link._count.comments}
              </span>
              <span className="text-gray-400 flex gap-1">
                {link.allowComment && (
                  <span className="px-1 border border-tableBorder rounded">
                    {t('comments', 'Comments')}
                  </span>
                )}
                {link.allowApprove && (
                  <span className="px-1 border border-tableBorder rounded">
                    {t('approve', 'Approve')}
                  </span>
                )}
              </span>
              {!isRevoked && !isExpired && (
                <button
                  type="button"
                  onClick={() => revoke(link.id)}
                  className="ml-auto text-red-400 hover:text-red-300"
                >
                  {t('revoke', 'Revoke')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
