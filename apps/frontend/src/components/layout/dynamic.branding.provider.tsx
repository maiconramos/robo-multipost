'use client';

import { createContext, FC, ReactNode, useContext, useMemo } from 'react';

export interface BrandingData {
  brandName: string | null;
  accentColor: string | null;
  accentHover: string | null;
  accentContrast: string | null;
  aiAccentColor: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  logoTextLightUrl: string | null;
  logoTextDarkUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  loginBgUrl: string | null;
  loginHeroText: string | null;
  emailFromName: string | null;
}

const BrandingContext = createContext<BrandingData | null>(null);

export const useBrandingContext = (): BrandingData | null => {
  return useContext(BrandingContext);
};

export const DynamicBrandingProvider: FC<{
  branding: BrandingData | null;
  children: ReactNode;
}> = ({ branding, children }) => {
  const cssOverrides = useMemo(() => {
    if (!branding) return '';
    const parts: string[] = [];
    if (branding.accentColor) {
      parts.push(`--color-accent: ${branding.accentColor};`);
    }
    if (branding.accentHover) {
      parts.push(`--color-accent-hover: ${branding.accentHover};`);
    }
    if (branding.accentContrast) {
      parts.push(`--color-accent-contrast: ${branding.accentContrast};`);
    }
    if (branding.aiAccentColor) {
      parts.push(`--color-accent-ai: ${branding.aiAccentColor};`);
    }
    if (parts.length === 0) return '';
    const body = parts.join(' ');
    return `:root .dark, :root .light { ${body} }`;
  }, [branding]);

  return (
    <BrandingContext.Provider value={branding}>
      {cssOverrides && (
        <style
          id="robo-branding-overrides"
          dangerouslySetInnerHTML={{ __html: cssOverrides }}
        />
      )}
      {children}
    </BrandingContext.Provider>
  );
};
