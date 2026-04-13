'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { WizardPhonePreview } from '@gitroom/frontend/components/automations/wizard-phone-preview.component';
import { AddLinkModal } from '@gitroom/frontend/components/automations/add-link-modal.component';

interface Props {
  flowId?: string;
  initialFlow?: any;
}

function safeJson(data?: string): Record<string, any> {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

const RadioDot: FC<{ active: boolean }> = ({ active }) => (
  <div
    className={`w-[16px] h-[16px] rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
      active ? 'border-btnPrimary' : 'border-customColor18'
    }`}
  >
    {active && <div className="w-[8px] h-[8px] rounded-full bg-btnPrimary" />}
  </div>
);

export const StoryWizardComponent: FC<Props> = ({ flowId, initialFlow }) => {
  const t = useT();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: integrations } = useIntegrationList();
  const isEditing = !!flowId;

  const [name, setName] = useState('');
  const [integrationId, setIntegrationId] = useState('');
  const [storyMode, setStoryMode] = useState<'all' | 'specific' | 'next_publication'>('all');
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [keywordMode, setKeywordMode] = useState<'any_word_or_reaction' | 'specific'>('any_word_or_reaction');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [matchReactions, setMatchReactions] = useState(true);
  const [requireFollow, setRequireFollow] = useState(false);
  const [dmMessage, setDmMessage] = useState('');
  const [dmButtonText, setDmButtonText] = useState('');
  const [dmButtonUrl, setDmButtonUrl] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState<
    'post' | 'comments' | 'dm' | 'story'
  >('story');

  useEffect(() => {
    if (!initialFlow) return;
    setName(initialFlow.name || '');
    setIntegrationId(initialFlow.integrationId || initialFlow.integration?.id || '');
    const triggerNode = initialFlow.nodes?.find((n: any) => n.type === 'TRIGGER');
    const dmNode = initialFlow.nodes?.find((n: any) => n.type === 'SEND_DM');
    const triggerCfg = safeJson(triggerNode?.data);
    const dmCfg = safeJson(dmNode?.data);

    if (triggerCfg.mode === 'next_publication') {
      setStoryMode('next_publication');
    } else if (triggerCfg.storyIds?.length) {
      setStoryMode('specific');
      setSelectedStoryIds(triggerCfg.storyIds);
    } else {
      setStoryMode('all');
    }
    if (triggerCfg.keywords?.length) {
      setKeywordMode('specific');
      setKeywords(triggerCfg.keywords);
    }
    if (typeof triggerCfg.matchReactions === 'boolean') {
      setMatchReactions(triggerCfg.matchReactions);
    }
    if (typeof triggerCfg.requireFollow === 'boolean') {
      setRequireFollow(triggerCfg.requireFollow);
    }
    if (dmCfg.message) setDmMessage(dmCfg.message);
    if (dmCfg.buttonText) setDmButtonText(dmCfg.buttonText);
    if (dmCfg.buttonUrl) setDmButtonUrl(dmCfg.buttonUrl);
  }, [initialFlow]);

  useEffect(() => {
    if (dmMessage) {
      setActivePreviewTab('dm');
    } else {
      setActivePreviewTab('story');
    }
  }, [dmMessage]);

  const instagramIntegrations = useMemo(() => {
    if (!Array.isArray(integrations)) return [];
    return integrations.filter((i: any) => i.identifier === 'instagram');
  }, [integrations]);

  const selectedIntegration = useMemo(
    () => instagramIntegrations.find((ig: any) => ig.id === integrationId) || null,
    [instagramIntegrations, integrationId]
  );

  const addKeyword = () => {
    const v = keywordInput.trim();
    if (!v) return;
    if (!keywords.includes(v)) setKeywords([...keywords, v]);
    setKeywordInput('');
  };

  const removeKeyword = (k: string) => setKeywords(keywords.filter((x) => x !== k));

  const canSave =
    !!name.trim() && !!integrationId && dmMessage.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        integrationId,
        triggerType: 'story_reply',
        postMode: storyMode,
        matchReactions,
        requireFollow,
      };
      if (storyMode === 'specific' && selectedStoryIds.length > 0) {
        body.storyIds = selectedStoryIds;
      }
      if (keywordMode === 'specific' && keywords.length > 0) {
        body.keywords = keywords;
      }
      if (dmMessage.trim()) {
        body.dmMessage = dmMessage.trim();
        if (dmButtonText.trim() && dmButtonUrl.trim()) {
          body.dmButtonText = dmButtonText.trim();
          body.dmButtonUrl = dmButtonUrl.trim();
        }
      }

      const url = isEditing
        ? `/flows/${flowId}/quick-update`
        : '/flows/quick-create';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toaster.show(
          data.message || t('failed_to_create_flow', 'Falha ao criar automacao'),
          'warning'
        );
        return;
      }
      const flow = await res.json();
      toaster.show(
        isEditing
          ? t('flow_updated', 'Automacao atualizada com sucesso')
          : t('flow_created', 'Automacao criada com sucesso'),
        'success'
      );
      router.push(`/automacoes/${flow.id}`);
    } catch {
      toaster.show(
        t('failed_to_create_flow', 'Falha ao criar automacao'),
        'warning'
      );
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    name,
    integrationId,
    storyMode,
    selectedStoryIds,
    keywordMode,
    keywords,
    matchReactions,
    requireFollow,
    dmMessage,
    dmButtonText,
    dmButtonUrl,
    isEditing,
    flowId,
    fetchApi,
    router,
    toaster,
    t,
  ]);

  const sectionClass = 'flex flex-col gap-[12px]';
  const sectionTitleClass = 'text-[13px] font-semibold text-textColor';
  const radioRowClass =
    'flex items-start gap-[10px] p-[12px] rounded-[6px] border border-fifth cursor-pointer hover:bg-boxHover';

  return (
    <div className="flex flex-1 flex-col lg:flex-row gap-[24px] p-[24px]">
      {/* Left: form */}
      <div className="flex-1 flex flex-col gap-[24px] max-w-[560px]">
        {/* Header */}
        <div>
          <h1 className="text-[20px] font-semibold text-textColor">
            {isEditing
              ? t('story_wizard_title_edit', 'Editar automacao de story')
              : t('story_wizard_title', 'Nova automacao de story')}
          </h1>
          <p className="text-[12px] text-customColor18 mt-[4px]">
            {t(
              'story_wizard_subtitle',
              'Responda automaticamente via DM quando alguem responder seu story'
            )}
          </p>
        </div>

        {/* Name + integration */}
        <div className={sectionClass}>
          <label className="text-[12px] text-customColor18">
            {t('flow_name', 'Nome')}
          </label>
          <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
            <input
              type="text"
              className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px]"
              placeholder={t(
                'story_flow_name_placeholder',
                'Minha automacao de story'
              )}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {!isEditing && (
            <>
              <label className="text-[12px] text-customColor18 mt-[6px]">
                {t('select_instagram_account', 'Conta do Instagram')}
              </label>
              <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
                <select
                  className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px] appearance-none"
                  value={integrationId}
                  onChange={(e) => setIntegrationId(e.target.value)}
                >
                  <option value="">
                    {t('select_account', 'Selecione uma conta...')}
                  </option>
                  {instagramIntegrations.map((ig: any) => (
                    <option key={ig.id} value={ig.id}>
                      {ig.name || ig.display || ig.id}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Story mode */}
        <div className={sectionClass}>
          <h3 className={sectionTitleClass}>
            {t('story_section_when', 'Quando alguem responder')}
          </h3>
          <label
            className={radioRowClass}
            onClick={() => setStoryMode('all')}
          >
            <RadioDot active={storyMode === 'all'} />
            <div>
              <div className="text-[13px] text-textColor">
                {t('story_mode_all', 'Qualquer story')}
              </div>
              <div className="text-[11px] text-customColor18 mt-[2px]">
                {t(
                  'story_mode_all_hint',
                  'A automacao vai reagir a qualquer story publicado'
                )}
              </div>
            </div>
          </label>
          <label
            className={radioRowClass}
            onClick={() => setStoryMode('next_publication')}
          >
            <RadioDot active={storyMode === 'next_publication'} />
            <div>
              <div className="text-[13px] text-textColor">
                {t('story_mode_next', 'Proximo story')}
              </div>
              <div className="text-[11px] text-customColor18 mt-[2px]">
                {t(
                  'story_mode_next_hint',
                  'Vincula ao proximo story publicado nesta conta'
                )}
              </div>
            </div>
          </label>
          <label
            className={radioRowClass}
            onClick={() => setStoryMode('specific')}
          >
            <RadioDot active={storyMode === 'specific'} />
            <div>
              <div className="text-[13px] text-textColor">
                {t('story_mode_specific', 'Story especifico')}
              </div>
              <div className="text-[11px] text-customColor18 mt-[2px]">
                {t(
                  'story_mode_specific_hint',
                  'Informe o ID do story (visivel no Meta Business Suite)'
                )}
              </div>
              {storyMode === 'specific' && (
                <input
                  type="text"
                  value={selectedStoryIds.join(',')}
                  onChange={(e) =>
                    setSelectedStoryIds(
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="mt-[8px] w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[6px] outline-none"
                  placeholder={t('story_ids_placeholder', 'ID do story')}
                />
              )}
            </div>
          </label>
        </div>

        {/* Keyword mode */}
        <div className={sectionClass}>
          <h3 className={sectionTitleClass}>
            {t('story_section_contains', 'E essa resposta contem')}
          </h3>
          <label
            className={radioRowClass}
            onClick={() => setKeywordMode('any_word_or_reaction')}
          >
            <RadioDot active={keywordMode === 'any_word_or_reaction'} />
            <div className="text-[13px] text-textColor">
              {t(
                'story_keyword_mode_any',
                'Qualquer palavra-chave ou reacao'
              )}
            </div>
          </label>
          <label
            className={radioRowClass}
            onClick={() => setKeywordMode('specific')}
          >
            <RadioDot active={keywordMode === 'specific'} />
            <div className="w-full">
              <div className="text-[13px] text-textColor">
                {t(
                  'story_keyword_mode_specific',
                  'Palavras ou reacoes especificas'
                )}
              </div>
              {keywordMode === 'specific' && (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-[6px] mt-[8px]">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      className="flex-1 bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[6px] outline-none"
                      placeholder={t(
                        'story_keywords_placeholder',
                        'Adicionar palavra-chave'
                      )}
                    />
                    <button
                      type="button"
                      onClick={addKeyword}
                      className="rounded-[4px] bg-btnPrimary text-white text-[11px] px-[10px] py-[6px]"
                    >
                      {t('add', 'Adicionar')}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-[6px] mt-[8px]">
                    {keywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-[6px] rounded-[12px] bg-btnSimple border border-fifth px-[8px] py-[2px] text-[11px] text-textColor"
                      >
                        {k}
                        <button
                          type="button"
                          onClick={() => removeKeyword(k)}
                          className="text-customColor18 hover:text-textColor"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </label>
        </div>

        {/* DM section */}
        <div className={sectionClass}>
          <h3 className={sectionTitleClass}>
            {t('story_section_dm', 'A DM com o link sera enviada')}
          </h3>
          <textarea
            value={dmMessage}
            onChange={(e) => setDmMessage(e.target.value)}
            rows={4}
            placeholder={t(
              'story_dm_placeholder',
              'Escreva uma mensagem...'
            )}
            className="w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] text-[13px] text-textColor px-[14px] py-[10px] outline-none resize-none"
          />
          <button
            type="button"
            onClick={() => setShowAddLink(true)}
            className="self-start rounded-[4px] border border-dashed border-fifth text-[12px] text-textColor px-[14px] py-[8px] hover:bg-boxHover"
          >
            {dmButtonText && dmButtonUrl
              ? `${dmButtonText} · ${dmButtonUrl}`
              : `+ ${t('story_add_link', 'Adicionar um link')}`}
          </button>
        </div>

        {/* Extras */}
        <div className={sectionClass}>
          <h3 className={sectionTitleClass}>
            {t('story_section_extras', 'Outros recursos para automatizar')}
          </h3>
          <label className="flex items-center justify-between gap-[12px] p-[10px] rounded-[6px] border border-fifth">
            <div>
              <div className="text-[13px] text-textColor">
                {t('story_match_reactions', 'Responder reacoes nos stories')}
              </div>
              <div className="text-[11px] text-customColor18 mt-[2px]">
                {t(
                  'story_match_reactions_hint',
                  'Reacoes com emoji contam como gatilho'
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={matchReactions}
              onChange={(e) => setMatchReactions(e.target.checked)}
              className="h-[18px] w-[18px] accent-btnPrimary cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between gap-[12px] p-[10px] rounded-[6px] border border-fifth">
            <div>
              <div className="text-[13px] text-textColor">
                {t('story_require_follow', 'Pedir para seguir antes de enviar')}
              </div>
              <div className="text-[11px] text-customColor18 mt-[2px]">
                {t(
                  'story_require_follow_hint',
                  'Configuracao salva. Verificacao de follow sera adicionada em breve.'
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={requireFollow}
              onChange={(e) => setRequireFollow(e.target.checked)}
              className="h-[18px] w-[18px] accent-btnPrimary cursor-pointer"
            />
          </label>
        </div>

        {/* Save */}
        <div className="flex gap-[8px] pt-[8px]">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-[4px] bg-btnPrimary px-[16px] py-[10px] text-[13px] text-white hover:opacity-80 disabled:opacity-50"
          >
            {saving
              ? t('saving', 'Salvando...')
              : isEditing
              ? t('save', 'Salvar')
              : t('create', 'Criar')}
          </button>
          <button
            type="button"
            onClick={() => router.push('/automacoes')}
            className="rounded-[4px] border border-fifth bg-btnSimple px-[16px] py-[10px] text-[13px] text-textColor hover:opacity-80"
          >
            {t('cancel', 'Cancelar')}
          </button>
        </div>
      </div>

      {/* Right: preview */}
      <div className="flex-shrink-0 flex items-start justify-center lg:sticky lg:top-[24px]">
        <WizardPhonePreview
          variant="story"
          storyMode={storyMode}
          dmMessage={dmMessage}
          dmButtonText={dmButtonText}
          dmButtonUrl={dmButtonUrl}
          commenterName="usuario"
          integrationPicture={selectedIntegration?.picture}
          integrationName={selectedIntegration?.name}
          activeTab={activePreviewTab}
          onTabChange={(t) => setActivePreviewTab(t)}
        />
      </div>

      <AddLinkModal
        open={showAddLink}
        initialText={dmButtonText}
        initialUrl={dmButtonUrl}
        onClose={() => setShowAddLink(false)}
        onSave={(text, url) => {
          setDmButtonText(text);
          setDmButtonUrl(url);
        }}
      />
    </div>
  );
};
