import 'reflect-metadata';
import { InstagramStandaloneProvider } from './instagram.standalone.provider';

describe('InstagramStandaloneProvider Graph API', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('consulta /me pela Graph v25 depois de renovar o token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: 'NEW_TOKEN' }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          user_id: 'ig-1',
          name: 'Conta',
          username: 'conta',
          profile_picture_url: 'https://cdn/avatar.jpg',
        }),
      });
    global.fetch = fetchMock as any;

    const result = await new InstagramStandaloneProvider().refreshToken(
      'OLD_TOKEN'
    );

    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'graph.instagram.com/v25.0/me'
    );
    expect(result.accessToken).toBe('NEW_TOKEN');
  });
});
