'use client';

import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type ReviewInfo =
  | { valid: false }
  | { valid: true; allowComment: boolean; allowApprove: boolean; expiresAt: string | null };

type CommentItem = {
  id: string;
  content: string;
  userId: string | null;
  guestName: string | null;
  kind: 'COMMENT' | 'APPROVAL' | 'CHANGE_REQUEST';
  createdAt: string;
};

const GUEST_NAME_KEY = 'robo-multipost:guest-name';
const GUEST_EMAIL_KEY = 'robo-multipost:guest-email';

function readGuestDefaults() {
  if (typeof window === 'undefined') return { name: '', email: '' };
  try {
    return {
      name: window.localStorage.getItem(GUEST_NAME_KEY) || '',
      email: window.localStorage.getItem(GUEST_EMAIL_KEY) || '',
    };
  } catch {
    return { name: '', email: '' };
  }
}

function persistGuestDefaults(name: string, email: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_NAME_KEY, name);
    window.localStorage.setItem(GUEST_EMAIL_KEY, email);
  } catch {
    // ignore
  }
}

const CommentsList: FC<{
  comments: CommentItem[];
  anonymousUserMap: Record<string, number>;
}> = ({ comments, anonymousUserMap }) => {
  const t = useT();
  return (
    <div className="space-y-4">
      {!!comments.length && (
        <h3 className="text-lg font-semibold">{t('comments', 'Comments')}</h3>
      )}
      {comments.map((comment) => {
        const isGuest = !comment.userId;
        const authorLabel = isGuest
          ? comment.guestName || t('guest', 'Guest')
          : `${t('user', 'User')}${
              comment.userId ? anonymousUserMap[comment.userId] || '' : ''
            }`;
        const badge =
          comment.kind === 'APPROVAL'
            ? t('approved', 'Approved')
            : comment.kind === 'CHANGE_REQUEST'
            ? t('changes_requested', 'Changes requested')
            : null;
        return (
          <div
            key={comment.id}
            className="flex space-x-3 border-t border-tableBorder py-3"
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold">{authorLabel}</h3>
                {isGuest && (
                  <span className="text-[10px] uppercase text-gray-400 border border-tableBorder px-1 rounded">
                    {t('guest', 'Guest')}
                  </span>
                )}
                {badge && (
                  <span
                    className={`text-[10px] uppercase px-1 rounded ${
                      comment.kind === 'APPROVAL'
                        ? 'bg-green-900 text-green-200'
                        : 'bg-yellow-900 text-yellow-200'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </div>
              {(() => {
                const isLegacyDefault =
                  comment.kind !== 'COMMENT' &&
                  (comment.content === 'Approved' ||
                    comment.content === 'Changes requested');
                const body =
                  !comment.content || isLegacyDefault ? '' : comment.content;
                if (!body) return null;
                return (
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">
                    {body}
                  </p>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const LoggedRenderComponents: FC<{
  postId: string;
}> = ({ postId }) => {
  const fetch = useFetch();
  const fetchComments = useCallback(async () => {
    return (await fetch(`/public/posts/${postId}/comments`)).json();
  }, [postId]);
  const { data, mutate, isLoading } = useSWR(
    `comments-${postId}`,
    fetchComments
  );
  const anonymousUserMap = useMemo(() => {
    return ((data?.comments || []) as CommentItem[]).reduce(
      (all: any, current: CommentItem) => {
        if (current.userId) {
          all.users[current.userId] =
            all.users[current.userId] || all.counter++;
        }
        return all;
      },
      { users: {}, counter: 1 }
    ).users;
  }, [data]);
  const { handleSubmit, register, setValue } = useForm();
  const t = useT();

  const submit: SubmitHandler<FieldValues> = useCallback(
    async (e) => {
      setValue('comment', '');
      await fetch(`/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify(e),
      });
      mutate();
    },
    [postId, mutate, setValue]
  );

  if (isLoading) return <></>;

  return (
    <>
      <div className="mb-6 flex space-x-3">
        <form className="flex-1 space-y-2" onSubmit={handleSubmit(submit)}>
          <textarea
            {...register('comment', { required: true })}
            className="flex w-full px-3 py-2 h-[98px] text-sm ring-offset-background placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px] resize-none text-white bg-third border border-tableBorder placeholder-gray-500 focus:ring-0"
            placeholder={t('add_a_comment_dot', 'Add a comment...')}
            defaultValue={''}
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button type="submit">{t('post', 'Post')}</Button>
          </div>
        </form>
      </div>
      <CommentsList
        comments={(data?.comments || []) as CommentItem[]}
        anonymousUserMap={anonymousUserMap}
      />
    </>
  );
};

const GuestRenderComponents: FC<{
  postId: string;
  token: string;
  allowComment: boolean;
  allowApprove: boolean;
}> = ({ postId, token, allowComment, allowApprove }) => {
  const fetch = useFetch();
  const t = useT();
  const fetchComments = useCallback(async () => {
    return (await fetch(`/public/posts/${postId}/comments`)).json();
  }, [postId]);
  const { data, mutate, isLoading } = useSWR(
    `comments-${postId}`,
    fetchComments
  );
  const defaults = useMemo(() => readGuestDefaults(), []);
  const [guestName, setGuestName] = useState(defaults.name);
  const [guestEmail, setGuestEmail] = useState(defaults.email);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<
    null | 'comment' | 'approve' | 'changes'
  >(null);
  const [linkInvalid, setLinkInvalid] = useState(false);

  // Client-side re-validation on mount: server-rendered reviewInfo can be stale
  // if the owner revokes the link after the page was rendered.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/public/posts/${postId}/review?token=${encodeURIComponent(token)}`
        );
        if (!res.ok) {
          if (!cancelled) setLinkInvalid(true);
          return;
        }
        const body = await res.json();
        if (!cancelled && body?.valid !== true) {
          setLinkInvalid(true);
        }
      } catch {
        // Keep form available; any subsequent POST will also enforce
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, token, fetch]);

  const anonymousUserMap = useMemo(() => {
    return ((data?.comments || []) as CommentItem[]).reduce(
      (all: any, current: CommentItem) => {
        if (current.userId) {
          all.users[current.userId] =
            all.users[current.userId] || all.counter++;
        }
        return all;
      },
      { users: {}, counter: 1 }
    ).users;
  }, [data]);

  const validate = useCallback(
    (requireContent: boolean) => {
      if (!guestName.trim() || !guestEmail.trim()) {
        setError(
          t('guest_name_email_required', 'Name and email are required')
        );
        return false;
      }
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail);
      if (!emailOk) {
        setError(t('guest_invalid_email', 'Invalid email address'));
        return false;
      }
      if (requireContent && !content.trim()) {
        setError(t('comment_required', 'Comment is required'));
        return false;
      }
      setError(null);
      return true;
    },
    [guestName, guestEmail, content, t]
  );

  const submitAction = useCallback(
    async (
      kind: 'comment' | 'approve' | 'changes',
      endpoint: string,
      extra: Record<string, unknown> = {}
    ) => {
      if (!validate(kind === 'comment')) return;
      setSubmitting(kind);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            token,
            guestName: guestName.trim(),
            guestEmail: guestEmail.trim(),
            ...extra,
          }),
        });
        if (!res.ok) {
          if (res.status === 429) {
            setError(
              t(
                'too_many_requests',
                'Muitas requisições. Tente novamente em instantes.'
              )
            );
          } else if (res.status === 404) {
            setLinkInvalid(true);
          } else {
            setError(
              t('request_failed', 'Falha na requisição. Tente novamente.')
            );
          }
          return;
        }
        persistGuestDefaults(guestName.trim(), guestEmail.trim());
        setContent('');
        mutate();
      } catch {
        setError(t('request_failed', 'Request failed. Try again.'));
      } finally {
        setSubmitting(null);
      }
    },
    [fetch, token, guestName, guestEmail, validate, mutate, t]
  );

  const onComment = useCallback(
    () =>
      submitAction('comment', `/public/posts/${postId}/review/comment`, {
        content: content.trim(),
      }),
    [submitAction, postId, content]
  );

  const onApprove = useCallback(
    () =>
      submitAction('approve', `/public/posts/${postId}/review/approve`, {
        decision: 'APPROVED',
        note: content.trim(),
      }),
    [submitAction, postId, content]
  );

  const onRequestChanges = useCallback(
    () =>
      submitAction('changes', `/public/posts/${postId}/review/approve`, {
        decision: 'CHANGE_REQUESTED',
        note: content.trim(),
      }),
    [submitAction, postId, content]
  );

  if (isLoading) return <></>;

  if (linkInvalid) {
    return (
      <div className="mb-6 p-4 border border-red-800 bg-red-950/40 rounded text-center space-y-2">
        <p className="text-sm font-semibold text-red-300">
          {t('review_link_invalid_title', 'Link de revisão indisponível')}
        </p>
        <p className="text-xs text-red-200">
          {t(
            'review_link_invalid_body',
            'Este link foi revogado ou expirou. Solicite um novo link ao responsável do post.'
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 space-y-3 border border-tableBorder rounded p-3 bg-third">
        <h3 className="text-sm font-semibold">
          {t('client_review', 'Client review')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            placeholder={t('your_name', 'Your name')}
            className="w-full h-[40px] px-3 text-sm bg-input border border-fifth rounded text-inputText placeholder-inputText outline-none"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            maxLength={80}
          />
          <input
            type="email"
            placeholder={t('your_email', 'Your email')}
            className="w-full h-[40px] px-3 text-sm bg-input border border-fifth rounded text-inputText placeholder-inputText outline-none"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            maxLength={254}
          />
        </div>
        <textarea
          placeholder={t(
            'guest_note_placeholder',
            'Comentário ou observação opcional para aprovação/alterações...'
          )}
          className="w-full px-3 py-2 text-sm bg-input border border-fifth rounded text-inputText placeholder-inputText outline-none min-h-[80px] resize-none"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          {allowComment && (
            <Button
              type="button"
              onClick={onComment}
              loading={submitting === 'comment'}
              secondary={true}
              className="!bg-newColColor !text-white border border-tableBorder"
            >
              {t('send_comment', 'Enviar comentário')}
            </Button>
          )}
          {allowApprove && (
            <>
              <Button
                type="button"
                onClick={onRequestChanges}
                loading={submitting === 'changes'}
                className="!bg-amber-600 hover:!bg-amber-700 !text-white"
              >
                {t('request_changes', 'Pedir alterações')}
              </Button>
              <Button
                type="button"
                onClick={onApprove}
                loading={submitting === 'approve'}
                className="!bg-green-600 hover:!bg-green-700 !text-white"
              >
                {t('approve', 'Aprovar')}
              </Button>
            </>
          )}
        </div>
      </div>
      <CommentsList
        comments={(data?.comments || []) as CommentItem[]}
        anonymousUserMap={anonymousUserMap}
      />
    </>
  );
};

export const CommentsComponents: FC<{
  postId: string;
  token?: string;
  reviewInfo?: ReviewInfo;
}> = ({ postId, token, reviewInfo }) => {
  const user = useUser();
  const t = useT();

  const hasValidToken =
    !!token && !!reviewInfo && reviewInfo.valid === true;

  if (hasValidToken) {
    const info = reviewInfo as Extract<ReviewInfo, { valid: true }>;
    return (
      <GuestRenderComponents
        postId={postId}
        token={token!}
        allowComment={info.allowComment}
        allowApprove={info.allowApprove}
      />
    );
  }

  if (!user?.id) {
    const goToLogin = () => {
      window.location.href = `/auth?returnUrl=${encodeURIComponent(
        window.location.href
      )}`;
    };
    return (
      <Button
        onClick={goToLogin}
        className="!h-auto min-h-[40px] py-[10px] text-center"
        innerClassName="whitespace-normal text-center leading-snug"
      >
        {t(
          'login_register_to_add_comments',
          'Login / Register to add comments'
        )}
      </Button>
    );
  }

  return <LoggedRenderComponents postId={postId} />;
};
