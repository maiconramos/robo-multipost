import { TiktokProvider } from './tiktok.provider';

describe('TiktokProvider - flags booleanas legadas', () => {
  it('normaliza strings antes de montar o payload do video', () => {
    const provider = new TiktokProvider();
    const payload = (provider as any).buildTikokPostInfoBody({
      message: 'Teste',
      media: [{ path: 'https://cdn.example/video.mp4' }],
      settings: {
        content_posting_method: 'DIRECT_POST',
        privacy_level: 'PUBLIC_TO_EVERYONE',
        duet: 'false',
        comment: 'false',
        stitch: 'true',
        video_made_with_ai: 'false',
        brand_content_toggle: 'false',
        brand_organic_toggle: 'true',
      },
    });

    expect(payload.post_info).toMatchObject({
      disable_duet: true,
      disable_comment: true,
      disable_stitch: false,
      is_aigc: false,
      brand_content_toggle: false,
      brand_organic_toggle: true,
    });
  });
});
