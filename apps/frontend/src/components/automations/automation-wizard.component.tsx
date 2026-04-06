'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useIntegrationPosts } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { WizardPhonePreview } from '@gitroom/frontend/components/automations/wizard-phone-preview.component';

export const AutomationWizardComponent: FC = () => {
  const t = useT();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: integrations } = useIntegrationList();

  // Form state
  const [name, setName] = useState('');
  const [integrationId, setIntegrationId] = useState('');
  const [postMode, setPostMode] = useState<'all' | 'specific'>('all');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [keywordMode, setKeywordMode] = useState<'any_word' | 'specific'>('any_word');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState('any');
  const [enableReply, setEnableReply] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [enableDm, setEnableDm] = useState(false);
  const [dmMessage, setDmMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const instagramIntegrations = useMemo(() => {
    if (!Array.isArray(integrations)) return [];
    return integrations.filter((i: any) => i.identifier === 'instagram');
  }, [integrations]);

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
    name.trim() &&
    integrationId &&
    (enableReply || enableDm) &&
    (enableReply ? replyMessage.trim() : true) &&
    (enableDm ? dmMessage.trim() : true);

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
      if (enableReply && replyMessage.trim()) {
        body.replyMessage = replyMessage.trim();
      }
      if (enableDm && dmMessage.trim()) {
        body.dmMessage = dmMessage.trim();
      }

      const res = await fetchApi('/flows/quick-create', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toaster.show(
          data.message || t('failed_to_create_flow', 'Falha ao criar automacao'),
          'warning'
        );
        return;
      }
      const flow = await res.json();
      toaster.show(t('flow_created', 'Automacao criada com sucesso'), 'success');
      router.push(`/automacoes/${flow.id}`);
    } catch {
      toaster.show(t('failed_to_create_flow', 'Falha ao criar automacao'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [
    canSave, name, integrationId, postMode, selectedPostIds,
    keywordMode, keywords, matchMode, enableReply, replyMessage,
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
            {t('wizard_title', 'New Quick Automation')}
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

        {/* Step 1: When */}
        {integrationId && (
          <>
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[4px]">
                {t('wizard_step1_title', 'When someone comments...')}
              </h2>
              <p className="text-[12px] text-customColor18 mb-[12px]">
                {t('wizard_step1_desc', 'Choose which posts and words trigger the automation.')}
              </p>

              {/* Post selection */}
              <label className="block text-[13px] text-textColor mb-[8px] font-medium">
                {t('wizard_post_selection', 'Which posts?')}
              </label>
              <div className="flex gap-[8px] mb-[12px]">
                <button
                  onClick={() => { setPostMode('all'); setSelectedPostIds([]); }}
                  className={`rounded-[6px] px-[12px] py-[6px] text-[12px] border ${
                    postMode === 'all'
                      ? 'border-btnPrimary bg-btnPrimary/10 text-textColor'
                      : 'border-fifth text-customColor18 hover:border-btnPrimary'
                  }`}
                >
                  {t('wizard_all_posts', 'Any post')}
                </button>
                <button
                  onClick={() => setPostMode('specific')}
                  className={`rounded-[6px] px-[12px] py-[6px] text-[12px] border ${
                    postMode === 'specific'
                      ? 'border-btnPrimary bg-btnPrimary/10 text-textColor'
                      : 'border-fifth text-customColor18 hover:border-btnPrimary'
                  }`}
                >
                  {t('wizard_specific_posts', 'Specific posts')}
                </button>
              </div>

              {postMode === 'specific' && (
                <div className="mb-[12px]">
                  {postsLoading ? (
                    <p className="text-[12px] text-customColor18">
                      {t('loading_posts', 'Loading posts...')}
                    </p>
                  ) : !posts || !Array.isArray(posts) || posts.length === 0 ? (
                    <p className="text-[12px] text-customColor18">
                      {t('no_posts_found', 'No Instagram posts found. Reconnect the account or create posts first.')}
                    </p>
                  ) : (
                    <div className="max-h-[240px] overflow-y-auto space-y-[6px]">
                      {posts.map((post: any) => {
                        const isSelected = selectedPostIds.includes(post.id);
                        const thumb = post.thumbnailUrl || post.mediaUrl;
                        return (
                          <label
                            key={post.id}
                            className={`flex gap-[8px] p-[6px] rounded-[6px] cursor-pointer border ${
                              isSelected
                                ? 'border-btnPrimary bg-newBgColorInner'
                                : 'border-newTableBorder hover:border-btnPrimary'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePost(post.id)}
                              className="mt-[4px]"
                            />
                            {thumb && (
                              <img
                                src={thumb}
                                alt=""
                                className="w-[40px] h-[40px] rounded-[4px] object-cover flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-customColor18 uppercase">{post.mediaType}</p>
                              <p className="text-[11px] text-textColor truncate">
                                {post.caption || t('no_caption', '(no caption)')}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Keyword selection */}
              <label className="block text-[13px] text-textColor mb-[8px] font-medium mt-[16px]">
                {t('wizard_keyword_selection', 'Which words?')}
              </label>
              <div className="flex gap-[8px] mb-[12px]">
                <button
                  onClick={() => { setKeywordMode('any_word'); setKeywords([]); }}
                  className={`rounded-[6px] px-[12px] py-[6px] text-[12px] border ${
                    keywordMode === 'any_word'
                      ? 'border-btnPrimary bg-btnPrimary/10 text-textColor'
                      : 'border-fifth text-customColor18 hover:border-btnPrimary'
                  }`}
                >
                  {t('wizard_any_word', 'Any word')}
                </button>
                <button
                  onClick={() => setKeywordMode('specific')}
                  className={`rounded-[6px] px-[12px] py-[6px] text-[12px] border ${
                    keywordMode === 'specific'
                      ? 'border-btnPrimary bg-btnPrimary/10 text-textColor'
                      : 'border-fifth text-customColor18 hover:border-btnPrimary'
                  }`}
                >
                  {t('wizard_specific_words', 'Specific words')}
                </button>
              </div>

              {keywordMode === 'specific' && (
                <>
                  <div className={inputWrapperClass}>
                    <textarea
                      className={`${inputClass} min-h-[60px] resize-y`}
                      rows={2}
                      placeholder={t('wizard_keywords_placeholder', 'ebook, link, price (one per line or comma-separated)')}
                      value={keywords.join('\n')}
                      onChange={(e) =>
                        setKeywords(
                          e.target.value
                            .split(/[\n,]/)
                            .map((k) => k.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  </div>
                  <div className={`${inputWrapperClass} mt-[8px]`}>
                    <select
                      className={inputClass}
                      value={matchMode}
                      onChange={(e) => setMatchMode(e.target.value)}
                    >
                      <option value="any">{t('match_any', 'Any keyword')}</option>
                      <option value="all">{t('match_all', 'All keywords')}</option>
                      <option value="exact">{t('match_exact', 'Exact match')}</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Step 2: What they receive */}
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[4px]">
                {t('wizard_step2_title', 'What they receive...')}
              </h2>
              <p className="text-[12px] text-customColor18 mb-[12px]">
                {t('wizard_step2_desc', 'Configure the automatic reply and/or direct message.')}
              </p>

              {/* Reply comment toggle */}
              <label className="flex items-center gap-[8px] mb-[8px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableReply}
                  onChange={(e) => setEnableReply(e.target.checked)}
                />
                <span className="text-[13px] text-textColor font-medium">
                  {t('wizard_enable_reply', 'Reply to comment')}
                </span>
              </label>
              {enableReply && (
                <div className={`${inputWrapperClass} mb-[16px]`}>
                  <textarea
                    className={`${inputClass} min-h-[80px] resize-y`}
                    rows={3}
                    placeholder={t(
                      'reply_template_placeholder',
                      'Thanks {commenter_name} for your comment!'
                    )}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                  />
                </div>
              )}

              {/* DM toggle */}
              <label className="flex items-center gap-[8px] mb-[8px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableDm}
                  onChange={(e) => setEnableDm(e.target.checked)}
                />
                <span className="text-[13px] text-textColor font-medium">
                  {t('wizard_enable_dm', 'Send direct message')}
                </span>
              </label>
              {enableDm && (
                <>
                  <div className={inputWrapperClass}>
                    <textarea
                      className={`${inputClass} min-h-[100px] resize-y`}
                      rows={4}
                      placeholder={t(
                        'dm_template_placeholder',
                        'Hey {commenter_name}!\n\nHere is the link you requested...\n\nSee you soon!'
                      )}
                      value={dmMessage}
                      onChange={(e) => setDmMessage(e.target.value)}
                    />
                  </div>
                  <p className="text-[11px] text-customColor18 mt-[4px]">
                    {t(
                      'dm_multiline_hint',
                      'Use quebras de linha para separar paragrafos. A Meta permite apenas 1 mensagem direta por comentario.'
                    )}
                  </p>
                </>
              )}

              <p className="text-[11px] text-customColor18 mt-[8px]">
                {t(
                  'variables_hint',
                  'Variables: {commenter_name}, {comment_text}, {media_id}'
                )}
              </p>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="w-full rounded-[6px] bg-btnPrimary py-[12px] text-[14px] font-medium text-white hover:opacity-80 disabled:opacity-50"
            >
              {saving
                ? t('wizard_saving', 'Creating automation...')
                : t('wizard_save', 'Create Automation')}
            </button>
          </>
        )}
      </div>

      {/* Right side — phone preview */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-newBgColor border-l border-fifth p-[24px]">
        <WizardPhonePreview
          postThumb={selectedPost?.thumbnailUrl || selectedPost?.mediaUrl}
          postCaption={selectedPost?.caption}
          replyMessage={enableReply ? replyMessage : undefined}
          dmMessage={enableDm ? dmMessage : undefined}
        />
      </div>
    </div>
  );
};
