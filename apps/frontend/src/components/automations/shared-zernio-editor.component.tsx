'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import { usePreventWindowUnload } from '@gitroom/react/helpers/use.prevent.window.unload';
import type { AutomationConfiguration } from '@gitroom/nestjs-libraries/dtos/flows/automation-management.dto';
import type { ZernioAutomationView } from '@gitroom/nestjs-libraries/dtos/flows/zernio-automation.dto';
import type {
  AutomationChannelView,
  AutomationReadiness,
} from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';
import { AutomationWorkspace } from './shared-workspace.component';
import { useWorkspaceMode } from './shared-workspace-navigation';
import { AutomationEditorStage } from './shared-editor-stage.component';
import { AutomationAccountSelect } from './shared-account-select.component';
import { AutomationConnectionIndicator } from './shared-connection-indicator.component';
import {
  AutomationPublicationSelector,
  type PublicationPreview,
} from './shared-publication-selector.component';
import { AutomationKeywordConditions } from './shared-keyword-conditions.component';
import { AutomationPublicReplyToggle } from './shared-public-reply-toggle.component';
import { SharedReplyVariations } from './shared-reply-variations.component';
import { PrivateMessageVariations } from './shared-private-variations.component';
import { AddLinkModal } from './add-link-modal.component';
import {
  AutomationEditorLayout,
  AutomationPreviewPanel,
  AutomationPhoneFrame,
} from './shared-editor-preview.component';
import { WizardPhonePreview } from './wizard-phone-preview.component';
import { AutomationExecutionHistory } from './shared-execution-history.component';
import { useSharedFlowData } from './hooks/use-shared-flows';
import type { EditorPendingAction } from './shared-editor-footer.component';
export function ZernioInstagramEditor({ id }: { id?: string }) {
  const { profile } = useCurrentProfile();
  return <ZernioEditorForm key={`${profile?.id}:${id || 'new'}`} id={id} />;
}
function ZernioEditorForm({ id }: { id?: string }) {
  const t = useT(),
    router = useRouter(),
    api = useFetch();
  const accounts = useSharedFlowData<AutomationChannelView[]>(
    '/managed-automations/options?resource=channels&platform=instagram'
  );
  const remote = useSharedFlowData<ZernioAutomationView>(
    id ? `/managed-automations/${id}` : null
  );
  const [record, setRecord] = useState<ZernioAutomationView | undefined>();
  const [config, setConfig] = useState<AutomationConfiguration>({
    name: t('zernio_automation_default_name'),
    integrationId: '',
    platform: 'instagram',
    triggerType: 'comment_on_post',
    postMode: 'all',
    dmVariants: [{ message: '' }],
    replyMessages: [],
  });
  const [dirty, setDirty] = useState(!id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [pendingAction, setPendingAction] = useState<EditorPendingAction>('save'),
    [linkOpen, setLinkOpen] = useState(false),
    [specificKeywords, setSpecificKeywords] = useState(false),
    [publicReply, setPublicReply] = useState(false),
    [previewIndex, setPreviewIndex] = useState(0),
    [replyIndex, setReplyIndex] = useState(0),
    [tab, setTab] = useState<'post' | 'comments' | 'dm' | 'story'>('dm');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  usePreventWindowUnload(dirty);
  useEffect(() => {
    if (
      remote.data?.executionVersion === 3 &&
      !dirty &&
      (!record || remote.data.revision > record.revision)
    ) {
      setRecord(remote.data);
      setConfig(remote.data.configuration);
      setSpecificKeywords(!!remote.data.configuration.keywords?.length);
      setPublicReply(
        !!remote.data.configuration.replyMessages?.length ||
          !!remote.data.configuration.replyMessage
      );
    }
  }, [remote.data, dirty, record]);
  const recordId = record?.id || id;
  const navigation = useWorkspaceMode(
    'quick',
    (next) => !busy && next !== 'flow' && (next !== 'history' || !!recordId)
  );
  const mode = navigation.mode === 'flow' ? 'quick' : navigation.mode;
  const readiness = useSharedFlowData<AutomationReadiness>(
    config.integrationId
      ? `/managed-automations/options?resource=readiness&integrationId=${encodeURIComponent(
          config.integrationId
        )}`
      : null
  );
  const posts = useSharedFlowData<{ data: PublicationPreview[] }>(
    config.integrationId && config.postMode === 'specific'
      ? `/managed-automations/options?resource=posts&integrationId=${encodeURIComponent(
          config.integrationId
        )}`
      : null
  );
  const available = Array.isArray(accounts.data)
    ? accounts.data.filter((a) => a.providerIdentifier === 'zernio-instagram')
    : [];
  const account = available.find((a) => a.id === config.integrationId);
  const variants =
    config.dmVariants ||
    (config.dmMessages || [config.dmMessage || '']).map((message) => ({
      message,
      buttonText: config.dmButtonText,
      buttonUrl: config.dmButtonUrl,
    }));
  const messages = variants.map((v) => v.message),
    buttonText = variants[0]?.buttonText || '',
    buttonUrl = variants[0]?.buttonUrl || '';
  const replies =
    config.replyMessages ||
    (config.replyMessage ? [config.replyMessage] : ['']);
  const patch = (p: Partial<AutomationConfiguration>) => {
    setConfig((old) => ({ ...old, ...p }));
    setDirty(true);
    setError(null);
  };
  const setMessages = (
    next: string[],
    button?: { buttonText: string; buttonUrl: string }
  ) =>
    patch({
      dmMessage: undefined,
      dmMessages: undefined,
      dmButtonText: undefined,
      dmButtonUrl: undefined,
      dmVariants: next.map((message) => ({
        message,
        ...(button ||
          (buttonText && buttonUrl ? { buttonText, buttonUrl } : {})),
      })),
    });
  const problems: string[] = [];
  if (!config.name.trim()) problems.push(t('shared_error_invalid_name'));
  if (!config.integrationId) problems.push(t('shared_error_invalid_channels'));
  if (config.postMode === 'specific' && config.postIds?.length !== 1)
    problems.push(t('zernio_single_post_hint'));
  if (specificKeywords && !config.keywords?.some((k) => k.trim()))
    problems.push(t('shared_error_invalid_keywords'));
  if (messages.some((m) => !m.trim()))
    problems.push(t('shared_error_invalid_message'));
  if (messages.length > 6 || replies.length > 6)
    problems.push(t('zernio_variations_limit'));
  if (messages.some((m) => m.length > (buttonText ? 640 : 1000)))
    problems.push(t('zernio_message_limit'));
  if (publicReply && (!replies.length || replies.some((r) => !r.trim())))
    problems.push(t('zernio_public_reply_required'));
  const valid = !problems.length;
  const payload = (): AutomationConfiguration => {
    const { activate, ...c } = config;
    return {
      ...c,
      platform: 'instagram',
      triggerType: 'comment_on_post',
      keywords: specificKeywords ? config.keywords || [] : [],
      replyMessage: undefined,
      replyMessages: publicReply ? replies : [],
      dmMessage: undefined,
      dmMessages: undefined,
      dmButtonText: undefined,
      dmButtonUrl: undefined,
      dmVariants: variants,
    };
  };
  async function write(
    path: string,
    method: string,
    body: unknown
  ): Promise<ZernioAutomationView> {
    const response = await api(path, { method, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.activationError) {
      if (
        alive.current &&
        data?.saved &&
        data?.id &&
        data?.executionVersion === 3
      ) {
        setRecord((old) => ({ ...old, ...data }));
      }
      const code =
        typeof data?.message === 'string' ? data.message : 'ZERNIO_UNAVAILABLE';
      throw new Error(
        /^[A-Z][A-Z0-9_]+$/.test(code) ? code : 'ZERNIO_UNAVAILABLE'
      );
    }
    if (
      !data ||
      data.executionVersion !== 3 ||
      typeof data.id !== 'string' ||
      !Number.isInteger(data.revision)
    )
      throw new Error('ZERNIO_INVALID_RESPONSE');
    return data;
  }
  async function save(): Promise<ZernioAutomationView> {
    const saved = await write(
      recordId ? `/managed-automations/${recordId}` : '/managed-automations',
      recordId ? 'PUT' : 'POST',
      recordId
        ? { configuration: payload(), expectedRevision: record?.revision }
        : { ...payload(), activate: false }
    );
    if (alive.current) {
      setRecord(saved);
      setDirty(false);
    }
    return saved;
  }
  async function action(kind: 'save' | 'ACTIVE' | 'PAUSED' | 'verify') {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPendingAction(
      kind === 'save' ? 'save' : kind === 'PAUSED' ? 'pause' : 'activate'
    );
    let targetId = recordId;
    let completed = false;
    try {
      if (kind === 'save') {
        targetId = (await save()).id;
        completed = true;
        return;
      }
      const current =
        kind === 'ACTIVE' && (dirty || !recordId) ? await save() : record;
      if (!current) throw new Error('ZERNIO_SAVE_FIRST');
      targetId = current.id;
      if (!alive.current) return;
      const updated = await write(
        `/managed-automations/${current.id}/status`,
        'POST',
        {
          status:
            kind === 'verify'
              ? current.status === 'ACTIVE'
                ? 'ACTIVE'
                : 'PAUSED'
              : kind,
          expectedRevision: current.revision,
        }
      );
      if (alive.current) setRecord(updated);
      completed = true;
    } catch (e) {
      if (alive.current) {
        const code = e instanceof Error ? e.message : 'ZERNIO_UNAVAILABLE';
        setError(
          t(`zernio_error_${code.toLowerCase()}`, t('zernio_operation_failed'))
        );
        if (targetId) {
          const fresh = await api(`/managed-automations/${targetId}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (alive.current && fresh?.executionVersion === 3) setRecord(fresh);
        }
      }
    } finally {
      if (alive.current) {
        setBusy(false);
        if (!id && targetId && completed)
          router.replace(`/automations/zernio/${targetId}?view=quick`);
      }
    }
  }
  if (id && (remote.isLoading || (!record && !remote.error)))
    return <p className="p-6">{t('loading')}</p>;
  if (remote.error)
    return (
      <div role="alert" className="p-6">
        {t('zernio_operation_failed')}
        <button type="button" onClick={() => remote.mutate()}>
          {t('try_again')}
        </button>
      </div>
    );
  const previewPost = posts.data?.data?.find((p) =>
    config.postIds?.includes(p.id)
  );
  return (
    <AutomationWorkspace
      name={config.name}
      nameLabel={t('flow_name')}
      onNameChange={(name) => patch({ name })}
      subtitle={`Instagram · Zernio${account ? ` · ${account.name}` : ''}`}
      picture={account?.picture || undefined}
      status={record?.status || 'DRAFT'}
      dirty={dirty}
      busy={busy}
      valid={valid}
      activationValid={
        valid &&
        !!readiness.data?.ready &&
        record?.syncState !== 'pending' &&
        record?.syncState !== 'unknown'
      }
      problems={problems}
      pendingAction={pendingAction}
      error={error}
      onSave={() => void action('save')}
      onStatusChange={(status) => void action(status)}
      navigation={{
        ...navigation,
        mode,
        flowDisabled: true,
        flowDisabledReason: t('zernio_visual_unsupported'),
        historyDisabled: !recordId,
      }}
      history={
        recordId ? (
          <AutomationExecutionHistory
            key={recordId}
            engine="zernio"
            flowId={recordId}
          />
        ) : null
      }
    >
      <AutomationEditorLayout>
        <div className="w-full lg:w-[46%] lg:max-w-[600px] shrink-0 p-4 space-y-3 lg:overflow-y-auto lg:min-h-0">
          {(record?.syncState === 'unknown' ||
            record?.syncState === 'pending') && (
            <div
              role="status"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <p>
                {t(
                  record.syncState === 'pending'
                    ? 'zernio_operation_pending'
                    : 'zernio_operation_unknown'
                )}
              </p>
              {record.syncState === 'unknown' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void action('verify')}
                  className="mt-2 underline"
                >
                  {t('zernio_verify_outcome')}
                </button>
              )}
            </div>
          )}
          <AutomationEditorStage
            kind="account"
            step={1}
            title={t('automation_section_account')}
            summary={account?.name}
          >
            <AutomationAccountSelect
              label={t('select_instagram_account')}
              value={config.integrationId}
              accounts={available}
              onChange={(integrationId) =>
                patch({ integrationId, postIds: [] })
              }
              disabled={busy || !!recordId}
              connection={
                config.integrationId ? (
                  <AutomationConnectionIndicator
                    provider="zernio-instagram"
                    integrationId={config.integrationId}
                    ready={!!readiness.data?.ready}
                    loading={readiness.isLoading}
                    detail={t(
                      readiness.data?.ready
                        ? 'zernio_account_authorized'
                        : 'zernio_authorization_hint'
                    )}
                  />
                ) : undefined
              }
            />
            {accounts.error && (
              <button type="button" onClick={() => accounts.mutate()}>
                {t('try_again')}
              </button>
            )}
          </AutomationEditorStage>
          <AutomationEditorStage
            kind="origin"
            step={2}
            title={t('automation_section_origin')}
            summary={t(
              config.postMode === 'all'
                ? 'wizard_all_posts'
                : 'zernio_single_post'
            )}
          >
            <AutomationPublicationSelector
              integrationId={config.integrationId}
              mode={config.postMode || 'all'}
              postIds={config.postIds || []}
              posts={posts.data?.data || []}
              onChange={(v) => {
                patch({ postMode: v.mode, postIds: v.postIds });
                setTab('post');
              }}
              disabled={busy || !config.integrationId}
              loading={posts.isLoading}
              error={!!posts.error}
              onRetry={() => posts.mutate()}
              scheduledEnabled={false}
              allowNext={false}
              maxSpecificPosts={1}
            />
            <p className="mt-2 text-xs text-newTextColor/65">
              {t('zernio_target_support')}
            </p>
          </AutomationEditorStage>
          <AutomationEditorStage
            kind="conditions"
            step={3}
            title={t('automation_section_conditions')}
          >
            <AutomationKeywordConditions
              specific={specificKeywords}
              keywords={config.keywords || []}
              onSpecificChange={(v) => {
                setSpecificKeywords(v);
                setDirty(true);
              }}
              onKeywordsChange={(keywords) => patch({ keywords })}
              matchMode={config.matchMode || 'any'}
              onMatchModeChange={(v) =>
                patch({ matchMode: v as 'any' | 'exact' })
              }
              allowedMatchModes={['any', 'exact']}
              disabled={busy}
              onFocus={() => setTab('comments')}
            />
          </AutomationEditorStage>
          <AutomationEditorStage
            kind="public"
            step={4}
            title={t('automation_stage_public_title')}
            summary={
              publicReply
                ? String(replies.length)
                : t('automation_stage_disabled')
            }
          >
            <AutomationPublicReplyToggle
              enabled={publicReply}
              onChange={(v) => {
                setPublicReply(v);
                setDirty(true);
                setTab('comments');
              }}
              label={t('shared_add_public_reply')}
              disabled={busy}
            >
              <SharedReplyVariations
                messages={replies}
                onChange={(replyMessages) => patch({ replyMessages })}
                maxVariants={6}
                engine="zernio"
                disabled={busy}
                onFocus={(i) => {
                  setReplyIndex(i);
                  setTab('comments');
                }}
              />
            </AutomationPublicReplyToggle>
          </AutomationEditorStage>
          <AutomationEditorStage
            kind="private"
            step={5}
            title={t('automation_stage_private_title')}
            summary={String(messages.length)}
          >
            <PrivateMessageVariations
              messages={messages}
              onChange={(next) => setMessages(next)}
              buttonText={buttonText}
              buttonUrl={buttonUrl}
              engine="zernio"
              maxLength={buttonText ? 640 : 1000}
              maxVariants={6}
              disabled={busy}
              onFocus={(i) => {
                setPreviewIndex(i);
                setTab('dm');
              }}
            />
            <button
              type="button"
              disabled={busy}
              className="mt-3 rounded-lg border border-newTableBorder px-3 py-2 text-sm"
              onClick={() => setLinkOpen(true)}
            >
              {buttonText
                ? `${buttonText} · ${buttonUrl}`
                : `+ ${t('story_add_link')}`}
            </button>
            <p className="mt-2 text-xs text-newTextColor/65">
              {t('zernio_shared_button_hint')}
            </p>
            <p className="text-xs text-newTextColor/65">
              {t('zernio_dm_delivery_hint')}
            </p>
          </AutomationEditorStage>
        </div>
        <AutomationPreviewPanel>
          <AutomationPhoneFrame>
            <WizardPhonePreview
              platform="instagram"
              postScope={config.postMode}
              postSelected={!!config.postIds?.length}
              postThumb={previewPost?.thumbnailUrl}
              postCaption={previewPost?.caption}
              integrationName={account?.name}
              integrationPicture={account?.picture || undefined}
              dmMessage={messages[Math.min(previewIndex, messages.length - 1)]}
              dmButtonText={buttonText}
              dmButtonUrl={buttonUrl}
              replyMessage={
                publicReply
                  ? replies[Math.min(replyIndex, replies.length - 1)]
                  : undefined
              }
              activeTab={tab}
              onTabChange={setTab}
            />
          </AutomationPhoneFrame>
        </AutomationPreviewPanel>
      </AutomationEditorLayout>
      <AddLinkModal
        open={linkOpen}
        initialText={buttonText}
        initialUrl={buttonUrl}
        maxTextLength={20}
        onSave={(text, url) => {
          setMessages(messages, { buttonText: text, buttonUrl: url });
          setLinkOpen(false);
        }}
        onRemove={() => {
          patch({
            dmVariants: messages.map((message) => ({ message })),
            dmMessage: undefined,
            dmMessages: undefined,
            dmButtonText: undefined,
            dmButtonUrl: undefined,
          });
          setLinkOpen(false);
        }}
        onClose={() => setLinkOpen(false)}
      />
    </AutomationWorkspace>
  );
}
