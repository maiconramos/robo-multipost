'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useIntegrationPosts } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { WizardPhonePreview } from '@gitroom/frontend/components/automations/wizard-phone-preview.component';

interface Props {
  flowId?: string;
  initialFlow?: any;
}

function safeJson(data?: string): Record<string, any> {
  if (!data) return {};
  try { return JSON.parse(data); } catch { return {}; }
}

const RadioDot: FC<{ active: boolean }> = ({ active }) => (
  <div className={`w-[16px] h-[16px] rounded-full border-2 flex items-center justify-center flex-shrink-0 ${active ? 'border-btnPrimary' : 'border-customColor18'}`}>
    {active && <div className="w-[8px] h-[8px] rounded-full bg-btnPrimary" />}
  </div>
);

function formatRelative(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return 'hoje';
    if (days < 7) return `${days}d atrás`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} semana${weeks > 1 ? 's' : ''} atrás`;
    const months = Math.floor(days / 30);
    return `${months} mês${months > 1 ? 'es' : ''} atrás`;
  } catch { return ''; }
}

export const AutomationWizardComponent: FC<Props> = ({ flowId, initialFlow }) => {
  const t = useT();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: integrations } = useIntegrationList();
  const isEditing = !!flowId;

  // Form state
  const [name, setName] = useState('');
  const [integrationId, setIntegrationId] = useState('');
  const [postMode, setPostMode] = useState<'all' | 'specific'>('specific');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [keywordMode, setKeywordMode] = useState<'any_word' | 'specific'>('any_word');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState('any');
  const [enableReply, setEnableReply] = useState(false);
  const [replyMessages, setReplyMessages] = useState<string[]>(['']);
  const [enableDm, setEnableDm] = useState(false);
  const [dmMessage, setDmMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAllPostsModal, setShowAllPostsModal] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState<'post' | 'comments' | 'dm'>('post');

  // Pre-fill form when editing
  useEffect(() => {
    if (!initialFlow) return;
    setName(initialFlow.name || '');
    setIntegrationId(initialFlow.integrationId || initialFlow.integration?.id || '');
    const triggerNode = initialFlow.nodes?.find((n: any) => n.type === 'TRIGGER');
    const replyNode = initialFlow.nodes?.find((n: any) => n.type === 'REPLY_COMMENT');
    const dmNode = initialFlow.nodes?.find((n: any) => n.type === 'SEND_DM');
    const triggerCfg = safeJson(triggerNode?.data);
    const replyCfg = safeJson(replyNode?.data);
    const dmCfg = safeJson(dmNode?.data);
    if (triggerCfg.postIds?.length) {
      setPostMode('specific');
      setSelectedPostIds(triggerCfg.postIds);
    }
    if (triggerCfg.keywords?.length) {
      setKeywordMode('specific');
      setKeywords(triggerCfg.keywords);
      setMatchMode(triggerCfg.matchMode || 'any');
    }
    const msgs = replyCfg.messages as string[] | undefined;
    if (msgs?.length) {
      setEnableReply(true);
      setReplyMessages(msgs);
    } else if (replyCfg.message) {
      setEnableReply(true);
      setReplyMessages([replyCfg.message]);
    }
    if (dmCfg.message) {
      setEnableDm(true);
      setDmMessage(dmCfg.message);
    }
  }, [initialFlow]);

  // Auto-switch preview tab based on state
  useEffect(() => {
    if (dmMessage) {
      setActivePreviewTab('dm');
    } else if (enableReply) {
      setActivePreviewTab('comments');
    } else if (selectedPostIds.length > 0) {
      setActivePreviewTab('post');
    }
  }, [dmMessage, enableReply, selectedPostIds.length]);

  const instagramIntegrations = useMemo(() => {
    if (!Array.isArray(integrations)) return [];
    return integrations.filter((i: any) => i.identifier === 'instagram');
  }, [integrations]);

  const selectedIntegration = useMemo(
    () => instagramIntegrations.find((ig: any) => ig.id === integrationId) || null,
    [instagramIntegrations, integrationId]
  );

  const { data: posts, isLoading: postsLoading } = useIntegrationPosts(
    integrationId || null
  );

  const togglePost = (postId: string) => {
    setSelectedPostIds((prev) =>
      prev.includes(postId)
        ? prev.filter((id) => id !== postId)
        : [...prev, postId]
    );
  };

  const selectedPost = useMemo(() => {
    if (!Array.isArray(posts) || selectedPostIds.length === 0) return null;
    return posts.find((p: any) => p.id === selectedPostIds[0]);
  }, [posts, selectedPostIds]);

  const canSave =
    !!name.trim() &&
    !!integrationId &&
    ((enableReply && replyMessages.some(m => m.trim())) || dmMessage.trim().length > 0);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        integrationId,
      };
      if (postMode === 'specific' && selectedPostIds.length > 0) {
        body.postIds = selectedPostIds;
      }
      if (keywordMode === 'specific' && keywords.length > 0) {
        body.keywords = keywords;
        body.matchMode = matchMode;
      }
      if (enableReply) {
        const msgs = replyMessages.filter(m => m.trim());
        if (msgs.length) body.replyMessages = msgs;
      }
      if (dmMessage.trim()) {
        body.dmMessage = dmMessage.trim();
      }

      const url = isEditing ? `/flows/${flowId}/quick-update` : '/flows/quick-create';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toaster.show(
          data.message || t('failed_to_create_flow', 'Falha ao criar automação'),
          'warning'
        );
        return;
      }
      const flow = await res.json();
      toaster.show(
        isEditing
          ? t('flow_updated', 'Automação atualizada com sucesso')
          : t('flow_created', 'Automação criada com sucesso'),
        'success'
      );
      router.push(`/automacoes/${flow.id}`);
    } catch {
      toaster.show(t('failed_to_create_flow', 'Falha ao criar automação'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [
    canSave, name, integrationId, postMode, selectedPostIds,
    keywordMode, keywords, matchMode, enableReply, replyMessages,
    enableDm, dmMessage, fetchApi, router, toaster, t,
  ]);

  const inputClass =
    'w-full bg-transparent outline-none text-[14px] text-textColor px-[16px] py-[10px]';
  const inputWrapperClass =
    'bg-newBgColorInner border border-newTableBorder rounded-[8px]';

  return (
    <div className="flex flex-1 h-full">
      {/* Left sidebar — form */}
      <div className="flex-1 overflow-y-auto p-[24px] max-w-[600px]">
        <div className="flex items-center gap-[12px] mb-[24px]">
          <button
            onClick={() => router.push('/automacoes')}
            className="text-customColor18 hover:text-textColor text-[18px]"
          >
            &larr;
          </button>
          <h1 className="text-[20px] font-semibold text-textColor">
            {isEditing
              ? t('wizard_editing_title', 'Edit Automation')
              : t('wizard_title', 'New Quick Automation')}
          </h1>
        </div>

        {/* Name */}
        <div className="mb-[20px]">
          <label className="block text-[14px] text-textColor mb-[6px]">
            {t('wizard_name', 'Automation name')}
          </label>
          <div className={inputWrapperClass}>
            <input
              type="text"
              className={inputClass}
              placeholder={t('wizard_name_placeholder', 'e.g. Ebook promo')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        {/* Integration */}
        <div className="mb-[20px]">
          <label className="block text-[14px] text-textColor mb-[6px]">
            {t('wizard_account', 'Instagram account')}
          </label>
          {instagramIntegrations.length === 0 ? (
            <p className="text-[13px] text-customColor19">
              {t(
                'no_instagram_connected',
                'No Instagram account connected. Go to Integrations to connect one first.'
              )}
            </p>
          ) : (
            <div className={inputWrapperClass}>
              <select
                className={inputClass}
                value={integrationId}
                onChange={(e) => {
                  setIntegrationId(e.target.value);
                  setSelectedPostIds([]);
                }}
              >
                <option value="">
                  {t('select_account', 'Select an account...')}
                </option>
                {instagramIntegrations.map((ig: any) => (
                  <option key={ig.id} value={ig.id}>
                    {ig.name || ig.display || ig.id}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Step 1: When someone comments */}
        {integrationId && (
          <>
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                {t('wizard_step1_title', 'Quando alguém faz um comentário')}
              </h2>

              {/* Radio card: specific post */}
              <div
                className={`rounded-[8px] border p-[12px] cursor-pointer mb-[8px] ${postMode === 'specific' ? 'border-btnPrimary bg-btnPrimary/5' : 'border-fifth hover:border-btnPrimary'}`}
                onClick={() => setPostMode('specific')}
              >
                <div className="flex items-center gap-[8px]">
                  <RadioDot active={postMode === 'specific'} />
                  <span className="text-[13px] text-textColor">{t('wizard_specific_post', 'uma publicação ou Reels específico')}</span>
                </div>

                {/* Post grid — shown when specific is selected */}
                {postMode === 'specific' && integrationId && (
                  <div className="mt-[12px]">
                    {postsLoading ? (
                      <p className="text-[12px] text-customColor18">{t('loading_posts', 'Loading posts...')}</p>
                    ) : !posts?.length ? (
                      <p className="text-[12px] text-customColor18">{t('no_posts_found', 'No posts found.')}</p>
                    ) : (
                      <>
                        {/* 4-thumb grid */}
                        <div className="grid grid-cols-4 gap-[6px] mb-[8px]">
                          {(posts as any[]).slice(0, 4).map((post: any) => {
                            const isSelected = selectedPostIds.includes(post.id);
                            const thumb = post.thumbnailUrl || post.mediaUrl;
                            return (
                              <div
                                key={post.id}
                                onClick={(e) => { e.stopPropagation(); togglePost(post.id); setActivePreviewTab('post'); }}
                                className={`relative aspect-square rounded-[6px] overflow-hidden cursor-pointer border-2 ${isSelected ? 'border-btnPrimary' : 'border-transparent'}`}
                              >
                                {thumb ? (
                                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-sixth" />
                                )}
                                {/* Reel icon if VIDEO */}
                                {post.mediaType === 'VIDEO' && (
                                  <div className="absolute top-[4px] right-[4px]">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="2" y="2" width="20" height="20" rx="3"/><polygon points="10,8 16,12 10,16" fill="#000"/></svg>
                                  </div>
                                )}
                                {/* Selected checkmark */}
                                {isSelected && (
                                  <div className="absolute inset-0 bg-btnPrimary/20 flex items-center justify-center">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* "Mostrar Todos" button */}
                        {(posts as any[]).length > 4 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowAllPostsModal(true); }}
                            className="text-[13px] text-btnPrimary hover:opacity-80 font-medium"
                          >
                            {t('wizard_show_all_posts', 'Mostrar Todos')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Radio card: any post */}
              <div
                className={`rounded-[8px] border p-[12px] cursor-pointer ${postMode === 'all' ? 'border-btnPrimary bg-btnPrimary/5' : 'border-fifth hover:border-btnPrimary'}`}
                onClick={() => { setPostMode('all'); setSelectedPostIds([]); }}
              >
                <div className="flex items-center gap-[8px]">
                  <RadioDot active={postMode === 'all'} />
                  <span className="text-[13px] text-textColor">{t('wizard_all_posts', 'qualquer publicação ou Reel')}</span>
                </div>
              </div>
            </div>

            {/* Section: E esse comentário possui (ManyChat style) */}
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                {t('wizard_comment_has', 'E esse comentário possui')}
              </h2>

              {/* Radio card: specific word */}
              <div
                className={`rounded-[8px] border p-[12px] cursor-pointer mb-[8px] ${keywordMode === 'specific' ? 'border-btnPrimary bg-btnPrimary/5' : 'border-fifth hover:border-btnPrimary'}`}
                onClick={() => setKeywordMode('specific')}
              >
                <div className="flex items-center gap-[8px] mb-[8px]">
                  <RadioDot active={keywordMode === 'specific'} />
                  <span className="text-[13px] text-textColor">{t('wizard_specific_word', 'uma palavra ou expressão específica')}</span>
                </div>

                {keywordMode === 'specific' && (
                  <div onClick={e => e.stopPropagation()}>
                    {/* Single text input for comma-separated keywords */}
                    <div className={inputWrapperClass}>
                      <input
                        type="text"
                        className={inputClass + ' h-[42px]'}
                        placeholder={t('wizard_keywords_input_placeholder', 'Digite uma ou mais palavras')}
                        value={keywords.join(', ')}
                        onFocus={() => setActivePreviewTab('comments')}
                        onChange={(e) => setKeywords(
                          e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                        )}
                      />
                    </div>
                    <p className="text-[11px] text-customColor18 mt-[4px] mb-[8px]">
                      {t('wizard_keywords_comma_hint', 'Use vírgulas para separar as palavras')}
                    </p>
                    {/* Example chips */}
                    <div className="flex flex-wrap gap-[6px] mb-[8px]">
                      <span className="text-[11px] text-customColor18">{t('wizard_example', 'Por exemplo:')}</span>
                      {['Preço', 'Link', 'Comprar'].map(chip => (
                        <button
                          key={chip}
                          onClick={() => {
                            if (!keywords.includes(chip)) setKeywords(prev => [...prev, chip]);
                          }}
                          className={`text-[11px] px-[8px] py-[2px] rounded-[12px] border ${keywords.includes(chip) ? 'border-btnPrimary text-btnPrimary bg-btnPrimary/10' : 'border-fifth text-customColor18 hover:border-btnPrimary'}`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Radio card: any word */}
              <div
                className={`rounded-[8px] border p-[12px] cursor-pointer mb-[12px] ${keywordMode === 'any_word' ? 'border-btnPrimary bg-btnPrimary/5' : 'border-fifth hover:border-btnPrimary'}`}
                onClick={() => { setKeywordMode('any_word'); setKeywords([]); }}
              >
                <div className="flex items-center gap-[8px]">
                  <RadioDot active={keywordMode === 'any_word'} />
                  <span className="text-[13px] text-textColor">{t('wizard_any_word', 'qualquer palavra')}</span>
                </div>
              </div>

              {/* Toggle: interagir com os comentários deles na publicação */}
              <div className="flex items-center justify-between p-[12px] rounded-[8px] bg-sixth border border-fifth">
                <span className="text-[13px] text-textColor">
                  {t('wizard_enable_reply', 'interagir com os comentários deles na publicação')}
                </span>
                {/* Toggle switch (CSS-only) */}
                <button
                  onClick={() => setEnableReply(v => !v)}
                  className={`relative w-[44px] h-[24px] rounded-full transition-colors ${enableReply ? 'bg-btnPrimary' : 'bg-customColor18/30'}`}
                >
                  <div className={`absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white transition-all ${enableReply ? 'left-[22px]' : 'left-[2px]'}`} />
                </button>
              </div>

              {/* Reply message inputs — when toggle is on */}
              {enableReply && (
                <div className="mt-[12px] flex flex-col gap-[8px]">
                  {replyMessages.map((msg, idx) => (
                    <div key={idx} className="flex gap-[8px] items-center">
                      <div className={`flex-1 ${inputWrapperClass}`}>
                        <input
                          type="text"
                          className={inputClass + ' h-[42px]'}
                          placeholder={t('reply_template_placeholder', 'Obrigado! Por favor, veja as DMs.')}
                          value={msg}
                          onFocus={() => setActivePreviewTab('comments')}
                          onChange={(e) => {
                            const updated = [...replyMessages];
                            updated[idx] = e.target.value;
                            setReplyMessages(updated);
                          }}
                        />
                      </div>
                      {replyMessages.length > 1 && (
                        <button
                          onClick={() => setReplyMessages(prev => prev.filter((_, i) => i !== idx))}
                          className="text-customColor18 hover:text-customColor13 text-[18px] leading-none"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setReplyMessages(prev => [...prev, ''])}
                    className="text-[12px] text-btnPrimary hover:opacity-80 self-start"
                  >
                    + {t('wizard_add_reply_variant', 'Adicionar variação')}
                  </button>
                </div>
              )}
            </div>

            {/* DM section */}
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                {t('wizard_step2_title', 'Enviar mensagem privada')}
              </h2>
              <div className={inputWrapperClass}>
                <textarea
                  className={`${inputClass} min-h-[100px] resize-y`}
                  rows={4}
                  placeholder={t('dm_template_placeholder', 'Olá {commenter_name}!\n\nAqui está o link que você pediu...')}
                  value={dmMessage}
                  onFocus={() => setActivePreviewTab('dm')}
                  onChange={(e) => setDmMessage(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-customColor18 mt-[4px]">
                {t('variables_hint', 'Variables: {commenter_name}, {comment_text}')}
              </p>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="w-full rounded-[6px] bg-btnPrimary py-[12px] text-[14px] font-medium text-white hover:opacity-80 disabled:opacity-50"
            >
              {saving
                ? (isEditing ? t('wizard_updating', 'Saving...') : t('wizard_saving', 'Creating automation...'))
                : (isEditing ? t('wizard_update', 'Save Changes') : t('wizard_save', 'Create Automation'))}
            </button>
          </>
        )}
      </div>

      {/* Right side — phone preview */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-newBgColor border-l border-fifth p-[24px]">
        <WizardPhonePreview
          postThumb={selectedPost?.thumbnailUrl || selectedPost?.mediaUrl}
          postCaption={selectedPost?.caption}
          replyMessage={enableReply ? replyMessages.filter(m => m.trim())[0] : undefined}
          dmMessage={dmMessage || undefined}
          integrationPicture={(selectedIntegration as any)?.picture}
          integrationName={(selectedIntegration as any)?.name || (selectedIntegration as any)?.display}
          activeTab={activePreviewTab}
          onTabChange={setActivePreviewTab}
        />
      </div>

      {/* "Mostrar Todos" modal */}
      {showAllPostsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-newBgColorInner rounded-[12px] w-[90vw] max-w-[700px] max-h-[80vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between p-[20px] border-b border-fifth">
              <h3 className="text-[16px] font-semibold text-textColor">
                {t('wizard_modal_title', 'Selecione qualquer publicação ou reel para automatizar')}
              </h3>
              <button onClick={() => setShowAllPostsModal(false)} className="text-customColor18 hover:text-textColor text-[24px]">×</button>
            </div>
            {/* Posts grid */}
            <div className="flex-1 overflow-y-auto p-[16px]">
              {Array.isArray(posts) && (
                <div className="grid grid-cols-3 gap-[10px]">
                  {(posts as any[]).map((post: any) => {
                    const isSelected = selectedPostIds.includes(post.id);
                    const thumb = post.thumbnailUrl || post.mediaUrl;
                    return (
                      <div
                        key={post.id}
                        onClick={() => { togglePost(post.id); setActivePreviewTab('post'); }}
                        className={`relative rounded-[8px] overflow-hidden cursor-pointer border-2 ${isSelected ? 'border-btnPrimary' : 'border-transparent hover:border-btnPrimary/50'}`}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full aspect-square object-cover" />
                        ) : (
                          <div className="w-full aspect-square bg-sixth" />
                        )}
                        {/* Reel icon */}
                        {post.mediaType === 'VIDEO' && (
                          <div className="absolute top-[6px] right-[6px]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="2" y="2" width="20" height="20" rx="3"/><polygon points="10,8 16,12 10,16" fill="#000"/></svg>
                          </div>
                        )}
                        {/* Caption + date */}
                        <div className="p-[8px] bg-sixth">
                          <p className="text-[11px] text-textColor truncate">{post.caption || '—'}</p>
                          {post.createdAt && (
                            <p className="text-[10px] text-customColor18 mt-[2px]">
                              {formatRelative(post.createdAt)}
                            </p>
                          )}
                        </div>
                        {isSelected && (
                          <div className="absolute top-0 left-0 right-0 bg-btnPrimary/20 flex items-center justify-center" style={{height: 'calc(100% - 56px)'}}>
                            <p className="text-[11px] text-white font-semibold bg-btnPrimary px-[8px] py-[2px] rounded-full">{t('wizard_view_instagram', 'Ver no Instagram')}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Modal footer */}
            <div className="p-[16px] border-t border-fifth flex justify-end">
              <button
                onClick={() => setShowAllPostsModal(false)}
                className="rounded-[6px] bg-btnPrimary px-[20px] py-[8px] text-[13px] text-white hover:opacity-80"
              >
                {t('confirm', 'Confirmar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
