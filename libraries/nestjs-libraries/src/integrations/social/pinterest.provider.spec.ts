import 'reflect-metadata';
import { timer } from '@gitroom/helpers/utils/timer';
import { PinterestProvider } from './pinterest.provider';

jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn(),
}));

const makeResponse = (body: unknown) =>
  ({
    status: 200,
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);

const clientInformation = {
  client_id: 'profile-pinterest-id',
  client_secret: 'profile-pinterest-secret',
  instanceUrl: '',
};

const videoPost = {
  id: 'post-1',
  message: 'Pin de video',
  settings: { board: '123' },
  media: [
    { path: 'https://media.example/cover.jpg' },
    { path: 'https://media.example/video.mp4?signature=abc' },
  ],
} as any;

describe('PinterestProvider.handleErrors', () => {
  let provider: PinterestProvider;

  beforeEach(() => {
    provider = new PinterestProvider();
    jest.mocked(timer).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('deve mapear maxItems=5 para bad-body com mensagem amigavel', () => {
    const result = provider.handleErrors(
      'pinterest api error: constraint: maxItems=5 violated'
    );

    expect(result).toEqual({
      type: 'bad-body',
      value: 'You can upload a maximum of 5 images per post on Pinterest.',
    });
  });

  it('deve manter o mapeamento de cover_image obrigatorio', () => {
    const result = provider.handleErrors(
      'missing cover_image_url or cover_image_content_type'
    );

    expect(result?.type).toBe('bad-body');
  });

  it('deve tentar novamente quando o Pinterest nao alcanca a URL', () => {
    expect(provider.handleErrors('Unable to reach the URL')).toEqual({
      type: 'retry',
      value:
        'Pinterest was unable to reach the URL provided. Please check the link and try again.',
    });
  });

  it('deve mapear erros de board ausente ou com ID invalido', () => {
    expect(provider.handleErrors("board_id does not match '^\\\\d+$'")).toEqual(
      {
        type: 'bad-body',
        value:
          'The board ID must be a numeric string. Please check the board ID format.',
      }
    );
    expect(provider.handleErrors('Board not found')).toEqual({
      type: 'bad-body',
      value: 'The specified board was not found. Please check the board ID.',
    });
  });

  it('deve retornar undefined para erro desconhecido', () => {
    expect(provider.handleErrors('algum erro qualquer')).toBeUndefined();
  });
});

describe('PinterestProvider OAuth por perfil', () => {
  const originalFetch = global.fetch;
  let provider: PinterestProvider;

  beforeEach(() => {
    provider = new PinterestProvider();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('gera a URL com o App ID recebido do perfil', async () => {
    const auth = await provider.generateAuthUrl(clientInformation);

    expect(auth.url).toContain('client_id=profile-pinterest-id');
  });

  it('troca o codigo usando App ID e Secret do perfil', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          scope: provider.scopes,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({ id: 'user-1', username: 'user', profile_image: '' })
      );
    global.fetch = fetchMock as jest.Mock;

    await provider.authenticate(
      { code: 'code', codeVerifier: 'verifier', refresh: '' },
      clientInformation
    );

    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')
    ).toBe(
      `Basic ${Buffer.from(
        'profile-pinterest-id:profile-pinterest-secret'
      ).toString('base64')}`
    );
  });

  it('renova o token usando App ID e Secret do perfil', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse({ access_token: 'new-access-token', expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        makeResponse({ id: 'user-1', username: 'user', profile_image: '' })
      );
    global.fetch = fetchMock as jest.Mock;

    await provider.refreshToken('refresh-token', clientInformation);

    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')
    ).toBe(
      `Basic ${Buffer.from(
        'profile-pinterest-id:profile-pinterest-secret'
      ).toString('base64')}`
    );
  });
});

describe('PinterestProvider publicacao de video', () => {
  let provider: PinterestProvider;
  let axiosClient: { get: jest.Mock; post: jest.Mock };

  beforeEach(() => {
    provider = new PinterestProvider();
    axiosClient = {
      get: jest.fn().mockResolvedValue({ data: 'video-stream' }),
      post: jest.fn().mockResolvedValue({}),
    };
    jest
      .spyOn(provider as any, 'getSsrfSafeAxios')
      .mockReturnValue(axiosClient);
    jest.mocked(timer).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const mockPinterestApi = (mediaStatus: string) => {
    const fetchMock = jest
      .spyOn(provider, 'fetch')
      .mockImplementation(async (url) => {
        const requestUrl = String(url);
        if (requestUrl.endsWith('/v5/media')) {
          return makeResponse({
            upload_url: 'https://upload.pinterest.example/video',
            media_id: 'media-1',
            upload_parameters: { key: 'value' },
          });
        }
        if (requestUrl.includes('/v5/media/media-1')) {
          return makeResponse({ status: mediaStatus });
        }
        if (requestUrl.endsWith('/v5/pins')) {
          return makeResponse({ id: 'pin-1' });
        }
        throw new Error(`URL inesperada: ${requestUrl}`);
      });
    return fetchMock;
  };

  it('envia o MP4 mesmo quando a capa e o primeiro anexo', async () => {
    const fetchMock = mockPinterestApi('succeeded');

    await expect(
      provider.post('user-1', 'access-token', [videoPost])
    ).resolves.toEqual([
      expect.objectContaining({ postId: 'pin-1', status: 'success' }),
    ]);

    expect(axiosClient.get).toHaveBeenCalledWith(
      'https://media.example/video.mp4?signature=abc',
      { responseType: 'stream' }
    );
    const pinRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/v5/pins')
    );
    const pinBody = JSON.parse(String(pinRequest?.[1]?.body));
    expect(pinBody.media_source).toEqual({
      source_type: 'video_id',
      media_id: 'media-1',
      cover_image_url: 'https://media.example/cover.jpg',
    });
    expect(timer).not.toHaveBeenCalled();
  });

  it('interrompe imediatamente quando o processamento falha', async () => {
    mockPinterestApi('failed');
    jest
      .mocked(timer)
      .mockRejectedValue(new Error('polling continuou depois da falha'));

    await expect(
      provider.post('user-1', 'access-token', [videoPost])
    ).rejects.toThrow('The file is corrupted and cannot be uploaded');
    expect(axiosClient.post).toHaveBeenCalledTimes(1);
  });

  it('limita o polling para nao ultrapassar o timeout da atividade', async () => {
    mockPinterestApi('processing');
    let waits = 0;
    jest.mocked(timer).mockImplementation(async () => {
      waits += 1;
      if (waits > 18) {
        throw new Error('polling sem limite');
      }
    });

    await expect(
      provider.post('user-1', 'access-token', [videoPost])
    ).rejects.toThrow('The file took too long to process, please try again');
  });
});

describe('PinterestProvider analytics', () => {
  const originalFetch = global.fetch;
  let provider: PinterestProvider;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-02T12:00:00Z'));
    provider = new PinterestProvider();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('limita analytics da conta aos ultimos 89 dias', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(makeResponse({ all: { daily_metrics: [] } }));
    global.fetch = fetchMock as jest.Mock;

    await provider.analytics('user-1', 'access-token', 365);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'start_date=2026-06-05'
    );
  });

  it('limita analytics do pin aos ultimos 89 dias', async () => {
    const fetchMock = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(makeResponse({ all: { lifetime_metrics: {} } }));

    await provider.postAnalytics('user-1', 'access-token', 'pin-1', 365);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'start_date=2026-06-05'
    );
  });
});
