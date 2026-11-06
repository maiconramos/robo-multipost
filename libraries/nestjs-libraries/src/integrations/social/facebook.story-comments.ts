export const FACEBOOK_STORY_COMMENTS_ERROR =
  'Comentários após a publicação não estão disponíveis para Stories do Facebook. Remova os blocos de comentário deste canal antes de publicar.';

export function facebookAllowsComments(
  settings: { post_type?: unknown } | undefined,
  identifier = 'facebook'
): boolean {
  return !(
    ['facebook', 'zernio-facebook'].includes(identifier) &&
    settings?.post_type === 'story'
  );
}

export function facebookStoryCommentError(
  settings: { post_type?: unknown } | undefined,
  blockCount: number,
  identifier = 'facebook'
): string | undefined {
  return blockCount > 1 && !facebookAllowsComments(settings, identifier)
    ? FACEBOOK_STORY_COMMENTS_ERROR
    : undefined;
}
