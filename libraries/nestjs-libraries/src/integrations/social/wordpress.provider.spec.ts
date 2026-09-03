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
}: {
  status?: number;
  body?: unknown;
  jsonError?: Error;
}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
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
