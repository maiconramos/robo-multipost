import { FC } from 'react';
import Image from 'next/image';

/**
 * Helper to extract real platform from Late provider identifiers.
 * e.g. 'late-tiktok' -> { platform: 'tiktok', isLate: true }
 *      'instagram'   -> { platform: 'instagram', isLate: false }
 */
export function getPlatformFromIdentifier(identifier: string) {
  if (identifier.startsWith('late-')) {
    return { platform: identifier.replace('late-', ''), isLate: true };
  }
  return { platform: identifier, isLate: false };
}

/**
 * Returns the icon path for a given provider identifier.
 * Late providers use the underlying platform icon.
 */
export function getPlatformIconPath(identifier: string) {
  const { platform } = getPlatformFromIdentifier(identifier);
  if (platform === 'youtube') return '/icons/platforms/youtube.svg';
  return `/icons/platforms/${platform}.png`;
}

/**
 * Late badge SVG — small version of the official Late logo (asterisk).
 */
const LateBadge: FC<{ size?: number }> = ({ size = 16 }) => (
  <span
    className="absolute z-20 top-[-3px] -end-[3px] flex items-center justify-center rounded-full bg-[#1a1a2e] border border-[#ffeda0]/40"
    style={{ width: size, height: size }}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffeda0"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: size * 0.95, height: size * 0.95 }}
    >
      <path d="M12 6v12" />
      <path d="M17.196 9 6.804 15" />
      <path d="m6.804 9 10.392 6" />
    </svg>
  </span>
);

/**
 * Reusable platform icon badge component.
 * Renders the correct platform icon for both native and Late providers.
 * For Late providers, adds a small Late logo badge.
 */
export const PlatformIconBadge: FC<{
  identifier: string;
  size?: number;
  className?: string;
}> = ({ identifier, size = 18, className = '' }) => {
  const { platform, isLate } = getPlatformFromIdentifier(identifier);
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
        <Image
          src={`/icons/platforms/${platform}.png`}
          className={`rounded-full ${className}`}
          alt={platform}
          width={size}
          height={size}
        />
      )}
      {isLate && <LateBadge size={Math.max(10, Math.round(size * 0.7))} />}
    </>
  );
};
