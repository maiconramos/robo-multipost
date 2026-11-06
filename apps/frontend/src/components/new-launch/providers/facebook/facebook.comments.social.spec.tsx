import { describe, expect, it, vi } from 'vitest';
vi.mock('../high.order.provider', () => ({
  PostComment: { COMMENT: 2 },
  withProvider: (configuration: unknown) => configuration,
}));
import facebook from './facebook.provider';
const config = facebook as any;
describe('comentarios em Stories Facebook', () => {
  it('desabilita comentarios somente em Story e restaura em post', () => {
    expect(typeof config.comments).toBe('function');
    expect(config.comments({ post_type: 'story' }, 'facebook')).toBe(false);
    expect(config.comments({ post_type: 'post' }, 'facebook')).toBe(true);
    expect(config.comments({ post_type: 'story' }, 'zernio-facebook')).toBe(
      false
    );
  });
  it('recusa blocos extras antes de carregar metadados do video', async () => {
    expect(
      await config.checkValidity(
        [[{ path: 'a.mp4' }], []],
        { post_type: 'story' },
        {},
        (_: string, fallback: string) => fallback,
        'facebook'
      )
    ).toContain('comment');
  });
  it('mantem comentarios em feed e Reel', async () => {
    expect(
      await config.checkValidity(
        [[{ path: 'a.mp4' }], []],
        { post_type: 'post' },
        {},
        undefined,
        'facebook'
      )
    ).toBe(true);
  });
});
