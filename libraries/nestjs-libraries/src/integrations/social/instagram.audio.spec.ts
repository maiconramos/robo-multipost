import 'reflect-metadata';
import { InstagramProvider } from './instagram.provider';
import { EncryptionService } from '../../crypto/encryption.service';
import { encryptIntegrationToken } from '../../crypto/integration-token.helper';
import * as transport from '../../dtos/webhooks/ssrf.safe.dispatcher';

describe('Instagram audio', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  const post = (
    settings: any,
    media = [{ path: 'https://cdn.test/video.mp4' }]
  ) =>
    [
      {
        id: 'post',
        message: 'Teste',
        media,
        settings: { post_type: 'post', ...settings },
      },
    ] as any;
  it('envia audio escolhido com volume zero na criacao do Reel', async () => {
    jest.useFakeTimers();
    const p = new InstagramProvider();
    const http = jest
      .spyOn(p, 'fetch')
      .mockResolvedValueOnce({ json: async () => ({ id: 'container' }) } as any)
      .mockResolvedValueOnce({
        json: async () => ({ status_code: 'FINISHED' }),
      } as any)
      .mockResolvedValueOnce({ json: async () => ({ id: 'published' }) } as any)
      .mockResolvedValueOnce({
        json: async () => ({ permalink: 'https://instagram.com/reel/x' }),
      } as any);
    const pending = p.post(
      'ig',
      'PAGE',
      post({ audio: { id: '123', audio_volume: 0, video_volume: 100 } }, [
        { path: 'https://cdn.test/video.MP4?x=1', alt: 'Video' },
      ] as any),
      {} as any
    );
    await jest.runAllTimersAsync();
    await pending;
    expect(
      new URL(String(http.mock.calls[0][0])).searchParams.get('alt_text')
    ).toBeNull();
    expect(
      JSON.parse(
        new URL(String(http.mock.calls[0][0])).searchParams.get(
          'audio_configuration'
        )!
      )
    ).toEqual({ audio_id: '123', audio_volume: 0, video_volume: 100 });
  });
  it.each(['story', 'image', 'carousel', 'standalone'])(
    'recusa %s antes de qualquer efeito',
    async (kind) => {
      const p = new InstagramProvider();
      const http = jest.spyOn(p, 'fetch');
      const media =
        kind === 'image'
          ? [{ path: 'a.jpg' }]
          : kind === 'carousel'
          ? [{ path: 'a.mp4' }, { path: 'b.jpg' }]
          : [{ path: 'a.mp4' }];
      await expect(
        p.post(
          'ig',
          'PAGE',
          post(
            {
              post_type: kind === 'story' ? 'story' : 'post',
              audio: { id: '123' },
            },
            media
          ),
          {} as any,
          kind === 'standalone' ? 'graph.instagram.com' : undefined
        )
      ).rejects.toThrow();
      expect(http).not.toHaveBeenCalled();
    }
  );
  it('busca com User Token cifrado e internalId servidor sem entregar segredo', async () => {
    const enc = new EncryptionService();
    const p = new InstagramProvider();
    const http = jest.spyOn(transport, 'ssrfSafeFetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          audio: [
            { audio_id: '123', title: 'Musica', display_artist: 'Autor' },
          ],
        })
      ) as any
    );
    const integration = {
      providerIdentifier: 'instagram',
      internalId: 'owned',
      refreshToken: encryptIntegrationToken(enc, 'USER'),
      token: 'PAGE',
    } as any;
    const result = await p.audioSearch(
      'PAGE',
      { q: 'teste', user_id: 'attacker' } as any,
      'owned',
      integration
    );
    expect(String(http.mock.calls[0][0])).toContain('user_id=owned');
    expect(String(http.mock.calls[0][0])).not.toContain('attacker');
    expect((http.mock.calls[0][1] as any).headers.Authorization).toBe(
      'Bearer USER'
    );
    expect(JSON.stringify(result)).not.toContain('USER');
    expect(integration.token).toBe('PAGE');
  });
  it('preserva as duas formas de previa sem persistir nem expor URLs inseguras', async () => {
    const entries = [
      {
        audio_id: '1',
        download_url: 'https://cdn.test/audio.mp3',
        on_platform_audio_preview_link:
          'https://www.instagram.com/reels/audio/1/',
      },
      {
        audio_id: '2',
        ig_username: 'criador',
        on_platform_audio_preview_link:
          'https://www.instagram.com/reels/audio/2/',
      },
      {
        audio_id: '3',
        download_url: null,
        on_platform_audio_preview_link: null,
      },
      {
        audio_id: '4',
        download_url: 'http://cdn.test/audio',
        on_platform_audio_preview_link: 'https://instagram.com.evil.test/audio',
      },
      {
        audio_id: '5',
        download_url: 'https://user:secret@cdn.test/audio',
        on_platform_audio_preview_link:
          'https://user:secret@instagram.com/audio',
      },
      {
        audio_id: '6',
        download_url: {},
        on_platform_audio_preview_link: ['https://instagram.com/audio'],
      },
    ];
    jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ audio: entries })) as any
      );
    const result = await new InstagramProvider().audioSearch(
      'PAGE',
      {},
      'owned',
      {
        providerIdentifier: 'instagram',
        internalId: 'owned',
        refreshToken: 'USER',
        token: 'PAGE',
      } as any
    );
    expect(result[0]).toMatchObject({
      id: '1',
      previewUrl: 'https://cdn.test/audio.mp3',
      platformPreviewUrl: 'https://www.instagram.com/reels/audio/1/',
    });
    expect(result[1]).toMatchObject({
      artist: 'criador',
      previewUrl: '',
      platformPreviewUrl: 'https://www.instagram.com/reels/audio/2/',
    });
    for (const item of result.slice(2))
      expect(item).toMatchObject({ previewUrl: '', platformPreviewUrl: '' });
  });
  it.each([
    'cover_artwork_thumbnail_uri',
    'cover_artwork_thumbnail_url',
    'profile_picture_url',
  ])('retorna miniatura de %s no campo image existente', async (field) => {
    jest.spyOn(transport, 'ssrfSafeFetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          audio: [{ audio_id: '123', [field]: 'https://cdn.test/cover.jpg' }],
        })
      ) as any
    );
    const result = await new InstagramProvider().audioSearch(
      'PAGE',
      {},
      'owned',
      {
        providerIdentifier: 'instagram',
        internalId: 'owned',
        refreshToken: 'USER',
        token: 'PAGE',
      } as any
    );
    expect(result[0].image).toBe('https://cdn.test/cover.jpg');
  });

  const originalIntegration = {
    id: 'channel-a',
    internalId: 'owned',
    providerIdentifier: 'instagram',
    refreshToken: 'USER',
    token: 'PAGE',
  } as any;
  const jsonResponse = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status });
  it('recupera avatar omitido na busca por detalhe sem sobrescrever capa existente', async () => {
    const http = jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockResolvedValueOnce(
        jsonResponse({
          audio: [
            { audio_id: '123', title: 'Original' },
            {
              audio_id: '456',
              profile_picture_url: 'https://cdn.test/existing.jpg',
            },
          ],
        }) as any
      )
      .mockResolvedValueOnce(
        jsonResponse({
          audio_id: '123',
          profile_picture_url: 'https://cdn.test/avatar.jpg',
        }) as any
      );
    const result = await new InstagramProvider().audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    expect(result.map((a: { image: string }) => a.image)).toEqual([
      'https://cdn.test/avatar.jpg',
      'https://cdn.test/existing.jpg',
    ]);
    expect(http).toHaveBeenCalledTimes(2);
    const url = new URL(String(http.mock.calls[1][0]));
    expect(url.pathname).toMatch(/\/123$/);
    expect(url.searchParams.get('user_id')).toBe('owned');
    expect(url.searchParams.has('access_token')).toBe(false);
    expect((http.mock.calls[1][1] as any).headers.Authorization).toBe(
      'Bearer USER'
    );
  });
  it('reutiliza cache de avatar sem misturar canais e renova apos expirar', async () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const http = jest.spyOn(transport, 'ssrfSafeFetch').mockImplementation(
      async (url) =>
        jsonResponse(
          String(url).includes('/ig_audio?')
            ? { audio: [{ audio_id: '123' }] }
            : {
                audio_id: '123',
                profile_picture_url: 'https://cdn.test/avatar.jpg',
              }
        ) as any
    );
    const p = new InstagramProvider();
    await p.audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    await p.audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    expect(http).toHaveBeenCalledTimes(3);
    await p.audioSearch('PAGE', { type: 'original_sound' }, 'owned', {
      ...originalIntegration,
      id: 'channel-b',
    });
    expect(http).toHaveBeenCalledTimes(5);
    now = 11 * 60_000;
    await p.audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    expect(http).toHaveBeenCalledTimes(7);
  });
  it('cacheia resposta sem avatar por um minuto mas nao cacheia falha HTTP', async () => {
    let now = 0;
    let status = 200;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const http = jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockImplementation(
        async (url) =>
          jsonResponse(
            String(url).includes('/ig_audio?')
              ? { audio: [{ audio_id: '123' }] }
              : { audio_id: '123', profile_picture_url: null },
            String(url).includes('/ig_audio?') ? 200 : status
          ) as any
      );
    const p = new InstagramProvider();
    await p.audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    now = 30_000;
    await p.audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    expect(http).toHaveBeenCalledTimes(3);
    now = 61_000;
    status = 401;
    await p.audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    await p.audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    expect(http).toHaveBeenCalledTimes(7);
  });
  it.each(['network', 'http', 'invalid-json', 'wrong-id', 'unsafe-image'])(
    'preserva resultados se detalhe falhar: %s',
    async (failure) => {
      const http = jest
        .spyOn(transport, 'ssrfSafeFetch')
        .mockImplementation(async (url) => {
          if (String(url).includes('/ig_audio?'))
            return jsonResponse({
              audio: [{ audio_id: '123', title: 'Original' }],
            }) as any;
          if (failure === 'network') throw new Error('upstream');
          if (failure === 'http')
            return jsonResponse({ error: { code: 190 } }, 401) as any;
          if (failure === 'invalid-json') return new Response('bad') as any;
          return jsonResponse({
            audio_id: failure === 'wrong-id' ? '999' : '123',
            profile_picture_url:
              failure === 'wrong-id'
                ? 'https://cdn.test/a.jpg'
                : 'https://user:secret@cdn.test/a.jpg',
          }) as any;
        });
      const result = await new InstagramProvider().audioSearch(
        'PAGE',
        { type: 'original_sound' },
        'owned',
        originalIntegration
      );
      expect(result[0]).toMatchObject({
        id: '123',
        title: 'Original',
        image: '',
      });
      expect(http).toHaveBeenCalledTimes(2);
    }
  );
  it('limita detalhes a dez IDs distintos e tres consultas simultaneas', async () => {
    let active = 0;
    let peak = 0;
    const details: string[] = [];
    jest.spyOn(transport, 'ssrfSafeFetch').mockImplementation(async (url) => {
      if (String(url).includes('/ig_audio?'))
        return jsonResponse({
          audio: [
            ...Array.from({ length: 15 }, (_, i) => ({
              audio_id: String(i + 1),
            })),
            { audio_id: '1' },
          ],
        }) as any;
      const id = new URL(String(url)).pathname.split('/').pop()!;
      active++;
      peak = Math.max(peak, active);
      details.push(id);
      await new Promise((r) => setImmediate(r));
      active--;
      return jsonResponse({
        audio_id: id,
        profile_picture_url: 'https://cdn.test/a.jpg',
      }) as any;
    });
    const result = await new InstagramProvider().audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    expect(result).toHaveLength(16);
    expect(details).toHaveLength(10);
    expect(new Set(details).size).toBe(10);
    expect(peak).toBeLessThanOrEqual(3);
    expect(result[15].image).toBe('https://cdn.test/a.jpg');
  });
  it('interrompe novos detalhes ao receber limite da Meta', async () => {
    const http = jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockImplementation(async (url) =>
        String(url).includes('/ig_audio?')
          ? (jsonResponse({
              audio: Array.from({ length: 9 }, (_, i) => ({
                audio_id: String(i + 1),
              })),
            }) as any)
          : (jsonResponse({}, 429) as any)
      );
    const result = await new InstagramProvider().audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    expect(result).toHaveLength(9);
    expect(http.mock.calls.length).toBeLessThanOrEqual(4);
  });
  it('orcamento compartilhado cancela detalhes pendentes e preserva a lista', async () => {
    const controller = new AbortController();
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) =>
        ms === 5000 ? controller.signal : timeout(ms)
      );
    const http = jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockImplementation(async (url, options) => {
        if (String(url).includes('/ig_audio?'))
          return jsonResponse({
            audio: Array.from({ length: 9 }, (_, i) => ({
              audio_id: String(i + 1),
            })),
          }) as any;
        return new Promise((_, reject) =>
          options!.signal!.addEventListener('abort', () =>
            reject(new Error('abort'))
          )
        ) as any;
      });
    const pending = new InstagramProvider().audioSearch(
      'PAGE',
      { type: 'original_sound' },
      'owned',
      originalIntegration
    );
    await new Promise((r) => setImmediate(r));
    controller.abort();
    expect(await pending).toHaveLength(9);
    expect(http).toHaveBeenCalledTimes(4);
  });
  it('canal healed sem User Token mostra orientacao sem desconectar', async () => {
    const p = new InstagramProvider();
    const http = jest.spyOn(transport, 'ssrfSafeFetch');
    await expect(
      p.audioSearch('PAGE', {}, 'owned', {
        providerIdentifier: 'instagram',
        refreshToken: 'PAGE',
      } as any)
    ).rejects.toThrow(/Facebook/);
    expect(http).not.toHaveBeenCalled();
  });
});
