import {
  META_FACEBOOK_GRAPH_URL,
  META_GRAPH_API_VERSION,
  META_INSTAGRAM_GRAPH_URL,
  metaGraphUrl,
} from './meta-graph.constants';

describe('Meta Graph constants', () => {
  it('mantem Facebook e Instagram na mesma versao v25', () => {
    expect(META_GRAPH_API_VERSION).toBe('v25.0');
    expect(META_FACEBOOK_GRAPH_URL).toBe('https://graph.facebook.com/v25.0');
    expect(META_INSTAGRAM_GRAPH_URL).toBe('https://graph.instagram.com/v25.0');
  });

  it('monta base versionada sem decidir qual token deve ser usado', () => {
    expect(metaGraphUrl('graph.facebook.com')).toBe(
      'https://graph.facebook.com/v25.0'
    );
    expect(metaGraphUrl('graph.instagram.com')).toBe(
      'https://graph.instagram.com/v25.0'
    );
  });
});
