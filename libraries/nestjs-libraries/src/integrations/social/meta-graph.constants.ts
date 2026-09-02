export const META_GRAPH_API_VERSION = 'v25.0';

export const META_FACEBOOK_GRAPH_HOST = 'graph.facebook.com';
export const META_INSTAGRAM_GRAPH_HOST = 'graph.instagram.com';
export const META_FACEBOOK_OAUTH_HOST = 'www.facebook.com';

export function metaGraphUrl(host: string): string {
  return `https://${host}/${META_GRAPH_API_VERSION}`;
}

export const META_FACEBOOK_GRAPH_URL = metaGraphUrl(META_FACEBOOK_GRAPH_HOST);
export const META_INSTAGRAM_GRAPH_URL = metaGraphUrl(META_INSTAGRAM_GRAPH_HOST);
export const META_FACEBOOK_OAUTH_URL = metaGraphUrl(META_FACEBOOK_OAUTH_HOST);
