import { FC } from 'react';
import SafeImage from '@gitroom/react/helpers/safe.image';

/**
 * Helper to extract real platform from Zernio provider identifiers.
 * e.g. 'zernio-tiktok' -> { platform: 'tiktok', isZernio: true }
 *      'instagram'     -> { platform: 'instagram', isZernio: false }
 */
export function getPlatformFromIdentifier(identifier: string) {
  if (identifier.startsWith('zernio-')) {
    return { platform: identifier.replace('zernio-', ''), isZernio: true };
  }
  return { platform: identifier, isZernio: false };
}

/**
 * Returns the icon path for a given provider identifier.
 * Zernio providers use the underlying platform icon.
 */
export function getPlatformIconPath(identifier: string) {
  const { platform } = getPlatformFromIdentifier(identifier);
  if (platform === 'youtube') return '/icons/platforms/youtube.svg';
  return `/icons/platforms/${platform}.png`;
}

// Small Zernio logo used as overlay badge on platform icons.
const ZernioBadge: FC<{ size?: number }> = ({ size = 16 }) => (
  <span
    className="absolute z-20 top-[-3px] -end-[3px] flex items-center justify-center rounded-full bg-[#EB3514] border border-white/30"
    style={{ width: size, height: size }}
  >
    <img
      src="/icons/platforms/zernio-icon.svg"
      alt="zernio"
      style={{ width: size * 0.72, height: size * 0.72 }}
    />
  </span>
);

/**
 * Reusable platform icon badge component.
 * Renders the correct platform icon for both native and Zernio providers.
 * For Zernio providers, adds a small Zernio logo badge.
 */
export const PlatformIconBadge: FC<{
  identifier: string;
  size?: number;
  className?: string;
}> = ({ identifier, size = 18, className = '' }) => {
  const { platform, isZernio } = getPlatformFromIdentifier(identifier);
  return (
    <>
      {platform === 'youtube' ? (
        <img
          src="/icons/platforms/youtube.svg"
          className={className}
          width={size}
          alt="youtube"
        />
      ) : (
        <SafeImage
          src={`/icons/platforms/${platform}.png`}
          className={`rounded-full ${className}`}
          alt={platform}
          width={size}
          height={size}
        />
      )}
      {isZernio && <ZernioBadge size={Math.max(10, Math.round(size * 0.7))} />}
    </>
  );
};
