import 'reflect-metadata';
import { FacebookProvider } from './facebook.provider';

// Helper para montar uma Response-like compativel com SocialAbstract.fetch
// (que so retorna o request quando status e 200/201 e depois o caller faz .json()).
const makeRes = (body: any, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const buildPost = (overrides: Partial<any> = {}) =>
  [
    {
      id: 'p1',
      message: 'Ola mundo',
      settings: {},
      media: [],
      ...overrides,
    },
  ] as any;

describe('FacebookProvider', () => {
  let provider: FacebookProvider;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    provider = new FacebookProvider();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  describe('flags do provider', () => {
    it('declara noNativeRefresh pois o refreshToken e stub (Page token nao renova)', () => {
      // Consumido por IntegrationService.refreshTokens: sem esta flag o cron
      // em lote volta a desconectar canal saudavel por falso positivo.
      expect(provider.noNativeRefresh).toBe(true);
    });

    it('mantem erros 190/460 e 190/464 como falha de sessao para self-heal', () => {
      for (const subcode of [460, 464]) {
        const body = JSON.stringify({
          error: {
            message: 'Error validating access token',
            type: 'OAuthException',
            code: 190,
            error_subcode: subcode,
          },
        });

        expect(provider.handleErrors(body, 400)?.type).toBe('refresh-token');
      }
    });
  });

  describe('Graph API v25', () => {
    it('gera OAuth v25 usando a credencial recebida por perfil', async () => {
      const auth = await provider.generateAuthUrl({
        client_id: 'profile-app-id',
        client_secret: 'profile-app-secret',
        instanceUrl: '',
      });

      expect(auth.url).toContain('facebook.com/v25.0/dialog/oauth');
      expect(auth.url).toContain('client_id=profile-app-id');
    });

    it('troca o codigo e valida permissoes em v25 com credencial por perfil', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(makeRes({ access_token: 'SHORT' }))
        .mockResolvedValueOnce(
          makeRes({ access_token: 'LONG', expires_in: 5_097_600 })
        )
        .mockResolvedValueOnce(
          makeRes({
            data: provider.scopes.map((permission) => ({
              permission,
              status: 'granted',
            })),
          })
        )
        .mockResolvedValueOnce(
          makeRes({
            id: 'user-1',
            name: 'User',
            picture: { data: { url: 'https://cdn/avatar.jpg' } },
          })
        );
      global.fetch = fetchMock as any;

      const result = await provider.authenticate(
        { code: 'CODE', codeVerifier: 'VERIFIER' },
        {
          client_id: 'profile-app-id',
          client_secret: 'profile-app-secret',
          instanceUrl: '',
        }
      );

      for (const [url] of fetchMock.mock.calls) {
        expect(String(url)).toContain('graph.facebook.com/v25.0/');
      }
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        'client_id=profile-app-id'
      );
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        'client_secret=profile-app-secret'
      );
      expect(result.accessToken).toBe('LONG');
    });

    it('descobre paginas e Business Managers somente pela Graph v25', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/me/accounts')) {
          return makeRes({
            data: [
              {
                id: 'page-1',
                name: 'Pagina',
                access_token: 'PAGE_TOKEN',
              },
            ],
          });
        }
        if (url.includes('/me/businesses')) {
          return makeRes({ data: [] });
        }
        return makeRes({ data: [] });
      });
      global.fetch = fetchMock as any;

      const pages = await provider.pages('USER_TOKEN');

      expect(pages).toHaveLength(1);
      for (const [url] of fetchMock.mock.calls) {
        expect(String(url)).toContain('graph.facebook.com/v25.0/');
      }
    });

    it('usa somente metricas atuais de Page Insights e soma breakdowns', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        makeRes({
          data: [
            {
              name: 'page_total_media_view_unique',
              values: [{ value: 12, end_time: '2026-09-01T00:00:00+0000' }],
            },
            {
              name: 'page_media_view',
              values: [
                {
                  value: { organic: 7, paid: 3 },
                  end_time: '2026-09-01T00:00:00+0000',
                },
              ],
            },
          ],
        })
      );
      global.fetch = fetchMock as any;

      const result = await provider.analytics('page-1', 'TOK', 7);

      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('graph.facebook.com/v25.0/page-1/insights');
      expect(url).toContain('page_total_media_view_unique');
      expect(url).toContain('page_media_view');
      expect(url).not.toContain('page_impressions_unique');
      expect(url).not.toContain('page_posts_impressions_unique');
      expect(url).not.toContain('page_video_views');
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Page Impressions',
            data: [expect.objectContaining({ total: '12' })],
          }),
          expect.objectContaining({
            label: 'Media views',
            data: [expect.objectContaining({ total: '10' })],
          }),
        ])
      );
    });

    it('usa post_total_media_view_unique no Post Insights v25', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        makeRes({
          data: [
            {
              name: 'post_total_media_view_unique',
              values: [{ value: 21 }],
            },
          ],
        })
      );
      global.fetch = fetchMock as any;

      const result = await provider.postAnalytics(
        'integration-1',
        'TOK',
        'post-1',
        7
      );

      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('graph.facebook.com/v25.0/post-1/insights');
      expect(url).toContain('post_total_media_view_unique');
      expect(url).not.toContain('post_impressions_unique');
      expect(result[0]).toMatchObject({
        label: 'Impressions',
        data: [{ total: '21' }],
      });
    });
  });

  describe('post (feed)', () => {
    it('deve publicar imagem no feed via /photos e /feed quando nao for story', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/photos')) return makeRes({ id: 'photo-1' });
        if (url.includes('/feed'))
          return makeRes({ id: 'feed-1', permalink_url: 'https://fb/feed-1' });
        return makeRes({});
      });
      global.fetch = fetchMock as any;

      const res = await provider.post(
        'page-1',
        'TOK',
        buildPost({ media: [{ path: 'https://cdn/img.jpg' }] })
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('graph.facebook.com/v25.0/page-1/photos'),
        expect.anything()
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/page-1/feed'),
        expect.anything()
      );
      expect(res[0].status).toBe('success');
      expect(res[0].postId).toBe('feed-1');
      expect(res[0].releaseURL).toBe('https://fb/feed-1');
    });

    it('deve publicar video como Reel via /videos quando nao for story', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/videos'))
          return makeRes({ id: 'vid-1', permalink_url: 'ignored' });
        return makeRes({});
      });
      global.fetch = fetchMock as any;

      const res = await provider.post(
        'page-1',
        'TOK',
        buildPost({ media: [{ path: 'https://cdn/v.mp4' }] })
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/page-1/videos'),
        expect.anything()
      );
      expect(res[0].postId).toBe('vid-1');
      expect(res[0].releaseURL).toContain('reel/vid-1');
    });
  });

  describe('post (story)', () => {
    it('deve publicar story de imagem via /photos (unpublished) e /photo_stories', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/photo_stories'))
          return makeRes({ success: true, post_id: 999 });
        if (url.includes('/photos')) return makeRes({ id: 'photo-1' });
        return makeRes({});
      });
      global.fetch = fetchMock as any;

      const res = await provider.post(
        'page-1',
        'TOK',
        buildPost({
          settings: { post_type: 'story' },
          media: [{ path: 'https://cdn/img.jpg' }],
        })
      );

      const photosCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/page-1/photos')
      );
      expect(photosCall).toBeDefined();
      expect(String(photosCall![1].body)).toContain('"published":false');

      const storyCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/page-1/photo_stories')
      );
      expect(storyCall).toBeDefined();
      expect(String(storyCall![1].body)).toContain('"photo_id":"photo-1"');

      expect(res[0].status).toBe('success');
      expect(res[0].postId).toBe('999');
    });

    it('deve publicar story de video via video_stories em 3 fases (start/upload/finish)', async () => {
      const fetchMock = jest
        .fn()
        .mockImplementation((url: string, options: any) => {
          if (url.includes('rupload.facebook.com'))
            return makeRes({ success: true });
          if (url.includes('fields=status'))
            return makeRes({ status: { video_status: 'upload_complete' } });
          if (url.includes('/video_stories')) {
            const body = JSON.parse(options?.body || '{}');
            if (body.upload_phase === 'start')
              return makeRes({
                video_id: 'vid-9',
                upload_url:
                  'https://rupload.facebook.com/video-upload/v25.0/vid-9',
              });
            return makeRes({ success: true, post_id: 555 });
          }
          return makeRes({});
        });
      global.fetch = fetchMock as any;

      const res = await provider.post(
        'page-1',
        'TOK',
        buildPost({
          settings: { post_type: 'story' },
          media: [{ path: 'https://cdn/v.mp4' }],
        })
      );

      // start
      const startCall = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes('/video_stories') &&
          String(c[1]?.body).includes('"upload_phase":"start"')
      );
      expect(startCall).toBeDefined();

      // upload hospedado: Meta busca o arquivo pela URL (header file_url)
      const uploadCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('rupload.facebook.com')
      );
      expect(uploadCall).toBeDefined();
      expect(uploadCall![1].headers.file_url).toBe('https://cdn/v.mp4');
      expect(uploadCall![1].headers.Authorization).toBe('OAuth TOK');

      const statusCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('vid-9?fields=status')
      );
      expect(statusCall).toBeDefined();

      // finish
      const finishCall = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes('/video_stories') &&
          String(c[1]?.body).includes('"upload_phase":"finish"')
      );
      expect(finishCall).toBeDefined();
      expect(String(finishCall![1].body)).toContain('"video_id":"vid-9"');

      expect(res[0].status).toBe('success');
      expect(res[0].postId).toBe('555');
    });

    it('nao chama finish quando a Meta informa erro no processamento do video', async () => {
      const fetchMock = jest
        .fn()
        .mockImplementation((url: string, options: any) => {
          if (url.includes('rupload.facebook.com')) {
            return makeRes({ success: true });
          }
          if (url.includes('fields=status')) {
            return makeRes({ status: { video_status: 'error' } });
          }
          if (url.includes('/video_stories')) {
            const body = JSON.parse(options?.body || '{}');
            if (body.upload_phase === 'start') {
              return makeRes({
                video_id: 'vid-error',
                upload_url:
                  'https://rupload.facebook.com/video-upload/vid-error',
              });
            }
            return makeRes({ post_id: 'nao-deveria-publicar' });
          }
          return makeRes({});
        });
      global.fetch = fetchMock as any;

      await expect(
        provider.post(
          'page-1',
          'TOK',
          buildPost({
            settings: { post_type: 'story' },
            media: [{ path: 'https://cdn/v.mp4' }],
          })
        )
      ).rejects.toBeDefined();

      const finishCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/video_stories') &&
          String(call[1]?.body).includes('"upload_phase":"finish"')
      );
      expect(finishCall).toBeUndefined();
    });

    it('deve publicar cada midia como story separado quando ha multiplas (story nao tem carrossel)', async () => {
      let storyCount = 0;
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/photo_stories')) {
          storyCount += 1;
          return makeRes({ success: true, post_id: storyCount });
        }
        if (url.includes('/photos'))
          return makeRes({ id: `photo-${storyCount}` });
        return makeRes({});
      });
      global.fetch = fetchMock as any;

      const res = await provider.post(
        'page-1',
        'TOK',
        buildPost({
          settings: { post_type: 'story' },
          media: [{ path: 'https://cdn/a.jpg' }, { path: 'https://cdn/b.jpg' }],
        })
      );

      const photoStoriesCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/photo_stories')
      );
      expect(photoStoriesCalls).toHaveLength(2);
      // retorna o ultimo post_id publicado
      expect(res[0].postId).toBe('2');
    });
  });
});
