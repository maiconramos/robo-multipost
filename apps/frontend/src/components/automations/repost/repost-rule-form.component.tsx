'use client';

import { FC, useEffect, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  RepostRule,
  useRepostDestinationCandidates,
  useRepostSourceCandidates,
} from '@gitroom/frontend/components/automations/hooks/use-repost';

interface Props {
  initial?: RepostRule;
  mode: 'create' | 'edit';
  onSaved: (rule: RepostRule) => void;
  onCancel?: () => void;
}

const INTERVAL_PRESETS = [5, 15, 30, 60, 120, 360];

export const RepostRuleForm: FC<Props> = ({
  initial,
  mode,
  onSaved,
  onCancel,
}) => {
  const t = useT();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const { data: sourceCandidates, isLoading: loadingSources } =
    useRepostSourceCandidates();
  const { data: destCandidates, isLoading: loadingDests } =
    useRepostDestinationCandidates();

  const [name, setName] = useState(initial?.name ?? '');
  const [sourceId, setSourceId] = useState(initial?.sourceIntegrationId ?? '');
  const [destIds, setDestIds] = useState<string[]>(
    initial?.destinationIntegrationIds ?? []
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    initial?.intervalMinutes ?? 15
  );
  const [captionTemplate, setCaptionTemplate] = useState(
    initial?.captionTemplate ?? ''
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setSourceId(initial.sourceIntegrationId);
    setDestIds(initial.destinationIntegrationIds);
    setIntervalMinutes(initial.intervalMinutes);
    setCaptionTemplate(initial.captionTemplate ?? '');
    setEnabled(initial.enabled);
  }, [initial]);

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (!sourceId) return false;
    if (destIds.length === 0) return false;
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) return false;
    return !saving;
  }, [name, sourceId, destIds, intervalMinutes, saving]);

  const toggleDest = (id: string) => {
    setDestIds((current) =>
      current.includes(id) ? current.filter((d) => d !== id) : [...current, id]
    );
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const url =
        mode === 'create' ? '/repost/rules' : `/repost/rules/${initial?.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';
      const res = await fetchApi(url, {
        method,
        body: JSON.stringify({
          name: name.trim(),
          sourceIntegrationId: sourceId,
          destinationIntegrationIds: destIds,
          intervalMinutes,
          captionTemplate: captionTemplate.trim() || null,
          enabled,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toaster.show(
          body.message ||
            t('repost_save_failed', 'Falha ao salvar a regra de repost'),
          'warning'
        );
        return;
      }
      const saved = (await res.json()) as RepostRule;
      toaster.show(
        mode === 'create'
          ? t('repost_rule_created', 'Regra de repost criada')
          : t('repost_rule_updated', 'Regra de repost atualizada'),
        'success'
      );
      onSaved(saved);
    } catch {
      toaster.show(
        t('repost_save_failed', 'Falha ao salvar a regra de repost'),
        'warning'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-[20px] max-w-[920px]">
      <div>
        <h3 className="text-[14px] font-semibold text-textColor">
          {t('repost_wizard_title', 'Nova regra de Repost')}
        </h3>
        <p className="text-[12px] text-customColor18 mt-[4px]">
          {t(
            'repost_wizard_subtitle',
            'Monitore stories publicados no Instagram e republique em TikTok e YouTube Shorts.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
        <div className="border border-fifth rounded-[8px] p-[16px] bg-sixth/60">
          <div className="text-[11px] uppercase tracking-wide text-customColor18 mb-[8px]">
            {t('repost_post_from', 'Conteúdo de origem')}
          </div>
          {loadingSources ? (
            <p className="text-[12px] text-customColor18">
              {t('loading', 'Carregando...')}
            </p>
          ) : !sourceCandidates || sourceCandidates.length === 0 ? (
            <p className="text-[12px] text-customColor19">
              {t(
                'repost_no_source_channels',
                'Conecte uma conta Instagram Business para usar esta feature.'
              )}
            </p>
          ) : (
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full h-[40px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] text-[13px] text-textColor"
            >
              <option value="">
                {t('repost_select_source', 'Selecione a conta de origem...')}
              </option>
              {sourceCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="border border-fifth rounded-[8px] p-[16px] bg-sixth/60">
          <div className="text-[11px] uppercase tracking-wide text-customColor18 mb-[8px]">
            {t('repost_post_to', 'Canais de destino')}
          </div>
          {loadingDests ? (
            <p className="text-[12px] text-customColor18">
              {t('loading', 'Carregando...')}
            </p>
          ) : !destCandidates || destCandidates.length === 0 ? (
            <p className="text-[12px] text-customColor19">
              {t(
                'repost_no_destination_channels',
                'Conecte TikTok ou YouTube para repostar.'
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-[8px] max-h-[180px] overflow-y-auto pr-[4px]">
              {destCandidates.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-[8px] text-[13px] text-textColor cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={destIds.includes(c.id)}
                    onChange={() => toggleDest(c.id)}
                  />
                  {c.picture && (
                    <img
                      src={c.picture}
                      alt=""
                      className="h-[20px] w-[20px] rounded-full"
                    />
                  )}
                  <span>{c.name}</span>
                  <span className="ml-auto text-[11px] text-customColor18">
                    {c.providerIdentifier}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[14px]">
        <div className="flex flex-col gap-[6px]">
          <label className="text-[13px] text-textColor">
            {t('flow_name', 'Nome')}
          </label>
          <input
            type="text"
            className="h-[40px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] text-[13px] text-textColor"
            placeholder={t(
              'repost_rule_name_placeholder',
              'Ex.: Stories do @canal → TikTok + YouTube'
            )}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>

        <div className="flex flex-col gap-[6px]">
          <label className="text-[13px] text-textColor">
            {t('repost_check_every', 'Verificar novos stories a cada')}
          </label>
          <select
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(parseInt(e.target.value, 10))}
            className="h-[40px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] text-[13px] text-textColor"
          >
            {INTERVAL_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p < 60
                  ? `${p} ${t('minutes_short', 'min')}`
                  : `${p / 60} ${t('hours_short', 'h')}`}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-customColor18">
            {t(
              'repost_filter_videos_only_hint',
              'V1 repostará apenas vídeos. Fotos são puladas automaticamente.'
            )}
          </span>
        </div>

        <div className="flex flex-col gap-[6px]">
          <label className="text-[13px] text-textColor">
            {t('repost_caption_template', 'Legenda padrão')}
          </label>
          <textarea
            className="min-h-[84px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[10px] text-[13px] text-textColor"
            placeholder={t(
              'repost_caption_template_placeholder',
              'Texto para acompanhar cada repost. Use {{timestamp}} para incluir a data.'
            )}
            value={captionTemplate}
            onChange={(e) => setCaptionTemplate(e.target.value)}
            maxLength={2200}
          />
        </div>

        <label className="flex items-center gap-[8px] text-[13px] text-textColor cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {t('repost_toggle_enable', 'Ativar regra agora')}
        </label>
      </div>

      <div className="flex items-center justify-end gap-[8px] pt-[8px] border-t border-fifth">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-[4px] border border-fifth bg-btnSimple px-[16px] py-[8px] text-[13px] text-textColor hover:opacity-80"
          >
            {t('cancel', 'Cancelar')}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!canSave}
          className="rounded-[4px] bg-btnPrimary px-[16px] py-[8px] text-[13px] text-white hover:opacity-80 disabled:opacity-50"
        >
          {saving
            ? t('saving', 'Salvando...')
            : mode === 'create'
            ? t('create_and_continue', 'Criar e continuar')
            : t('save', 'Salvar')}
        </button>
      </div>
    </div>
  );
};
