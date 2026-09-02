import 'reflect-metadata';

const mockGenerateAuthUrl = jest.fn(() => 'https://accounts.google.test/auth');
const mockSetCredentials = jest.fn();
const mockGetToken = jest.fn();
const mockGetTokenInfo = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockUserinfoGet = jest.fn();

const mockOAuthClient = {
  generateAuthUrl: mockGenerateAuthUrl,
  setCredentials: mockSetCredentials,
  getToken: mockGetToken,
  getTokenInfo: mockGetTokenInfo,
  refreshAccessToken: mockRefreshAccessToken,
};

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => mockOAuthClient),
    },
    oauth2: jest.fn(() => ({
      userinfo: { get: mockUserinfoGet },
    })),
  },
}));

import { google } from 'googleapis';
import { GmbProvider } from './gmb.provider';

const clientInformation = {
  client_id: 'profile-google-id',
  client_secret: 'profile-google-secret',
  instanceUrl: '',
};

const postDetails = [
  {
    id: 'post-1',
    message: 'Atualizacao da empresa',
    settings: { topicType: 'STANDARD' },
  },
] as any;

const responseWith = (body: unknown) =>
  ({ json: jest.fn().mockResolvedValue(body) } as unknown as Response);

describe('GmbProvider', () => {
  let provider: GmbProvider;

  beforeEach(() => {
    provider = new GmbProvider();
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() + 3_600_000,
      },
    });
    mockGetTokenInfo.mockResolvedValue({ scopes: provider.scopes });
    mockRefreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 3_600_000,
      },
    });
    mockUserinfoGet.mockResolvedValue({
      data: { id: 'user-1', name: 'Usuario Google', picture: '' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('post', () => {
    it('rejeita resposta com estado REJECTED mesmo quando ela tem nome', async () => {
      jest.spyOn(provider, 'fetch').mockResolvedValue(
        responseWith({
          name: 'accounts/1/locations/2/localPosts/3',
          state: 'REJECTED',
        })
      );

      await expect(
        provider.post('accounts/1/locations/2', 'access-token', postDetails)
      ).rejects.toThrow('Google rejected this post');
    });

    it('rejeita resposta JSON sem o identificador do post', async () => {
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(responseWith({ state: 'LIVE' }));

      await expect(
        provider.post('accounts/1/locations/2', 'access-token', postDetails)
      ).rejects.toThrow('Google did not confirm the post creation');
    });

    it('trata resposta nao JSON como criacao nao confirmada', async () => {
      jest.spyOn(provider, 'fetch').mockResolvedValue({
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      } as unknown as Response);

      await expect(
        provider.post('accounts/1/locations/2', 'access-token', postDetails)
      ).rejects.toThrow('Google did not confirm the post creation');
    });

    it('mantem o sucesso quando o Google confirma o post', async () => {
      jest.spyOn(provider, 'fetch').mockResolvedValue(
        responseWith({
          name: 'accounts/1/locations/2/localPosts/3',
          state: 'LIVE',
        })
      );

      await expect(
        provider.post('accounts/1/locations/2', 'access-token', postDetails)
      ).resolves.toEqual([
        {
          id: 'post-1',
          postId: 'accounts/1/locations/2/localPosts/3',
          releaseURL: 'https://business.google.com/locations/2',
          status: 'success',
        },
      ]);
    });
  });

  describe('OAuth por perfil', () => {
    const oauthConstructor = google.auth.OAuth2 as unknown as jest.Mock;

    it('usa as credenciais do perfil ao gerar a URL', async () => {
      await provider.generateAuthUrl(clientInformation);

      expect(oauthConstructor).toHaveBeenCalledWith({
        clientId: 'profile-google-id',
        clientSecret: 'profile-google-secret',
        redirectUri: expect.stringContaining('/integrations/social/gmb'),
      });
    });

    it('usa as credenciais do perfil ao trocar o codigo', async () => {
      await provider.authenticate(
        { code: 'code', codeVerifier: 'verifier' },
        clientInformation
      );

      expect(oauthConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'profile-google-id',
          clientSecret: 'profile-google-secret',
        })
      );
    });

    it('usa as credenciais do perfil ao renovar o token', async () => {
      await provider.refreshToken('refresh-token', clientInformation);

      expect(oauthConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'profile-google-id',
          clientSecret: 'profile-google-secret',
        })
      );
    });

    it('preserva os tokens retornados pelo novo consentimento', () => {
      expect(provider.keepReconnectAuthTokens).toBe(true);
    });

    it('revoga o token antigo antes de iniciar uma reconexao', async () => {
      const post = jest.fn().mockResolvedValue({});
      jest.spyOn(provider as any, 'getSsrfSafeAxios').mockReturnValue({ post });

      await provider.revokeToken('access token');

      expect(post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/revoke?token=access%20token',
        null,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    });
  });
});
