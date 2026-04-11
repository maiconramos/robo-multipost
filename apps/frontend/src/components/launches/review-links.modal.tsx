'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

type LatestAction = {
  kind: 'APPROVAL' | 'CHANGE_REQUEST';
  createdAt: string;
  guestName: string | null;
};

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
  comments: LatestAction[];
};

const BR_DATE = 'DD/MM/YYYY HH:mm';

function buildShareUrl(postId: string, token: string) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/p/${postId}?token=${token}`;
}

export const ReviewLinksModal: FC<{ postId: string }> = ({ postId }) => {
  const fetch = useFetch();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [allowComment, setAllowComment] = useState(true);
  const [allowApprove, setAllowApprove] = useState(true);
  // Raw tokens kept only in memory while the modal is open, keyed by link id.
  const [sessionTokens, setSessionTokens] = useState<Record<string, string>>(
    {}
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loader = useCallback(async () => {
    return (await fetch(`/posts/${postId}/review-links`)).json();
  }, [postId]);
  const { data, mutate, isLoading } = useSWR(
    `review-links-${postId}`,
    loader,
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      dedupingInterval: 0,
    }
  );

  // Force fresh data every time the modal opens
  useEffect(() => {
    mutate();
  }, []);

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
        setError(t('request_failed', 'Falha na requisição. Tente novamente.'));
        return;
      }
      const payload = await res.json();
      setSessionTokens((prev) => ({ ...prev, [payload.id]: payload.token }));
      mutate();
    } catch {
      setError(t('request_failed', 'Falha na requisição. Tente novamente.'));
    } finally {
      setCreating(false);
    }
  }, [postId, expiresInDays, allowComment, allowApprove, mutate, t]);

  const copyUrl = useCallback(
    async (linkId: string) => {
      const token = sessionTokens[linkId];
      if (!token) return;
      const url = buildShareUrl(postId, token);
      try {
        await navigator.clipboard.writeText(url);
        setCopiedId(linkId);
        window.setTimeout(() => setCopiedId(null), 1500);
      } catch {
        // ignore
      }
    },
    [postId, sessionTokens]
  );

  const revoke = useCallback(
    async (linkId: string) => {
      const confirmed = window.confirm(
        t(
          'confirm_revoke_review_link',
          'Revogar este link de revisão? Esta ação não pode ser desfeita.'
        )
      );
      if (!confirmed) return;
      const res = await fetch(
        `/posts/${postId}/review-links/${linkId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setSessionTokens((prev) => {
          const next = { ...prev };
          delete next[linkId];
          return next;
        });
        mutate();
      }
    },
    [postId, mutate, t]
  );

  return (
    <div className="w-full space-y-5">
      <p className="text-[13px] text-newTableText">
        {t(
          'client_review_links_help',
          'Gere um link para compartilhar este post com um cliente. Ele pode comentar ou aprovar sem precisar fazer login.'
        )}
      </p>

      <div className="border border-tableBorder rounded-[12px] p-4 space-y-3 bg-newColColor">
        <h3 className="text-sm font-semibold">
          {t('generate_new_link', 'Gerar novo link')}
        </h3>
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <label className="flex items-center gap-2">
            <span className="text-newTableText">
              {t('expires_in_days', 'Expira em (dias)')}
            </span>
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) =>
                setExpiresInDays(
                  Math.max(1, Math.min(365, Number(e.target.value) || 30))
                )
              }
              className="w-[70px] h-[34px] px-2 bg-input border border-fifth rounded text-inputText"
            />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowComment}
              onChange={(e) => setAllowComment(e.target.checked)}
            />
            <span>{t('allow_comments', 'Permitir comentários')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowApprove}
              onChange={(e) => setAllowApprove(e.target.checked)}
            />
            <span>{t('allow_approve', 'Permitir aprovação')}</span>
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
            {t('generate_link', 'Gerar link')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t('active_links', 'Links ativos')}
        </h3>
        {isLoading && (
          <p className="text-xs text-newTableText">
            {t('loading', 'Carregando...')}
          </p>
        )}
        {!isLoading && !links.length && (
          <p className="text-xs text-newTableText">
            {t('no_review_links', 'Nenhum link de revisão ainda.')}
          </p>
        )}
        {links.map((link) => {
          const isRevoked = !!link.revokedAt;
          const isExpired =
            !!link.expiresAt && dayjs(link.expiresAt).isBefore(dayjs());
          const latest = link.comments?.[0];
          const sessionToken = sessionTokens[link.id];

          let statusLabel: string;
          let statusClass: string;
          if (isRevoked) {
            statusLabel = t('revoked', 'Revogado');
            statusClass = 'bg-red-700 text-white';
          } else if (isExpired) {
            statusLabel = t('expired', 'Expirado');
            statusClass = 'bg-gray-500 text-white';
          } else if (latest?.kind === 'APPROVAL') {
            statusLabel = t('approved_by_client', 'Aprovado pelo cliente');
            statusClass = 'bg-green-600 text-white';
          } else if (latest?.kind === 'CHANGE_REQUEST') {
            statusLabel = t(
              'changes_requested_by_client',
              'Alterações solicitadas'
            );
            statusClass = 'bg-amber-600 text-white';
          } else {
            statusLabel = t('awaiting_review', 'Aguardando revisão');
            statusClass = 'bg-blue-600 text-white';
          }

          return (
            <div
              key={link.id}
              className="border border-tableBorder rounded-[12px] p-3 bg-newColColor space-y-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className={`text-[11px] font-semibold uppercase px-2 py-[2px] rounded ${statusClass}`}
                >
                  {statusLabel}
                </span>
                {!isRevoked && !isExpired && (
                  <button
                    type="button"
                    onClick={() => revoke(link.id)}
                    className="text-[11px] text-red-400 hover:text-red-300"
                  >
                    {t('revoke', 'Revogar')}
                  </button>
                )}
              </div>

              {latest && (
                <div className="text-[11px] text-newTableText">
                  {latest.guestName || t('guest', 'Convidado')} —{' '}
                  {dayjs(latest.createdAt).locale('pt-br').format(BR_DATE)}
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-newTableText">
                <span>
                  {t('created', 'Criado')}:{' '}
                  {dayjs(link.createdAt).locale('pt-br').format(BR_DATE)}
                </span>
                {link.expiresAt && (
                  <span>
                    {t('expires', 'Expira')}:{' '}
                    {dayjs(link.expiresAt).locale('pt-br').format(BR_DATE)}
                  </span>
                )}
                <span>
                  {t('interactions', 'Interações')}: {link._count.comments}
                </span>
              </div>

              {sessionToken ? (
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={buildShareUrl(postId, sessionToken)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full text-[11px] h-[32px] px-2 bg-input border border-fifth rounded font-mono text-inputText"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => copyUrl(link.id)}
                      className="text-[11px] px-3 py-1 rounded bg-forth text-white hover:opacity-90"
                    >
                      {copiedId === link.id
                        ? t('copied', 'Copiado')
                        : t('copy_link', 'Copiar link')}
                    </button>
                  </div>
                </div>
              ) : (
                !isRevoked &&
                !isExpired && (
                  <p className="text-[10px] text-newTableText italic pt-1">
                    {t(
                      'token_shown_once_help',
                      'Por segurança, o token só é exibido no momento da criação. Para compartilhar novamente, gere um novo link.'
                    )}
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
