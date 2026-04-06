'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  useProfilesList,
  useProfilePersona,
  ProfilePersona,
} from '@gitroom/frontend/components/settings/profile-persona.hooks';

const TONE_PRESETS = [
  { value: '', key: 'persona_custom_blank', fallback: 'Custom / none' },
  { value: 'professional and authoritative', key: 'persona_tone_professional', fallback: 'Professional and authoritative' },
  { value: 'friendly and conversational', key: 'persona_tone_friendly', fallback: 'Friendly and conversational' },
  { value: 'playful and witty', key: 'persona_tone_playful', fallback: 'Playful and witty' },
  { value: 'inspirational and motivational', key: 'persona_tone_inspirational', fallback: 'Inspirational and motivational' },
  { value: 'technical and precise', key: 'persona_tone_technical', fallback: 'Technical and precise' },
  { value: 'casual and relaxed', key: 'persona_tone_casual', fallback: 'Casual and relaxed' },
];

const STYLE_PRESETS = [
  { value: '', key: 'persona_custom_blank', fallback: 'Custom / none' },
  { value: 'photorealistic, natural lighting', key: 'persona_style_photoreal', fallback: 'Photorealistic, natural lighting' },
  { value: 'minimalist flat illustration', key: 'persona_style_flat', fallback: 'Minimalist flat illustration' },
  { value: '3D render, clean, modern', key: 'persona_style_3d', fallback: '3D render, clean and modern' },
  { value: 'watercolor painting', key: 'persona_style_watercolor', fallback: 'Watercolor painting' },
  { value: 'corporate, professional stock photography', key: 'persona_style_corporate', fallback: 'Corporate stock photography' },
  { value: 'vibrant, bold colors, cartoon style', key: 'persona_style_cartoon', fallback: 'Vibrant, cartoon style' },
];

const emptyPersona: ProfilePersona = {
  brandDescription: '',
  toneOfVoice: '',
  writingInstructions: '',
  preferredCtas: [],
  contentRestrictions: '',
  imageStyle: '',
  targetAudience: '',
  examplePosts: [],
};

interface LabeledTextareaProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
}

const LabeledTextarea: React.FC<LabeledTextareaProps> = ({
  label,
  placeholder,
  value,
  onChange,
  rows = 3,
  maxLength,
}) => (
  <div className="flex flex-col gap-[6px]">
    <label className="text-[13px] text-textColor">{label}</label>
    <textarea
      className="bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[10px] py-[8px] outline-none resize-y"
      rows={rows}
      maxLength={maxLength}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

interface LabeledInputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}

const LabeledInput: React.FC<LabeledInputProps> = ({
  label,
  placeholder,
  value,
  onChange,
  maxLength,
}) => (
  <div className="flex flex-col gap-[6px]">
    <label className="text-[13px] text-textColor">{label}</label>
    <input
      className="h-[34px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[10px] outline-none"
      maxLength={maxLength}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

interface SelectPresetProps {
  label: string;
  value: string;
  options: { value: string; key: string; fallback: string }[];
  onChange: (v: string) => void;
  placeholder: string;
  t: (key: string, fallback: string) => string;
}

const SelectPreset: React.FC<SelectPresetProps> = ({
  label,
  value,
  options,
  onChange,
  placeholder,
  t,
}) => {
  const isPreset = options.some((o) => o.value === value);
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[13px] text-textColor">{label}</label>
      <select
        className="h-[34px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[8px] outline-none"
        value={isPreset ? value : '__custom__'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom__') return;
          onChange(v);
        }}
      >
        {options.map((opt) => (
          <option key={opt.value || 'empty'} value={opt.value}>
            {t(opt.key, opt.fallback)}
          </option>
        ))}
        {!isPreset && (
          <option value="__custom__">
            {t('persona_custom_option', 'Custom')}
          </option>
        )}
      </select>
      <input
        className="h-[34px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[10px] outline-none"
        maxLength={500}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

interface TagInputProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  t: (key: string, fallback: string) => string;
  maxItems?: number;
}

const TagInput: React.FC<TagInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  t,
  maxItems = 20,
}) => {
  const [input, setInput] = useState('');
  const add = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    if (value.length >= maxItems) return;
    onChange([...value, trimmed]);
    setInput('');
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[13px] text-textColor">{label}</label>
      <div className="flex flex-wrap gap-[6px]">
        {value.map((tag, idx) => (
          <div
            key={`${tag}-${idx}`}
            className="flex items-center gap-[6px] bg-newBgColorInner border border-newTableBorder rounded-[4px] px-[8px] py-[4px] text-[12px] text-textColor"
          >
            {tag}
            <button
              type="button"
              className="text-customColor19 hover:underline"
              onClick={() => remove(idx)}
            >
              x
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-[6px]">
        <input
          className="flex-1 h-[34px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[10px] outline-none"
          value={input}
          placeholder={placeholder}
          maxLength={100}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button onClick={add} secondary>
          {t('persona_add', 'Add')}
        </Button>
      </div>
    </div>
  );
};

interface MultiTextareaProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  maxItems?: number;
  t: (key: string, fallback: string) => string;
}

const MultiTextarea: React.FC<MultiTextareaProps> = ({
  label,
  value,
  onChange,
  maxItems = 5,
  t,
}) => {
  const items = value.length ? value : [''];
  const update = (idx: number, v: string) => {
    const next = [...items];
    next[idx] = v;
    onChange(next);
  };
  const add = () => {
    if (items.length >= maxItems) return;
    onChange([...items, '']);
  };
  const remove = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[13px] text-textColor">{label}</label>
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-[6px]">
          <textarea
            rows={3}
            maxLength={5000}
            className="flex-1 bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[10px] py-[8px] outline-none resize-y"
            value={item}
            placeholder={t(
              'persona_example_placeholder',
              'Paste an example post that reflects this brand voice'
            )}
            onChange={(e) => update(idx, e.target.value)}
          />
          <Button onClick={() => remove(idx)} secondary>
            {t('persona_remove', 'Remove')}
          </Button>
        </div>
      ))}
      {items.length < maxItems && (
        <div>
          <Button onClick={add} secondary>
            {t('persona_add_example', 'Add example')}
          </Button>
        </div>
      )}
    </div>
  );
};

export const ProfilePersonaSettingsSection: React.FC<{ profileId?: string | null }> = ({ profileId: profileIdProp }) => {
  const t = useT();
  const toaster = useToaster();
  const fetchRaw = useFetch();
  const { data: profiles } = useProfilesList();

  // Internal selector only when no profileId prop
  const [internalProfileId, setInternalProfileId] = useState<string | null>(null);
  const selectedProfileId = profileIdProp !== undefined ? profileIdProp : internalProfileId;

  useEffect(() => {
    if (profileIdProp === undefined && !internalProfileId && profiles && profiles.length > 0) {
      setInternalProfileId(profiles[0].id);
    }
  }, [profiles, internalProfileId, profileIdProp]);

  const { data, mutate, isLoading } = useProfilePersona(selectedProfileId);
  const [form, setForm] = useState<ProfilePersona>(emptyPersona);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.persona) {
      setForm({
        brandDescription: data.persona.brandDescription ?? '',
        toneOfVoice: data.persona.toneOfVoice ?? '',
        writingInstructions: data.persona.writingInstructions ?? '',
        preferredCtas: data.persona.preferredCtas ?? [],
        contentRestrictions: data.persona.contentRestrictions ?? '',
        imageStyle: data.persona.imageStyle ?? '',
        targetAudience: data.persona.targetAudience ?? '',
        examplePosts: data.persona.examplePosts ?? [],
      });
    } else if (selectedProfileId) {
      setForm(emptyPersona);
    }
  }, [data, selectedProfileId]);

  const update = useCallback(<K extends keyof ProfilePersona>(k: K, v: ProfilePersona[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  const save = useCallback(async () => {
    if (!selectedProfileId) return;
    setSaving(true);
    try {
      const res = await fetchRaw(
        `/settings/profiles/${selectedProfileId}/persona`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...form,
            examplePosts: (form.examplePosts || []).filter((s) => s.trim()).slice(0, 5),
            preferredCtas: (form.preferredCtas || []).filter((s) => s.trim()),
          }),
        }
      );
      if (res.ok) {
        toaster.show(t('persona_saved', 'Persona saved'), 'success');
        await mutate();
      } else {
        const err = await res.json().catch(() => ({}));
        toaster.show(err.message || t('persona_save_error', 'Failed to save persona'), 'warning');
      }
    } catch {
      toaster.show(t('persona_save_error', 'Failed to save persona'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [selectedProfileId, form, fetchRaw, mutate, toaster, t]);

  const clear = useCallback(async () => {
    if (!selectedProfileId) return;
    setSaving(true);
    try {
      const res = await fetchRaw(
        `/settings/profiles/${selectedProfileId}/persona`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setForm(emptyPersona);
        toaster.show(t('persona_cleared', 'Persona cleared'), 'success');
        await mutate();
      }
    } finally {
      setSaving(false);
    }
  }, [selectedProfileId, fetchRaw, mutate, toaster, t]);

  const profileOptions = useMemo(
    () =>
      (profiles || []).map((p) => ({
        id: p.id,
        name: p.isDefault ? `${p.name} (default)` : p.name,
      })),
    [profiles]
  );

  const showStandalone = profileIdProp === undefined;

  return (
    <div className="flex flex-col">
      {showStandalone && (
        <>
          <h3 className="text-[20px]">{t('persona_title', 'AI Persona')}</h3>
          <div className="text-customColor18 mt-[4px] text-[13px]">
            {t(
              'persona_description',
              'Define how the AI agent writes for each profile (tone, CTAs, image style, restrictions).'
            )}
          </div>
        </>
      )}

      <div className={showStandalone ? 'my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[20px] flex flex-col gap-[14px]' : 'flex flex-col gap-[14px]'}>
        {showStandalone && (
          <div className="flex flex-col gap-[6px]">
            <label className="text-[13px] text-textColor">
              {t('persona_select_profile', 'Profile')}
            </label>
            <select
              className="h-[36px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[8px] outline-none max-w-[380px]"
              value={selectedProfileId ?? ''}
              onChange={(e) => setInternalProfileId(e.target.value || null)}
            >
              {profileOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {isLoading ? (
          <div className="text-customColor18 text-[13px]">
            {t('persona_loading', 'Loading...')}
          </div>
        ) : (
          <>
            <LabeledTextarea
              label={t('persona_brand_description', 'Brand description')}
              placeholder={t(
                'persona_brand_placeholder',
                'What does this brand do, who does it serve, what makes it unique?'
              )}
              value={form.brandDescription || ''}
              onChange={(v) => update('brandDescription', v)}
              maxLength={2000}
              rows={3}
            />
            <LabeledInput
              label={t('persona_target_audience', 'Target audience')}
              placeholder={t(
                'persona_audience_placeholder',
                'Women aged 30-50 interested in weight loss'
              )}
              value={form.targetAudience || ''}
              onChange={(v) => update('targetAudience', v)}
              maxLength={1000}
            />
            <SelectPreset
              label={t('persona_tone', 'Tone of voice')}
              value={form.toneOfVoice || ''}
              options={TONE_PRESETS}
              onChange={(v) => update('toneOfVoice', v)}
              placeholder={t('persona_tone_placeholder', 'Custom tone of voice')}
              t={t}
            />
            <LabeledTextarea
              label={t('persona_writing_instructions', 'Writing instructions')}
              placeholder={t(
                'persona_writing_placeholder',
                'Extra rules: use emojis sparingly, always mention the brand name once, etc.'
              )}
              value={form.writingInstructions || ''}
              onChange={(v) => update('writingInstructions', v)}
              maxLength={2000}
              rows={4}
            />
            <TagInput
              label={t('persona_preferred_ctas', 'Preferred CTAs')}
              value={form.preferredCtas || []}
              onChange={(v) => update('preferredCtas', v)}
              placeholder={t('persona_ctas_placeholder', 'Press Enter to add a CTA')}
              t={t}
            />
            <LabeledTextarea
              label={t('persona_restrictions', 'Content restrictions')}
              placeholder={t(
                'persona_restrictions_placeholder',
                "Never mention competitors, never use the word 'cure', etc."
              )}
              value={form.contentRestrictions || ''}
              onChange={(v) => update('contentRestrictions', v)}
              maxLength={2000}
              rows={3}
            />
            <SelectPreset
              label={t('persona_image_style', 'Image style')}
              value={form.imageStyle || ''}
              options={STYLE_PRESETS}
              onChange={(v) => update('imageStyle', v)}
              placeholder={t('persona_style_placeholder', 'Custom image style')}
              t={t}
            />
            <MultiTextarea
              label={t('persona_example_posts', 'Example posts (max 5)')}
              value={form.examplePosts || []}
              onChange={(v) => update('examplePosts', v)}
              t={t}
            />

            <div className="flex gap-[8px] mt-[8px]">
              <Button onClick={save} loading={saving}>
                {t('persona_save', 'Save persona')}
              </Button>
              <Button onClick={clear} secondary>
                {t('persona_clear', 'Clear persona')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePersonaSettingsSection;
