import 'reflect-metadata';

const mockSsrfSafeFetch = jest.fn();

jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({
    ssrfSafeFetch: mockSsrfSafeFetch,
  })
);

import { WordpressProvider } from './wordpress.provider';

const credentials = {
  domain: '  https://example.com///  ',
  username: 'editor',
  password: 'application-password-secret',
};

const code = Buffer.from(JSON.stringify(credentials)).toString('base64');

const responseWith = ({
  status = 200,
  body,
  jsonError,
  headers = {},
}: {
  status?: number;
  body?: unknown;
  jsonError?: Error;
  headers?: Record<string, string>;
}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: jsonError
      ? jest.fn().mockRejectedValue(jsonError)
      : jest.fn().mockResolvedValue(body),
    text: jest
      .fn()
      .mockResolvedValue(
        typeof body === 'string' ? body : JSON.stringify(body ?? '')
      ),
  } as unknown as Response);

describe('WordpressProvider authenticate', () => {
  let provider: WordpressProvider;

  beforeEach(() => {
    provider = new WordpressProvider();
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes whitespace and trailing slashes without bypassing SSRF protection', async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      responseWith({
        body: {
          id: 7,
          name: 'WordPress Editor',
          avatar_urls: { 24: 'small.jpg', 96: 'large.jpg' },
        },
      })
    );

    await provider.authenticate({ code, codeVerifier: '' });

    expect(mockSsrfSafeFetch).toHaveBeenCalledWith(
      'https://example.com/wp-json/wp/v2/users/me',
      {
        headers: {
          Authorization: expect.stringMatching(/^Basic /),
        },
      }
    );
  });

  it('keeps the existing success contract', async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      responseWith({
        body: {
          id: 7,
          name: 'WordPress Editor',
          avatar_urls: { 24: 'small.jpg', 96: 'large.jpg' },
        },
      })
    );

    await expect(
      provider.authenticate({ code, codeVerifier: '' })
    ).resolves.toEqual({
      refreshToken: '',
      expiresIn: expect.any(Number),
      accessToken: code,
      id: '  https://example.com///  _7',
      name: 'WordPress Editor',
      picture: 'large.jpg',
      username: 'editor',
    });
  });

  it('surfaces an unreachable site separately from rejected credentials', async () => {
    mockSsrfSafeFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(
      provider.authenticate({ code, codeVerifier: '' })
    ).resolves.toContain('Could not reach your WordPress site');
  });

  it.each([401, 403])(
    'explains an HTTP %s authentication rejection',
    async (status) => {
      mockSsrfSafeFetch.mockResolvedValue(
        responseWith({
          status,
          body: {
            code: 'rest_not_logged_in',
            message: 'You are not currently logged in.',
          },
        })
      );

      await expect(
        provider.authenticate({ code, codeVerifier: '' })
      ).resolves.toContain('Application Password');
    }
  );

  it('surfaces other WordPress HTTP errors with the response status', async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      responseWith({ status: 500, body: '<html>Proxy error</html>' })
    );

    await expect(
      provider.authenticate({ code, codeVerifier: '' })
    ).resolves.toContain('HTTP 500');
  });

  it('surfaces a successful non-JSON response as an invalid REST response', async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      responseWith({
        body: '<html>Maintenance</html>',
        jsonError: new SyntaxError('Unexpected token'),
      })
    );

    await expect(
      provider.authenticate({ code, codeVerifier: '' })
    ).resolves.toContain('did not return a valid response');
  });

  it('does not write the username, password, or authorization header to logs', async () => {
    const log = console.warn as jest.Mock;
    mockSsrfSafeFetch.mockResolvedValue(
      responseWith({
        status: 401,
        body: {
          code: 'rest_not_logged_in',
          message: 'Authentication failed.',
        },
      })
    );

    await provider.authenticate({ code, codeVerifier: '' });

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(credentials.username);
    expect(logged).not.toContain(credentials.password);
    expect(logged).not.toContain('Basic ');
  });

  it('advertises the Application Password help text to the connection UI', async () => {
    await expect(provider.customFields()).resolves.toContainEqual(
      expect.objectContaining({
        key: 'password',
        hint: 'wordpress_application_password_hint',
      })
    );
  });
});

describe('WordpressProvider post settings', () => {
  let provider: WordpressProvider;

  beforeEach(() => {
    provider = new WordpressProvider();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists categories through the SSRF-safe provider fetch', async () => {
    const fetch = jest.spyOn(provider, 'fetch').mockResolvedValue(
      responseWith({
        body: [
          { id: 2, name: 'News', ignored: true },
          { id: 5, name: 'Product' },
        ],
      })
    );

    await expect((provider as any).categoriesList(code)).resolves.toEqual([
      { id: 2, name: 'News' },
      { id: 5, name: 'Product' },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/wp-json/wp/v2/categories?per_page=100',
      expect.objectContaining({
        headers: { Authorization: expect.stringMatching(/^Basic /) },
      })
    );
  });

  it('lists tags and safely converts a non-array response to an empty list', async () => {
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(
        responseWith({ body: [{ id: 8, name: 'Launch' }] })
      )
      .mockResolvedValueOnce(responseWith({ body: { code: 'invalid' } }));

    await expect((provider as any).tagsList(code)).resolves.toEqual([
      { id: 8, name: 'Launch' },
    ]);
    await expect((provider as any).tagsList(code)).resolves.toEqual([]);
  });

  it('publishes selected terms and status with positive integer IDs only', async () => {
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(
        responseWith({ body: { id: 44, link: 'https://example.com/post/44' } })
      );

    await provider.post(
      'site-1',
      code,
      [
        {
          id: 'post-1',
          message: '<p>Content</p>',
          settings: {
            title: 'Launch',
            type: 'posts',
            status: 'draft',
            categories: ['2', 3, 3, 0, -1, 4.5, 'invalid'],
            tags: ['8', 9],
          },
        },
      ] as any,
      {} as any
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://example.com/wp-json/wp/v2/posts');
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        status: 'draft',
        categories: [2, 3],
        tags: [8, 9],
      })
    );
  });

  it('keeps publish as the default and omits empty term arrays', async () => {
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(
        responseWith({ body: { id: 44, link: 'https://example.com/post/44' } })
      );

    await provider.post(
      'site-1',
      code,
      [
        {
          id: 'post-1',
          message: '<p>Content</p>',
          settings: { title: 'Legacy post', type: 'posts' },
        },
      ] as any,
      {} as any
    );

    const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(payload.status).toBe('publish');
    expect(payload).not.toHaveProperty('categories');
    expect(payload).not.toHaveProperty('tags');
  });
});
