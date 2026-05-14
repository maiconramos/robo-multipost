'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import {
  useProfilePersona,
  ProfilePersona,
} from '@gitroom/frontend/components/settings/profile-persona.hooks';

const ICON_SIZE = 16;

const BrandIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <path
      d="M3 21V8l9-5 9 5v13M3 21h18M9 21v-7h6v7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AudienceIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
    <path
      d="M3 20c0-3 2.7-5 6-5s6 2 6 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="2" />
    <path
      d="M15 20c0-2 1-3.5 3-4 2.5-.6 3 1.5 3 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const ToneIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <path
      d="M21 12c0 4.5-4 8-9 8-1.4 0-2.7-.3-3.9-.8L3 21l1.8-4.4C3.7 15 3 13.6 3 12c0-4.5 4-8 9-8s9 3.5 9 8z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <path
      d="M4 20h4l10-10-4-4L4 16v4z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M13 7l4 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const MegaphoneIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <path
      d="M3 10v4l11 5V5L3 10zM14 8a4 4 0 010 8M7 14v3a2 2 0 002 2h.5l-1-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ShieldIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M9 12l2 2 4-4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PaletteIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3a9 9 0 100 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 005-5c0-4.4-4-8-9-8z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="7.5" cy="11" r="1.2" fill="currentColor" />
    <circle cx="10" cy="7.5" r="1.2" fill="currentColor" />
    <circle cx="14" cy="7.5" r="1.2" fill="currentColor" />
    <circle cx="17" cy="11" r="1.2" fill="currentColor" />
  </svg>
);

const DocumentIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <path
      d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M14 3v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const PlusIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const CloseIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <path
      d="M6 6l12 12M6 18L18 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

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

interface FieldLabelProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}

const FieldLabel: React.FC<FieldLabelProps> = ({ icon, children, right }) => (
  <div className="flex items-center justify-between gap-[8px]">
    <label className="flex items-center gap-[6px] text-[13px] text-textColor">
      {icon && <span className="text-customColor18">{icon}</span>}
      {children}
    </label>
    {right}
  </div>
);

interface LabeledTextareaProps {
  label: string;
  icon?: React.ReactNode;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  minHeight?: number;
}

const LabeledTextarea: React.FC<LabeledTextareaProps> = ({
  label,
  icon,
  placeholder,
  value,
  onChange,
  rows = 3,
  maxLength,
  minHeight,
}) => (
  <div className="flex flex-col gap-[6px]">
    <FieldLabel icon={icon}>{label}</FieldLabel>
    <textarea
      className="bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[12px] py-[10px] outline-none resize-y"
      rows={rows}
      maxLength={maxLength}
      style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

interface LabeledInputProps {
  label: string;
  icon?: React.ReactNode;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}

const LabeledInput: React.FC<LabeledInputProps> = ({
  label,
  icon,
  placeholder,
  value,
  onChange,
  maxLength,
}) => (
  <div className="flex flex-col gap-[6px]">
    <FieldLabel icon={icon}>{label}</FieldLabel>
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
  icon?: React.ReactNode;
  value: string;
  options: { value: string; key: string; fallback: string }[];
  onChange: (v: string) => void;
  placeholder: string;
  t: (key: string, fallback: string) => string;
}

const SelectPreset: React.FC<SelectPresetProps> = ({
  label,
  icon,
  value,
  options,
  onChange,
  placeholder,
  t,
}) => {
  const isPreset = options.some((o) => o.value === value);
  return (
    <div className="flex flex-col gap-[6px]">
      <FieldLabel icon={icon}>{label}</FieldLabel>
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
  icon?: React.ReactNode;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  t: (key: string, fallback: string) => string;
  maxItems?: number;
}

const TagInput: React.FC<TagInputProps> = ({
  label,
  icon,
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
      <FieldLabel icon={icon}>{label}</FieldLabel>
      <div className="flex flex-wrap gap-[6px]">
        {value.map((tag, idx) => (
          <div
            key={`${tag}-${idx}`}
            className="flex items-center gap-[6px] bg-newBgColorInner border border-newTableBorder rounded-[4px] px-[8px] py-[4px] text-[12px] text-textColor"
          >
            {tag}
            <button
              type="button"
              className="text-red-500 hover:text-red-400 font-semibold"
              onClick={() => remove(idx)}
              aria-label={t('persona_remove', 'Remove')}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="relative">
        <input
          className="w-full h-[34px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor pl-[12px] pr-[36px] outline-none"
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
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          aria-label={t('persona_add', 'Add')}
          className="absolute right-[4px] top-1/2 -translate-y-1/2 flex items-center justify-center w-[26px] h-[26px] rounded-full text-textColor hover:bg-newTableBorder disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
};

interface MultiTextareaProps {
  label: string;
  icon?: React.ReactNode;
  value: string[];
  onChange: (next: string[]) => void;
  maxItems?: number;
  t: (key: string, fallback: string) => string;
}

const MultiTextarea: React.FC<MultiTextareaProps> = ({
  label,
  icon,
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
    onChange(next.length === 0 ? [''] : next);
  };
  const canAdd = items.length < maxItems;
  return (
    <div className="flex flex-col gap-[6px]">
      <FieldLabel
        icon={icon}
        right={
          <button
            type="button"
            disabled={!canAdd}
            onClick={add}
            aria-label={t('persona_add_example', 'Add example')}
            className="flex items-center justify-center w-[26px] h-[26px] rounded-full text-textColor hover:bg-newTableBorder disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PlusIcon />
          </button>
        }
      >
        {label}
      </FieldLabel>
      {items.map((item, idx) => (
        <div key={idx} className="relative">
          <textarea
            rows={3}
            maxLength={5000}
            className="w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor pl-[12px] pr-[40px] py-[10px] outline-none resize-y"
            value={item}
            placeholder={t(
              'persona_example_placeholder',
              'Paste an example post that reflects this brand voice'
            )}
            onChange={(e) => update(idx, e.target.value)}
          />
          {(items.length > 1 || item) && (
            <button
              type="button"
              onClick={() => remove(idx)}
              aria-label={t('persona_remove', 'Remove')}
              className="absolute top-[8px] right-[8px] flex items-center justify-center w-[24px] h-[24px] rounded-full text-red-500 hover:text-red-400 hover:bg-red-500/10"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export const ProfilePersonaSettingsSection: React.FC = () => {
  const t = useT();
  const toaster = useToaster();
  const fetchRaw = useFetch();
  const { profile, isLoading: profileLoading } = useCurrentProfile();
  const selectedProfileId = profile?.id ?? null;

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

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('persona_title', 'AI Persona')}</h3>
      <div className="text-customColor18 mt-[4px] text-[13px]">
        {t(
          'persona_description',
          'Define how the AI agent writes for each profile.'
        )}
      </div>

      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[20px] flex flex-col gap-[14px]">
        {profileLoading || isLoading ? (
          <div className="text-customColor18 text-[13px]">
            {t('persona_loading', 'Loading...')}
          </div>
        ) : (
          <>
            <LabeledTextarea
              icon={<BrandIcon />}
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
              icon={<AudienceIcon />}
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
              icon={<ToneIcon />}
              label={t('persona_tone', 'Tone of voice')}
              value={form.toneOfVoice || ''}
              options={TONE_PRESETS}
              onChange={(v) => update('toneOfVoice', v)}
              placeholder={t('persona_tone_placeholder', 'Custom tone of voice')}
              t={t}
            />
            <LabeledTextarea
              icon={<PencilIcon />}
              label={t('persona_writing_instructions', 'Estilo de escrita')}
              placeholder={t(
                'persona_writing_placeholder',
                'Extra rules: use emojis sparingly, always mention the brand name once, etc.'
              )}
              value={form.writingInstructions || ''}
              onChange={(v) => update('writingInstructions', v)}
              maxLength={2000}
              rows={8}
              minHeight={340}
            />
            <TagInput
              icon={<MegaphoneIcon />}
              label={t('persona_preferred_ctas', 'Preferred CTAs')}
              value={form.preferredCtas || []}
              onChange={(v) => update('preferredCtas', v)}
              placeholder={t('persona_ctas_placeholder', 'Press Enter to add a CTA')}
              t={t}
            />
            <LabeledTextarea
              icon={<ShieldIcon />}
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
              icon={<PaletteIcon />}
              label={t('persona_image_style', 'Image style')}
              value={form.imageStyle || ''}
              options={STYLE_PRESETS}
              onChange={(v) => update('imageStyle', v)}
              placeholder={t('persona_style_placeholder', 'Custom image style')}
              t={t}
            />
            <MultiTextarea
              icon={<DocumentIcon />}
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
