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
        expect.stringContaining('/page-1/photos'),
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
      const fetchMock = jest.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('rupload.facebook.com'))
          return makeRes({ success: true });
        if (url.includes('/video_stories')) {
          const body = JSON.parse(options?.body || '{}');
          if (body.upload_phase === 'start')
            return makeRes({
              video_id: 'vid-9',
              upload_url: 'https://rupload.facebook.com/video-upload/v25.0/vid-9',
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

    it('deve publicar cada midia como story separado quando ha multiplas (story nao tem carrossel)', async () => {
      let storyCount = 0;
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/photo_stories')) {
          storyCount += 1;
          return makeRes({ success: true, post_id: storyCount });
        }
        if (url.includes('/photos')) return makeRes({ id: `photo-${storyCount}` });
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
