import 'reflect-metadata';

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn(() => ({})) },
    youtube: jest.fn(() => ({})),
    youtubeAnalytics: jest.fn(() => ({})),
    oauth2: jest.fn(() => ({})),
  },
}));

import { YoutubeProvider } from './youtube.provider';
import {
  PublishedWithError,
  RefreshToken,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';

// Lote de providers out/2026 — portes dos PRs upstream #2257 e #2294.
describe('YoutubeProvider.handleErrors', () => {
  const provider = new YoutubeProvider();

  it('cota diaria de upload esgotada vira bad-body pedindo reagendamento', () => {
    const result = provider.handleErrors(
      '{"error":{"errors":[{"domain":"youtube.quota","reason":"quotaExceeded","message":"exceeded your quota: defaultVideoInsertPerDayPerProject"}]}}'
    );
    expect(result?.type).toBe('bad-body');
    expect(result?.value).toMatch(/daily upload quota/);
  });

  it('cota diaria vence o uploadLimitExceeded quando os dois aparecem no corpo', () => {
    const result = provider.handleErrors(
      'defaultVideoInsertPerDayPerProject uploadLimitExceeded'
    );
    expect(result?.value).toMatch(/daily upload quota/);
  });

  it('thumbnail sem canal verificado explica o que fazer (video ja publicado)', () => {
    const result = provider.handleErrors(
      '{"error":{"errors":[{"domain":"youtube.thumbnail","reason":"forbidden"}]}}'
    );
    expect(result?.type).toBe('bad-body');
    expect(result?.value).toMatch(/uploaded to YouTube successfully/);
    expect(result?.value).toMatch(/youtube\.com\/verify/);
    expect(result?.value).toMatch(/YouTube Studio/);
  });

  it('mantem os mapeamentos existentes', () => {
    expect(provider.handleErrors('uploadLimitExceeded')?.value).toMatch(
      /daily upload limit/
    );
    expect(provider.handleErrors('Unauthorized')?.type).toBe('refresh-token');
    expect(provider.handleErrors('nada')).toBeUndefined();
  });
});

// upstream #1884: politica de sessao do Google Workspace (invalid_rapt) vira
// orientacao para o admin, em vez de "invalid_grant" seco no Status.
describe('YoutubeProvider.refreshErrorMessage', () => {
  it('traduz invalid_rapt em orientacao do Google Workspace', () => {
    const message = new YoutubeProvider().refreshErrorMessage({
      response: {
        data: { error: 'invalid_grant', error_subtype: 'invalid_rapt' },
      },
    });
    expect(message).toMatch(/Google Workspace/);
    expect(message).toMatch(/support\.google\.com\/a\/answer\/9368756/);
  });

  it('outros erros seguem o motivo padrao', () => {
    expect(
      new YoutubeProvider().refreshErrorMessage({ message: 'invalid_grant' })
    ).toBeUndefined();
  });
});

describe('YoutubeProvider.reConnect', () => {
  const { google } = jest.requireMock('googleapis');
  beforeEach(() => {
    google.auth.OAuth2.mockImplementation(() => ({
      setCredentials: jest.fn(),
    }));
  });

  it('erro real do Google propaga em vez de virar "canal nao encontrado"', async () => {
    google.youtube.mockReturnValueOnce({
      channels: {
        list: jest
          .fn()
          .mockRejectedValue(
            new Error('invalid_grant: Token has been expired')
          ),
      },
    });
    await expect(
      new YoutubeProvider().reConnect('root', 'UC1', 'tok')
    ).rejects.toThrow('invalid_grant');
  });

  it('canal ausente na conta continua "Channel not found"', async () => {
    google.youtube.mockReturnValueOnce({
      channels: {
        list: jest.fn().mockResolvedValue({ data: { items: [{ id: 'UC2' }] } }),
      },
    });
    await expect(
      new YoutubeProvider().reConnect('root', 'UC1', 'tok')
    ).rejects.toThrow('Channel not found');
  });
});

describe('YoutubeProvider.postAnalytics', () => {
  const { google } = jest.requireMock('googleapis');
  beforeEach(() => {
    google.auth.OAuth2.mockImplementation(() => ({
      setCredentials: jest.fn(),
    }));
  });

  it('401 do Google vira RefreshToken para o checkPostAnalytics renovar', async () => {
    const unauthorized = Object.assign(new Error('Unauthorized'), {
      response: { status: 401, data: { error: 'invalid_token' } },
    });
    google.youtube.mockReturnValue({
      videos: { list: jest.fn().mockRejectedValue(unauthorized) },
    });
    google.youtubeAnalytics.mockReturnValue({
      reports: { query: jest.fn().mockRejectedValue(unauthorized) },
    });

    await expect(
      new YoutubeProvider().postAnalytics('id', 'tok', 'vid-1', 7)
    ).rejects.toBeInstanceOf(RefreshToken);
  });
});

// Porte do upstream #2285 + 23beddcd: capa da midia como miniatura e video no
// ar preservado quando a miniatura e recusada.
describe('YoutubeProvider.post (miniatura)', () => {
  const { google } = jest.requireMock('googleapis');
  const VIDEO = 'vid-123';

  const ready = () => ({
    data: {
      items: [
        {
          id: VIDEO,
          status: { uploadStatus: 'processed' },
          processingDetails: {
            processingStatus: 'succeeded',
            thumbnailsAvailability: 'available',
          },
        },
      ],
    },
  });

  const setup = (
    thumbnailsSet: jest.Mock,
    list = jest.fn().mockResolvedValue(ready())
  ) => {
    google.auth.OAuth2.mockImplementation(() => ({
      setCredentials: jest.fn(),
    }));
    const insert = jest.fn().mockResolvedValue({ data: { id: VIDEO } });
    google.youtube.mockReturnValue({
      videos: { insert, list },
      thumbnails: { set: thumbnailsSet },
    });
    const provider = new YoutubeProvider();
    const axios = jest.fn().mockResolvedValue({ data: 'stream' });
    jest.spyOn(provider as any, 'getSsrfSafeAxios').mockReturnValue(axios);
    return { provider, axios, insert, list };
  };

  const post = (settings: any, media: any[]) => [
    {
      id: 'post-db-1',
      message: 'descricao',
      settings: { title: 'Titulo', type: 'public', ...settings },
      media,
    },
  ];

  describe('processamento antes da capa', () => {
    const media = [
      {
        path: 'https://media.example.com/video.mp4',
        thumbnail: 'https://media.example.com/cover.jpg',
      },
    ];

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('aguarda video e miniaturas prontos antes de baixar e enviar a capa', async () => {
      const set = jest.fn().mockResolvedValue({});
      const list = jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                id: VIDEO,
                processingDetails: {
                  processingStatus: 'processing',
                  thumbnailsAvailability: 'available',
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                id: VIDEO,
                processingDetails: {
                  processingStatus: 'succeeded',
                  thumbnailsAvailability: 'inProgress',
                },
              },
            ],
          },
        })
        .mockResolvedValue(ready());
      const { provider, axios, insert } = setup(set, list);
      const result = provider.post('channel', 'token', post({}, media) as any);
      await jest.advanceTimersByTimeAsync(0);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledTimes(1);
      expect(set).not.toHaveBeenCalled();
      expect(axios).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(5000);
      expect(list).toHaveBeenCalledTimes(2);
      expect(set).not.toHaveBeenCalled();
      expect(axios).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(5000);
      await expect(result).resolves.toEqual([
        expect.objectContaining({ postId: VIDEO }),
      ]);
      expect(list).toHaveBeenLastCalledWith(
        { id: [VIDEO], part: ['processingDetails', 'status'] },
        expect.objectContaining({ timeout: expect.any(Number), retry: false })
      );
      expect(set).toHaveBeenCalledTimes(1);
      expect(axios).toHaveBeenCalledTimes(2);
    });

    it('sem capa nao consulta o processamento nem espera', async () => {
      const set = jest.fn();
      const { provider, list } = setup(set);
      await provider.post(
        'channel',
        'token',
        post({}, [{ path: media[0].path }]) as any
      );
      expect(list).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it.each([
      { processingDetails: { processingStatus: 'failed' } },
      { processingDetails: { processingStatus: 'terminated' } },
      { status: { uploadStatus: 'failed' } },
      { status: { uploadStatus: 'rejected' } },
      { status: { uploadStatus: 'deleted' } },
    ])(
      'processamento terminal preserva o video sem reenviar (%j)',
      async (state) => {
        const set = jest.fn();
        const list = jest.fn().mockResolvedValue({
          data: { items: [{ ...ready().data.items[0], ...state }] },
        });
        const { provider, insert, axios } = setup(set, list);
        const err = await provider
          .post('channel', 'token', post({}, media) as any)
          .catch((e) => e);
        expect(err).toBeInstanceOf(PublishedWithError);
        expect(err.releaseId).toBe(VIDEO);
        expect(err.releaseURL).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
        expect(err.message).toMatch(/processing/i);
        expect(insert).toHaveBeenCalledTimes(1);
        expect(list).toHaveBeenCalledTimes(1);
        expect(set).not.toHaveBeenCalled();
        expect(axios).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
      }
    );

    it.each([
      {},
      { processingDetails: { processingStatus: 'succeeded' } },
      { processingDetails: { thumbnailsAvailability: 'available' } },
      {
        processingDetails: {
          processingStatus: 'new-state',
          thumbnailsAvailability: 'available',
        },
      },
      {
        processingDetails: {
          processingStatus: 'succeeded',
          thumbnailsAvailability: 'new-state',
        },
      },
    ])(
      'estado ausente ou desconhecido expira sem enviar capa (%j)',
      async (state) => {
        const set = jest.fn();
        const list = jest
          .fn()
          .mockResolvedValue({ data: { items: [{ id: VIDEO, ...state }] } });
        const { provider, insert } = setup(set, list);
        const result = provider
          .post('channel', 'token', post({}, media) as any)
          .catch((e) => e);
        await jest.advanceTimersByTimeAsync(120000);
        const err = await result;
        expect(err).toBeInstanceOf(PublishedWithError);
        expect(err.releaseId).toBe(VIDEO);
        expect(err.message).toMatch(/processing/i);
        expect(insert).toHaveBeenCalledTimes(1);
        expect(set).not.toHaveBeenCalled();
        expect(list.mock.calls.length).toBeLessThanOrEqual(25);
        expect(jest.getTimerCount()).toBe(0);
      }
    );

    it.each([
      { items: [] },
      { items: [{ ...ready().data.items[0], id: 'another-video' }] },
    ])(
      'resposta sem o video enviado nao libera a capa (%j)',
      async ({ items }) => {
        const set = jest.fn();
        const { provider, insert } = setup(
          set,
          jest.fn().mockResolvedValue({ data: { items } })
        );
        const result = provider
          .post('channel', 'token', post({}, media) as any)
          .catch((e) => e);
        await jest.advanceTimersByTimeAsync(120000);
        expect(await result).toBeInstanceOf(PublishedWithError);
        expect(insert).toHaveBeenCalledTimes(1);
        expect(set).not.toHaveBeenCalled();
      }
    );

    it('limita o tempo total mesmo quando as consultas sao lentas', async () => {
      const started = Date.now();
      const set = jest.fn();
      const list = jest.fn().mockImplementation(
        (_params, options) =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  data: {
                    items: [
                      {
                        id: VIDEO,
                        processingDetails: { processingStatus: 'processing' },
                      },
                    ],
                  },
                }),
              Math.min(9000, options.timeout)
            );
          })
      );
      const { provider, insert } = setup(set, list);
      const result = provider
        .post('channel', 'token', post({}, media) as any)
        .catch((e) => e);
      await jest.advanceTimersByTimeAsync(120000);
      expect(await result).toBeInstanceOf(PublishedWithError);
      expect(Date.now() - started).toBe(120000);
      expect(
        list.mock.calls.every(
          ([, options]) =>
            options.timeout > 0 &&
            options.timeout <= 10000 &&
            options.retry === false
        )
      ).toBe(true);
      expect(
        list.mock.calls.some(([, options]) => options.timeout < 10000)
      ).toBe(true);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(set).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it.each([
      {
        name: 'RefreshToken ja classificado',
        failure: new RefreshToken('youtube', '', {} as any, 'sample-secret'),
      },
      {
        name: 'timeout de rede',
        failure: Object.assign(new Error('sample-secret'), {
          code: 'ETIMEDOUT',
        }),
      },
    ])('preserva o video em $name durante o polling', async ({ failure }) => {
      const set = jest.fn();
      const list = jest.fn().mockRejectedValue(failure);
      const { provider, insert, axios } = setup(set, list);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const err = await provider
        .post('channel', 'token', post({}, media) as any)
        .catch((e) => e);
      expect(err).toBeInstanceOf(PublishedWithError);
      expect(err).not.toBeInstanceOf(RefreshToken);
      expect(err.releaseId).toBe(VIDEO);
      expect(err.releaseURL).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
      expect(err.message).not.toContain('sample-secret');
      expect(insert).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledTimes(1);
      expect(axios).toHaveBeenCalledTimes(1);
      expect(set).not.toHaveBeenCalled();
    });

    it.each([401, 403, 500])(
      'falha HTTP %s no polling preserva id e URL sem novo upload',
      async (status) => {
        const set = jest.fn();
        const list = jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Unauthorized'), { response: { status } })
          );
        const { provider, insert } = setup(set, list);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const err = await provider
          .post('channel', 'token', post({}, media) as any)
          .catch((e) => e);
        expect(err).toBeInstanceOf(PublishedWithError);
        expect(err).not.toBeInstanceOf(RefreshToken);
        expect(err.postDbId).toBe('post-db-1');
        expect(err.releaseId).toBe(VIDEO);
        expect(err.releaseURL).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
        expect(insert).toHaveBeenCalledTimes(1);
        expect(set).not.toHaveBeenCalled();
      }
    );
  });

  it.each([false, true])(
    'envia o stream JPEG selecionado a thumbnails.set (override legado=%s)',
    async (hasLegacyOverride) => {
      const set = jest.fn().mockResolvedValue({});
      const { provider, axios } = setup(set);
      const savedMedia = {
        id: 'media-1',
        path: 'https://media.example.com/video.mp4',
        thumbnail: 'https://media.example.com/selected-final-frame.jpg',
        thumbnailTimestamp: 179950,
      };
      const legacyThumbnail = 'https://media.example.com/legacy-override.jpg';
      const selectedJpegStream = { source: 'selected-frame-jpeg-stream' };
      const legacyJpegStream = { source: 'legacy-jpeg-stream' };
      const videoStream = { source: 'video-stream' };
      axios.mockImplementation(async ({ url }: { url: string }) => ({
        data:
          url === savedMedia.path
            ? videoStream
            : url === legacyThumbnail
            ? legacyJpegStream
            : selectedJpegStream,
      }));

      await provider.post(
        'channel-1',
        'token',
        post(
          hasLegacyOverride ? { thumbnail: { path: legacyThumbnail } } : {},
          [savedMedia]
        ) as any
      );

      expect(axios).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          url: savedMedia.path,
          responseType: 'stream',
        })
      );
      expect(axios).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          url: hasLegacyOverride ? legacyThumbnail : savedMedia.thumbnail,
          responseType: 'stream',
        })
      );
      expect(set).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith({
        videoId: VIDEO,
        media: {
          body: hasLegacyOverride ? legacyJpegStream : selectedJpegStream,
        },
      });
      expect(set.mock.calls[0][0].media.body).not.toBe(videoStream);
    }
  );

  it('miniatura do proprio YouTube vence a capa da midia', async () => {
    const set = jest.fn().mockResolvedValue({});
    const { provider, axios } = setup(set);

    await provider.post(
      'id',
      'tok',
      post({ thumbnail: { path: 'https://x/yt.png' } }, [
        { path: 'https://x/v.mp4', thumbnail: 'https://x/capa.png' },
      ]) as any
    );

    expect(axios).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: 'https://x/yt.png' })
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: VIDEO })
    );
  });

  it('sem miniatura do YouTube usa a capa da midia; sem nenhuma nao chama thumbnails.set', async () => {
    const set = jest.fn().mockResolvedValue({});
    const { provider, axios } = setup(set);

    await provider.post(
      'id',
      'tok',
      post({}, [
        { path: 'https://x/v.mp4', thumbnail: 'https://x/capa.png' },
      ]) as any
    );
    expect(axios).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: 'https://x/capa.png' })
    );

    set.mockClear();
    await expect(
      provider.post('id', 'tok', post({}, [{ path: 'https://x/v.mp4' }]) as any)
    ).resolves.toEqual([
      expect.objectContaining({
        postId: VIDEO,
        releaseURL: `https://www.youtube.com/watch?v=${VIDEO}`,
      }),
    ]);
    expect(set).not.toHaveBeenCalled();
  });

  it('miniatura recusada depois do upload mantem id e URL do video (PublishedWithError)', async () => {
    const set = jest.fn().mockRejectedValue({
      errors: [{ domain: 'youtube.thumbnail', reason: 'forbidden' }],
    });
    const { provider } = setup(set);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const err = await provider
      .post(
        'id',
        'tok',
        post({}, [
          { path: 'https://x/v.mp4', thumbnail: 'https://x/capa.png' },
        ]) as any
      )
      .catch((e) => e);

    expect(err).toBeInstanceOf(PublishedWithError);
    expect(err.postDbId).toBe('post-db-1');
    expect(err.releaseId).toBe(VIDEO);
    expect(err.releaseURL).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
    expect(err.message).toMatch(/youtube\.com\/verify/);
  });

  it('erro nao mapeado na miniatura usa a explicacao generica, nao Unknown Error', async () => {
    const set = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const { provider } = setup(set);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const err = await provider
      .post(
        'id',
        'tok',
        post({}, [
          { path: 'https://x/v.mp4', thumbnail: 'https://x/capa.png' },
        ]) as any
      )
      .catch((e) => e);

    expect(err).toBeInstanceOf(PublishedWithError);
    expect(err.message).toMatch(/Set it manually in YouTube Studio/);
  });
});
