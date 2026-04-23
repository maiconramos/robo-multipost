'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useBranding } from '@gitroom/frontend/components/settings/branding/use.branding';
import type { BrandingData } from '@gitroom/frontend/components/layout/dynamic.branding.provider';

const HEX_RE = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/;

type AssetType =
  | 'logoLight'
  | 'logoDark'
  | 'logoTextLight'
  | 'logoTextDark'
  | 'favicon'
  | 'ogImage'
  | 'loginBg';

const assetUrlKey: Record<AssetType, keyof BrandingData> = {
  logoLight: 'logoLightUrl',
  logoDark: 'logoDarkUrl',
  logoTextLight: 'logoTextLightUrl',
  logoTextDark: 'logoTextDarkUrl',
  favicon: 'faviconUrl',
  ogImage: 'ogImageUrl',
  loginBg: 'loginBgUrl',
};

interface AssetFieldProps {
  label: string;
  assetType: AssetType;
  branding: BrandingData | null;
  onChange: (branding: BrandingData) => void;
}

const AssetField: React.FC<AssetFieldProps> = ({
  label,
  assetType,
  branding,
  onChange,
}) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const t = useT();
  const currentUrl = branding ? (branding[assetUrlKey[assetType]] as string | null) : null;

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/branding/asset/${assetType}`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          toaster.show(t('branding_upload_failed', 'Falha no upload'), 'warning');
          return;
        }
        const data = await res.json();
        onChange(data.branding);
        toaster.show(t('branding_upload_ok', 'Arquivo enviado'), 'success');
      } finally {
        setUploading(false);
      }
    },
    [assetType, fetch, onChange, t, toaster]
  );

  const handleRemove = useCallback(async () => {
    const res = await fetch(`/branding/asset/${assetType}`, { method: 'DELETE' });
    if (!res.ok) return;
    const data = await res.json();
    onChange(data.branding);
    toaster.show(t('branding_asset_removed', 'Arquivo removido'), 'success');
  }, [assetType, fetch, onChange, t, toaster]);

  return (
    <div className="flex items-center gap-[16px] py-[8px]">
      <div className="w-[160px] text-[14px]">{label}</div>
      <div className="w-[80px] h-[48px] flex items-center justify-center bg-newBgColorInner border border-newTableBorder rounded-[4px] overflow-hidden">
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={label}
            style={{ maxHeight: 40, maxWidth: 72, objectFit: 'contain' }}
          />
        ) : (
          <span className="text-[11px] text-customColor18">{t('branding_empty', 'vazio')}</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />
      <Button
        onClick={() => inputRef.current?.click()}
        loading={uploading}
        secondary
      >
        {t('branding_upload', 'Enviar')}
      </Button>
      {currentUrl && (
        <Button onClick={handleRemove} secondary>
          {t('branding_remove', 'Remover')}
        </Button>
      )}
    </div>
  );
};

export const BrandingSettingsSection: React.FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading, mutate } = useBranding();
  const t = useT();
  const [saving, setSaving] = useState(false);

  const [brandName, setBrandName] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [aiAccentColor, setAiAccentColor] = useState('');
  const [loginHeroText, setLoginHeroText] = useState('');
  const [emailFromName, setEmailFromName] = useState('');

  useEffect(() => {
    if (!data?.branding) return;
    setBrandName(data.branding.brandName || '');
    setAccentColor(data.branding.accentColor || '');
    setAiAccentColor(data.branding.aiAccentColor || '');
    setLoginHeroText(data.branding.loginHeroText || '');
    setEmailFromName(data.branding.emailFromName || '');
  }, [data?.branding]);

  const accentPreview = useMemo(() => {
    return HEX_RE.test(accentColor) ? accentColor : 'var(--color-accent)';
  }, [accentColor]);

  const updateLocal = useCallback(
    (next: BrandingData) => {
      mutate({ branding: next }, { revalidate: false });
    },
    [mutate]
  );

  const handleSave = useCallback(async () => {
    if (accentColor && !HEX_RE.test(accentColor)) {
      toaster.show(
        t('branding_invalid_hex', 'Cor accent invalida. Use formato hex (ex: #cd2628).'),
        'warning'
      );
      return;
    }
    if (aiAccentColor && !HEX_RE.test(aiAccentColor)) {
      toaster.show(
        t('branding_invalid_hex_ai', 'Cor AI invalida. Use formato hex.'),
        'warning'
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/branding', {
        method: 'PUT',
        body: JSON.stringify({
          brandName: brandName || null,
          accentColor: accentColor || null,
          aiAccentColor: aiAccentColor || null,
          loginHeroText: loginHeroText || null,
          emailFromName: emailFromName || null,
        }),
      });
      if (!res.ok) {
        toaster.show(t('branding_save_failed', 'Falha ao salvar'), 'warning');
        return;
      }
      const body = await res.json();
      updateLocal(body.branding);
      toaster.show(t('branding_saved', 'Branding salvo'), 'success');
    } finally {
      setSaving(false);
    }
  }, [
    accentColor,
    aiAccentColor,
    brandName,
    emailFromName,
    fetch,
    loginHeroText,
    t,
    toaster,
    updateLocal,
  ]);

  if (isLoading) {
    return (
      <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Carregando...')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">
        {t('branding_title', 'Identidade visual (White label)')}
      </h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'branding_description',
          'Customize logos, cores e nome da marca para este workspace. Paginas publicas continuam mostrando a marca padrao.'
        )}
      </div>

      <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
        <div className="flex flex-col gap-[12px]">
          <div className="text-[15px] font-semibold">
            {t('branding_section_text', 'Nome e textos')}
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="text-[14px]">{t('branding_brand_name', 'Nome da marca')}</label>
            <input
              type="text"
              value={brandName}
              maxLength={80}
              onChange={(e) => setBrandName(e.target.value)}
              className="h-[42px] bg-newBgColorInner border-newTableBorder border rounded-[8px] px-[16px] text-[14px] text-textColor outline-none"
              placeholder="Robo MultiPost"
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="text-[14px]">
              {t('branding_login_hero', 'Texto de destaque na tela de login')}
            </label>
            <input
              type="text"
              value={loginHeroText}
              maxLength={200}
              onChange={(e) => setLoginHeroText(e.target.value)}
              className="h-[42px] bg-newBgColorInner border-newTableBorder border rounded-[8px] px-[16px] text-[14px] text-textColor outline-none"
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="text-[14px]">
              {t('branding_email_from', 'Nome do remetente nos e-mails')}
            </label>
            <input
              type="text"
              value={emailFromName}
              maxLength={80}
              onChange={(e) => setEmailFromName(e.target.value)}
              className="h-[42px] bg-newBgColorInner border-newTableBorder border rounded-[8px] px-[16px] text-[14px] text-textColor outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-[12px]">
          <div className="text-[15px] font-semibold">
            {t('branding_section_colors', 'Cores')}
          </div>
          <div className="flex items-center gap-[16px]">
            <label className="w-[160px] text-[14px]">
              {t('branding_accent', 'Cor accent')}
            </label>
            <input
              type="color"
              value={HEX_RE.test(accentColor) ? accentColor : '#cd2628'}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-[42px] h-[42px] border-0 rounded-[6px] cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={accentColor}
              placeholder="#cd2628"
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-[140px] h-[42px] bg-newBgColorInner border-newTableBorder border rounded-[8px] px-[16px] text-[14px] text-textColor outline-none"
            />
            <div
              className="h-[42px] w-[100px] rounded-[8px] flex items-center justify-center text-[12px]"
              style={{ background: accentPreview, color: '#fff' }}
            >
              {t('branding_preview', 'Preview')}
            </div>
          </div>
          <div className="flex items-center gap-[16px]">
            <label className="w-[160px] text-[14px]">
              {t('branding_accent_ai', 'Cor accent IA')}
            </label>
            <input
              type="color"
              value={HEX_RE.test(aiAccentColor) ? aiAccentColor : '#d82d7e'}
              onChange={(e) => setAiAccentColor(e.target.value)}
              className="w-[42px] h-[42px] border-0 rounded-[6px] cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={aiAccentColor}
              placeholder="#d82d7e"
              onChange={(e) => setAiAccentColor(e.target.value)}
              className="w-[140px] h-[42px] bg-newBgColorInner border-newTableBorder border rounded-[8px] px-[16px] text-[14px] text-textColor outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-[12px]">
          <div className="text-[15px] font-semibold">
            {t('branding_section_assets', 'Logos e imagens')}
          </div>
          <AssetField
            label={t('branding_logo_light', 'Logo (tema claro)')}
            assetType="logoLight"
            branding={data?.branding || null}
            onChange={updateLocal}
          />
          <AssetField
            label={t('branding_logo_dark', 'Logo (tema escuro)')}
            assetType="logoDark"
            branding={data?.branding || null}
            onChange={updateLocal}
          />
          <AssetField
            label={t('branding_logo_text_light', 'Logo com texto (claro)')}
            assetType="logoTextLight"
            branding={data?.branding || null}
            onChange={updateLocal}
          />
          <AssetField
            label={t('branding_logo_text_dark', 'Logo com texto (escuro)')}
            assetType="logoTextDark"
            branding={data?.branding || null}
            onChange={updateLocal}
          />
          <AssetField
            label={t('branding_favicon', 'Favicon')}
            assetType="favicon"
            branding={data?.branding || null}
            onChange={updateLocal}
          />
          <AssetField
            label={t('branding_og_image', 'Imagem Open Graph')}
            assetType="ogImage"
            branding={data?.branding || null}
            onChange={updateLocal}
          />
          <AssetField
            label={t('branding_login_bg', 'Fundo da tela de login')}
            assetType="loginBg"
            branding={data?.branding || null}
            onChange={updateLocal}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving}>
            {t('save', 'Salvar')}
          </Button>
        </div>
      </div>
    </div>
  );
};
