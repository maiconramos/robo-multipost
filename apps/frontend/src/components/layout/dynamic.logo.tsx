'use client';

import { FC, useEffect, useState } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { useBrandingContext } from '@gitroom/frontend/components/layout/dynamic.branding.provider';

const useIsDarkTheme = (): boolean => {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const check = () => {
      setIsDark(document.body.classList.contains('dark'));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

export const DynamicLogo: FC<{ size?: number }> = ({ size = 48 }) => {
  const branding = useBrandingContext();
  const isDark = useIsDarkTheme();

  const url = branding
    ? isDark
      ? branding.logoDarkUrl || branding.logoLightUrl
      : branding.logoLightUrl || branding.logoDarkUrl
    : null;

  if (url) {
    return (
      <div
        className="mt-[8px] w-[86px] h-[60px] flex items-center justify-center"
        style={{ height: size + 12, width: 86 }}
      >
        <img
          src={url}
          alt={branding?.brandName || 'Logo'}
          style={{ maxHeight: size, maxWidth: 86, objectFit: 'contain' }}
        />
      </div>
    );
  }

  return <Logo />;
};
