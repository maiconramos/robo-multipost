import { RepostDestinationFormat, RepostSourceType } from '@prisma/client';

/**
 * Formatos de destino que cada `providerIdentifier` consegue publicar via
 * API. Deriva do que ja existe nos providers do Postiz/Multipost:
 *   - instagram.provider.ts usa `post_type: 'post' | 'story'` (via InstagramDto)
 *   - facebook.provider.ts publica video em /{page-id}/videos → vira Reel
 *   - tiktok.provider.ts usa content_posting_method=DIRECT_POST (feed)
 *   - youtube.provider.ts usa videos.insert (Short se 9:16 + <= 60s)
 *
 * Importante: o Instagram Story nao pode ser publicado via TikTok API;
 * o Facebook Story nao e exposto pela Graph API publica (so IG).
 */
export const PROVIDER_DESTINATION_FORMATS: Record<
  string,
  RepostDestinationFormat[]
> = {
  instagram: ['INSTAGRAM_POST', 'INSTAGRAM_STORY'],
  'instagram-standalone': ['INSTAGRAM_POST', 'INSTAGRAM_STORY'],
  facebook: ['FACEBOOK_REEL'],
  tiktok: ['TIKTOK_FEED'],
  'zernio-tiktok': ['TIKTOK_FEED'],
  youtube: ['YOUTUBE_SHORT'],
  'zernio-youtube': ['YOUTUBE_SHORT'],
};

/**
 * Matriz de compatibilidade: dado um `sourceType`, quais `format`s o
 * conteudo consegue alimentar. Em V2 (INSTAGRAM_STORY e INSTAGRAM_POST)
 * ambos sao video vertical 9:16, entao compartilham os mesmos destinos
 * viaveis.
 */
export const SOURCE_DESTINATION_MATRIX: Record<
  RepostSourceType,
  RepostDestinationFormat[]
> = {
  INSTAGRAM_STORY: [
    'INSTAGRAM_POST',
    'INSTAGRAM_STORY',
    'FACEBOOK_REEL',
    'TIKTOK_FEED',
    'YOUTUBE_SHORT',
  ],
  INSTAGRAM_POST: [
    'INSTAGRAM_POST',
    'INSTAGRAM_STORY',
    'FACEBOOK_REEL',
    'TIKTOK_FEED',
    'YOUTUBE_SHORT',
  ],
};

/**
 * `sourceType`s que cada providerIdentifier pode representar como ORIGEM.
 * V2 so exp?e Instagram (Story ou Reel/Feed). V3 adicionara TikTok e
 * YouTube quando os providers implementarem fetching.
 */
export const PROVIDER_SOURCE_TYPES: Record<string, RepostSourceType[]> = {
  instagram: ['INSTAGRAM_STORY', 'INSTAGRAM_POST'],
  'instagram-standalone': ['INSTAGRAM_STORY', 'INSTAGRAM_POST'],
};

export const REPOST_SOURCE_PROVIDERS = Object.keys(
  PROVIDER_SOURCE_TYPES
) as readonly string[];

export const REPOST_DESTINATION_PROVIDERS = Object.keys(
  PROVIDER_DESTINATION_FORMATS
) as readonly string[];

export function formatsForProvider(
  providerIdentifier: string
): RepostDestinationFormat[] {
  return PROVIDER_DESTINATION_FORMATS[providerIdentifier] ?? [];
}

export function formatsForSourceType(
  sourceType: RepostSourceType
): RepostDestinationFormat[] {
  return SOURCE_DESTINATION_MATRIX[sourceType] ?? [];
}

export function sourceTypesForProvider(
  providerIdentifier: string
): RepostSourceType[] {
  return PROVIDER_SOURCE_TYPES[providerIdentifier] ?? [];
}

export function isDestinationCompatible(
  sourceType: RepostSourceType,
  providerIdentifier: string,
  format: RepostDestinationFormat
): boolean {
  return (
    formatsForProvider(providerIdentifier).includes(format) &&
    formatsForSourceType(sourceType).includes(format)
  );
}
