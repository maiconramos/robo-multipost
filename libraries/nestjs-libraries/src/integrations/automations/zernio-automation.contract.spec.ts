import { zernioPayload } from './zernio-automation.contract';
const base = {
  name: 'Teste',
  integrationId: 'ig',
  platform: 'instagram' as const,
  triggerType: 'comment_on_post' as const,
  postMode: 'all' as const,
  dmMessage: 'Olá {commenter_name}',
  keywords: ['LINK'],
  matchMode: 'any' as const,
};
describe('contrato Instagram Zernio', () => {
  it('mapeia escopo, palavra e nome sem confundir IDs', () => {
    expect(zernioPayload(base)).toMatchObject({
      name: 'Teste',
      trigger: 'comment',
      platformPostId: null,
      postId: null,
      dmMessage: 'Olá {{name}}',
      matchMode: 'contains',
      isActive: false,
    });
  });
  it('preserva o mesmo botao em variantes de texto', () => {
    const p = zernioPayload({
      ...base,
      dmMessage: undefined,
      dmVariants: [
        { message: 'A', buttonText: 'Abrir', buttonUrl: 'https://example.com' },
        { message: 'B', buttonText: 'Abrir', buttonUrl: 'https://example.com' },
      ],
    });
    expect(p.dmMessageVariations).toEqual(['B']);
    expect(p.buttons).toEqual([
      { type: 'url', title: 'Abrir', url: 'https://example.com' },
    ]);
  });
  it.each([
    { postMode: 'next_publication' },
    { postMode: 'scheduled', scheduledPostId: 'local' },
    { postMode: 'specific', postIds: ['123', '456'] },
    { matchMode: 'all' },
    { requireFollow: true },
    { aliasMediaIds: ['123'] },
    { triggerType: 'story_reply' },
    { dmMessage: '{comment_text}' },
    { dmMessage: undefined, dmMessages: Array(7).fill('A') },
    {
      dmMessage: undefined,
      dmVariants: [
        { message: 'A', buttonText: 'Abrir', buttonUrl: 'https://example.com' },
        { message: 'B' },
      ],
    },
  ])('recusa recurso sem equivalencia: %j', (patch) => {
    expect(() => zernioPayload({ ...base, ...patch } as any)).toThrow();
  });
  it('nao trunca texto ou botao acima dos limites', () => {
    expect(() =>
      zernioPayload({
        ...base,
        dmMessage: 'a'.repeat(641),
        dmButtonText: 'Abrir',
        dmButtonUrl: 'https://example.com',
      })
    ).toThrow('ZERNIO_MESSAGE_TOO_LONG');
  });
});
