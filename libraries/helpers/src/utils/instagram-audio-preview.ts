/** Preview URLs are temporary discovery metadata, never post settings. */
export function safeAudioPreviewUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function safeInstagramAudioPreviewUrl(
  value: unknown
): string | undefined {
  const safe = safeAudioPreviewUrl(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  return ['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(
    url.hostname
  ) && !url.port
    ? safe
    : undefined;
}
