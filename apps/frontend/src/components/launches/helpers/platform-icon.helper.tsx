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
