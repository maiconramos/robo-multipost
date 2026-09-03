import 'reflect-metadata';
import { FacebookProvider } from './facebook.provider';
import { InstagramProvider } from './instagram.provider';
import { LinkedinPageProvider } from './linkedin.page.provider';
import { PinterestProvider } from './pinterest.provider';
import { ThreadsProvider } from './threads.provider';
import { TiktokProvider } from './tiktok.provider';
import { RefreshToken } from '../social.abstract';

const response = (body: any, status = 200) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);

const analyticsSpy = (provider: any) =>
  jest.spyOn(provider, 'analyticsFetch') as jest.SpyInstance<
    Promise<Response>,
    [string, RequestInit?]
  >;

describe('analytics usa o transporte seguro sem semantica de publicacao', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockRejectedValue(new Error('raw fetch'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('Facebook usa analyticsFetch nas metricas da pagina e do post', async () => {
    const provider = new FacebookProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch');
    const safeFetch = analyticsSpy(provider).mockResolvedValue(
      response({ data: [] })
    );

    await expect(provider.analytics('page-1', 'TOKEN', 7)).resolves.toEqual([]);
    await expect(
      provider.postAnalytics('page-1', 'TOKEN', 'post-1', 7)
    ).resolves.toEqual([]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(String(safeFetch.mock.calls[0][0])).toContain(
      'graph.facebook.com/v25.0/page-1/insights'
    );
    expect(String(safeFetch.mock.calls[1][0])).toContain(
      'graph.facebook.com/v25.0/post-1/insights'
    );
  });

  it('Instagram usa analyticsFetch nas metricas e preserva o host Meta', async () => {
    const provider = new InstagramProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch');
    const safeFetch = analyticsSpy(provider).mockResolvedValue(
      response({ data: [] })
    );

    await expect(
      provider.analytics('ig-1', 'TOKEN', 7, undefined, 'graph.instagram.com')
    ).resolves.toEqual([]);
    await expect(
      provider.postAnalytics(
        'ig-1',
        'TOKEN',
        'media-1',
        7,
        undefined,
        'graph.instagram.com'
      )
    ).resolves.toEqual([]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledTimes(3);
    for (const [url] of safeFetch.mock.calls) {
      expect(String(url)).toContain('graph.instagram.com/v25.0/');
    }
    expect(String(safeFetch.mock.calls[2][0])).toContain(
      'graph.instagram.com/v25.0/media-1/insights'
    );
  });

  it('LinkedIn Page usa analyticsFetch nas metricas da pagina e do post', async () => {
    const provider = new LinkedinPageProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch');
    const safeFetch = analyticsSpy(provider)
      .mockResolvedValueOnce(response({ elements: [] }))
      .mockResolvedValueOnce(response({ elements: [] }))
      .mockResolvedValueOnce(response({ elements: [] }))
      .mockResolvedValueOnce(response({ elements: [] }))
      .mockResolvedValueOnce(response({}));

    await expect(
      provider.analytics('organization-1', 'TOKEN', 7)
    ).resolves.toEqual(expect.any(Array));
    await expect(
      provider.postAnalytics('organization-1', 'TOKEN', 'urn:li:share:1', 7)
    ).resolves.toEqual(expect.any(Array));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledTimes(5);
  });

  it('Pinterest usa analyticsFetch nas metricas da conta e do pin', async () => {
    const provider = new PinterestProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch');
    const safeFetch = analyticsSpy(provider)
      .mockResolvedValueOnce(response({ all: { daily_metrics: [] } }))
      .mockResolvedValueOnce(response({ all: { lifetime_metrics: {} } }));

    await expect(provider.analytics('user-1', 'TOKEN', 365)).resolves.toEqual(
      expect.any(Array)
    );
    await expect(
      provider.postAnalytics('user-1', 'TOKEN', 'pin-1', 365)
    ).resolves.toEqual([]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(String(safeFetch.mock.calls[1][0])).toContain(
      'api.pinterest.com/v5/pins/pin-1/analytics'
    );
  });

  it('Threads usa analyticsFetch nas metricas da conta e do post', async () => {
    const provider = new ThreadsProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch');
    const safeFetch = analyticsSpy(provider).mockResolvedValue(
      response({ data: [] })
    );

    await expect(provider.analytics('threads-1', 'TOKEN', 7)).resolves.toEqual(
      []
    );
    await expect(
      provider.postAnalytics('threads-1', 'TOKEN', 'thread-1', 7)
    ).resolves.toEqual([]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(String(safeFetch.mock.calls[1][0])).toContain(
      'graph.threads.net/v1.0/thread-1/insights'
    );
  });

  it('TikTok usa analyticsFetch nas metricas da conta', async () => {
    const provider = new TiktokProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch');
    const safeFetch = analyticsSpy(provider)
      .mockResolvedValueOnce(response({ data: { user: {} } }))
      .mockResolvedValueOnce(
        response({ data: { videos: [{ id: 'video-1' }] } })
      )
      .mockResolvedValueOnce(response({ data: { videos: [] } }));

    await expect(provider.analytics('user-1', 'TOKEN', 7)).resolves.toEqual([]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledTimes(3);
  });

  it('TikTok usa analyticsFetch ao resolver publish_id e ler o video', async () => {
    const provider = new TiktokProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch');
    const safeFetch = analyticsSpy(provider)
      .mockResolvedValueOnce(
        response({
          data: { publicaly_available_post_id: ['video-1'] },
        })
      )
      .mockResolvedValueOnce(response({ data: { videos: [] } }));

    await expect(
      provider.postAnalytics('user-1', 'TOKEN', 'v_pub_url:publish-1', 7)
    ).resolves.toEqual([]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(String(safeFetch.mock.calls[0][0])).toContain(
      '/post/publish/status/fetch/'
    );
  });

  it.each([
    [
      'Facebook',
      new FacebookProvider(),
      (provider: FacebookProvider) =>
        provider.postAnalytics('page-1', 'TOKEN', 'post-1', 7),
    ],
    [
      'Instagram',
      new InstagramProvider(),
      (provider: InstagramProvider) =>
        provider.postAnalytics('ig-1', 'TOKEN', 'media-1', 7),
    ],
    [
      'LinkedIn Page',
      new LinkedinPageProvider(),
      (provider: LinkedinPageProvider) =>
        provider.postAnalytics(
          'organization-1',
          'TOKEN',
          'urn:li:share:1',
          7
        ),
    ],
    [
      'Pinterest',
      new PinterestProvider(),
      (provider: PinterestProvider) =>
        provider.postAnalytics('user-1', 'TOKEN', 'pin-1', 7),
    ],
    [
      'Threads',
      new ThreadsProvider(),
      (provider: ThreadsProvider) =>
        provider.postAnalytics('threads-1', 'TOKEN', 'thread-1', 7),
    ],
    [
      'TikTok',
      new TiktokProvider(),
      (provider: TiktokProvider) =>
        provider.postAnalytics('user-1', 'TOKEN', 'video-1', 7),
    ],
  ])('%s preserva RefreshToken na leitura de post', async (_, provider, run) => {
    const expired = new RefreshToken('', '{}', '{}');
    analyticsSpy(provider).mockRejectedValue(expired);

    await expect(run(provider as never)).rejects.toBe(expired);
  });
});
