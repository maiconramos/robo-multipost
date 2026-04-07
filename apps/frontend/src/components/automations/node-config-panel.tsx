'use client';

import { FC, useCallback, useState, useEffect } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

interface NodeConfigPanelProps {
  node: any;
  flowId: string;
  onUpdate: (nodeId: string, data: Record<string, any>) => void;
  onClose: () => void;
}

interface InstagramPost {
  id: string;
  caption?: string;
  mediaType: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  timestamp?: string;
}

const useFlowPosts = (flowId: string, enabled: boolean) => {
  const fetch = useFetch();
  return useSWR<InstagramPost[]>(
    enabled ? `/flows/${flowId}/posts` : null,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );
};

const EXAMPLE_CHIPS = ['Preço', 'Link', 'Comprar'];

const KeywordsField: FC<{
  t: (key: string, fallback: string) => string;
  keywords: string[];
  matchMode: string;
  onKeywordsChange: (kws: string[]) => void;
  onMatchModeChange: (m: string) => void;
  inputClass: string;
  inputWrapperClass: string;
}> = ({ t, keywords, matchMode, onKeywordsChange, onMatchModeChange, inputClass, inputWrapperClass }) => (
  <div>
    <label className="block text-[13px] font-semibold text-textColor mb-[8px]">
      {t('trigger_keywords', 'Palavras-chave')}
    </label>
    {/* Comma-separated input */}
    <div className={inputWrapperClass}>
      <input
        type="text"
        className={inputClass + ' h-[42px]'}
        placeholder={t('wizard_keywords_input_placeholder', 'Digite uma ou mais palavras')}
        value={keywords.join(', ')}
        onChange={(e) =>
          onKeywordsChange(
            e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
          )
        }
      />
    </div>
    <p className="text-[11px] text-customColor18 mt-[4px] mb-[8px]">
      {t('wizard_keywords_comma_hint', 'Use vírgulas para separar as palavras')}
    </p>
    {/* Example chips */}
    <div className="flex flex-wrap gap-[6px] mb-[10px]">
      <span className="text-[11px] text-customColor18">{t('wizard_example', 'Por exemplo:')}</span>
      {EXAMPLE_CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => {
            if (!keywords.includes(chip)) onKeywordsChange([...keywords, chip]);
          }}
          className={`text-[11px] px-[8px] py-[2px] rounded-[12px] border ${
            keywords.includes(chip)
              ? 'border-btnPrimary text-btnPrimary bg-btnPrimary/10'
              : 'border-fifth text-customColor18 hover:border-btnPrimary'
          }`}
        >
          {chip}
        </button>
      ))}
    </div>
    {/* Match mode — only shown when keywords exist */}
    {keywords.length > 0 && (
      <div className={inputWrapperClass}>
        <select
          className={inputClass}
          value={matchMode}
          onChange={(e) => onMatchModeChange(e.target.value)}
        >
          <option value="any">{t('match_any', 'Qualquer palavra-chave')}</option>
          <option value="all">{t('match_all', 'Todas as palavras-chave')}</option>
          <option value="exact">{t('match_exact', 'Correspondência exata')}</option>
        </select>
      </div>
    )}
  </div>
);

export const NodeConfigPanel: FC<NodeConfigPanelProps> = ({
  node,
  flowId,
  onUpdate,
  onClose,
}) => {
  const t = useT();
  const [config, setConfig] = useState<Record<string, any>>({});

  useEffect(() => {
    try {
      const parsed =
        typeof node.data?.config === 'string'
          ? JSON.parse(node.data.config)
          : node.data?.config || {};
      setConfig(parsed);
    } catch {
      setConfig({});
    }
  }, [node]);

  const handleSave = useCallback(() => {
    onUpdate(node.id, config);
  }, [node.id, config, onUpdate]);

  const inputClass =
    'w-full bg-transparent outline-none text-[14px] text-textColor px-[16px] py-[10px]';
  const inputWrapperClass =
    'bg-newBgColorInner border border-newTableBorder rounded-[8px]';

  const { data: posts, isLoading: postsLoading } = useFlowPosts(
    flowId,
    node.type === 'trigger'
  );

  const selectedPostIds: string[] = config.postIds || [];
  const togglePost = (postId: string) => {
    const set = new Set(selectedPostIds);
    if (set.has(postId)) {
      set.delete(postId);
    } else {
      set.add(postId);
    }
    setConfig({ ...config, postIds: Array.from(set) });
  };

  const renderFields = () => {
    switch (node.type) {
      case 'trigger':
        return (
          <>
            <label className="block text-[14px] text-textColor mb-[6px]">
              {t('trigger_posts_label', 'Monitored posts')}
            </label>
            <p className="text-[12px] text-customColor18 mb-[12px]">
              {t(
                'trigger_posts_hint',
                'Leave empty to monitor all posts, or select specific ones.'
              )}
            </p>
            {postsLoading && (
              <p className="text-[12px] text-customColor18">
                {t('loading_posts', 'Loading posts...')}
              </p>
            )}
            {!postsLoading && (!posts || posts.length === 0) && (
              <p className="text-[12px] text-customColor18">
                {t(
                  'no_posts_found',
                  'No Instagram posts found. Reconnect the account or create posts first.'
                )}
              </p>
            )}
            {!postsLoading && posts && posts.length > 0 && (
              <div className="max-h-[400px] overflow-y-auto space-y-[8px]">
                {posts.map((post) => {
                  const isSelected = selectedPostIds.includes(post.id);
                  const thumb = post.thumbnailUrl || post.mediaUrl;
                  return (
                    <label
                      key={post.id}
                      className={`flex gap-[8px] p-[8px] rounded-[6px] cursor-pointer border ${
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
                          className="w-[48px] h-[48px] rounded-[4px] object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-customColor18 uppercase">
                          {post.mediaType}
                        </p>
                        <p className="text-[12px] text-textColor truncate">
                          {post.caption || t('no_caption', '(no caption)')}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-[16px]">
              <KeywordsField
                t={t}
                keywords={config.keywords || []}
                matchMode={config.matchMode || 'any'}
                onKeywordsChange={(kws) => setConfig({ ...config, keywords: kws })}
                onMatchModeChange={(m) => setConfig({ ...config, matchMode: m })}
                inputClass={inputClass}
                inputWrapperClass={inputWrapperClass}
              />
            </div>
          </>
        );

      case 'condition':
        return (
          <>
            <KeywordsField
              t={t}
              keywords={config.keywords || []}
              matchMode={config.matchMode || 'any'}
              onKeywordsChange={(kws) => setConfig({ ...config, keywords: kws })}
              onMatchModeChange={(m) => setConfig({ ...config, matchMode: m })}
              inputClass={inputClass}
              inputWrapperClass={inputWrapperClass}
            />
          </>
        );

      case 'replyComment':
        return (
          <>
            <label className="block text-[14px] text-textColor mb-[6px]">
              {t('reply_template', 'Reply Template')}
            </label>
            <div className={inputWrapperClass}>
              <textarea
                className={`${inputClass} min-h-[100px] resize-y`}
                rows={4}
                placeholder={t(
                  'reply_template_placeholder',
                  'Thanks {commenter_name} for your comment!'
                )}
                value={config.message || ''}
                onChange={(e) =>
                  setConfig({ ...config, message: e.target.value })
                }
              />
            </div>
            <p className="text-[12px] text-customColor18 mt-[6px]">
              {t(
                'variables_hint',
                'Variables: {commenter_name}, {comment_text}, {media_id}'
              )}
            </p>
          </>
        );

      case 'sendDm':
        return (
          <>
            <label className="block text-[14px] text-textColor mb-[6px]">
              {t('dm_template', 'DM Template')}
            </label>
            <div className={inputWrapperClass}>
              <textarea
                className={`${inputClass} min-h-[120px] resize-y`}
                rows={6}
                placeholder={t(
                  'dm_template_placeholder',
                  'Hey {commenter_name}!\n\nHere is the link you requested...\n\nSee you soon!'
                )}
                value={config.message || ''}
                onChange={(e) =>
                  setConfig({ ...config, message: e.target.value })
                }
              />
            </div>
            <p className="text-[12px] text-customColor18 mt-[6px]">
              {t(
                'variables_hint',
                'Variables: {commenter_name}, {comment_text}, {media_id}'
              )}
            </p>
            <p className="text-[11px] text-customColor18 mt-[4px]">
              {t(
                'dm_multiline_hint',
                'Use quebras de linha para separar paragrafos. A Meta permite apenas 1 mensagem direta por comentario.'
              )}
            </p>
          </>
        );

      case 'delay':
        return (
          <>
            <label className="block text-[14px] text-textColor mb-[6px]">
              {t('delay_duration', 'Delay Duration')}
            </label>
            <div className="flex gap-[8px]">
              <div className={`${inputWrapperClass} w-[80px]`}>
                <input
                  type="number"
                  className={inputClass}
                  min={0}
                  value={config.duration || 0}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      duration: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </div>
              <div className={`${inputWrapperClass} flex-1`}>
                <select
                  className={inputClass}
                  value={config.unit || 'seconds'}
                  onChange={(e) =>
                    setConfig({ ...config, unit: e.target.value })
                  }
                >
                  <option value="seconds">{t('seconds', 'Seconds')}</option>
                  <option value="minutes">{t('minutes', 'Minutes')}</option>
                  <option value="hours">{t('hours', 'Hours')}</option>
                </select>
              </div>
            </div>
          </>
        );

      default:
        return (
          <p className="text-[14px] text-customColor18">
            {t('no_config_available', 'No configuration available for this node')}
          </p>
        );
    }
  };

  return (
    <div className="absolute right-0 top-0 h-full w-[320px] border-l border-fifth bg-newBgColorInner p-[16px] overflow-y-auto z-10">
      <div className="flex items-center justify-between mb-[16px]">
        <h3 className="text-[14px] font-semibold text-textColor">
          {t('node_config', 'Node Configuration')}
        </h3>
        <button
          onClick={onClose}
          className="text-customColor18 hover:text-textColor text-[18px]"
        >
          &times;
        </button>
      </div>

      {renderFields()}

      <button
        onClick={handleSave}
        className="mt-[16px] w-full rounded-[4px] bg-btnPrimary py-[8px] text-[14px] font-medium text-white hover:opacity-80"
      >
        {t('save_config', 'Save')}
      </button>
    </div>
  );
};
