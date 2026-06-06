// Mocka a validacao SSRF e o dispatcher undici para tornar os testes de
// URL HTTP deterministicos (sem DNS real) e evitar construir o Agent undici.
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator',
  () => ({ isSafePublicHttpsUrl: jest.fn() })
);
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ ssrfSafeDispatcher: { __mock: 'dispatcher' } })
);

import { loadFromUrlOrDataUrl } from './storage.helpers';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';

const mockIsSafe = isSafePublicHttpsUrl as jest.Mock;

describe('loadFromUrlOrDataUrl', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockIsSafe.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('data URLs', () => {
    it('decodifica data URL base64 sem chamar fetch nem validar SSRF', async () => {
      const fetchSpy = jest.fn();
      globalThis.fetch = fetchSpy as any;
      // "Hello" em base64
      const dataUrl = 'data:image/png;base64,SGVsbG8=';

      const result = await loadFromUrlOrDataUrl(dataUrl);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockIsSafe).not.toHaveBeenCalled();
      expect(result.buffer.toString('utf8')).toBe('Hello');
      expect(result.contentType).toBe('image/png');
      expect(result.extension).toBe('png');
    });

    it('extrai extensao mesmo em mime composto (image/svg+xml)', async () => {
      const dataUrl = 'data:image/svg+xml;base64,PHN2Zy8+';

      const result = await loadFromUrlOrDataUrl(dataUrl);

      expect(result.contentType).toBe('image/svg+xml');
      expect(result.extension).toBe('svg');
    });

    it('lanca erro em data URL invalida', async () => {
      await expect(
        loadFromUrlOrDataUrl('data:malformed')
      ).rejects.toThrow('data URL invalida');
    });
  });

  describe('URLs HTTP', () => {
    it('valida SSRF e faz fetch com o dispatcher quando a URL e segura', async () => {
      mockIsSafe.mockResolvedValue(true);
      const fetchSpy = jest.fn(async (..._args: any[]) =>
        new Response(Buffer.from([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      );
      globalThis.fetch = fetchSpy as any;

      const result = await loadFromUrlOrDataUrl('https://example.com/foo.jpg');

      expect(mockIsSafe).toHaveBeenCalledWith('https://example.com/foo.jpg');
      expect(fetchSpy.mock.calls[0][0]).toBe('https://example.com/foo.jpg');
      expect(fetchSpy.mock.calls[0][1]).toMatchObject({
        dispatcher: { __mock: 'dispatcher' },
      });
      expect(result.contentType).toBe('image/jpeg');
      expect(result.extension).toBe('jpeg');
      expect(result.buffer.length).toBe(3);
    });

    it('extrai extensao do content-type webp', async () => {
      mockIsSafe.mockResolvedValue(true);
      const fetchSpy = jest.fn(async () =>
        new Response(Buffer.from([0]), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        })
      );
      globalThis.fetch = fetchSpy as any;

      const result = await loadFromUrlOrDataUrl(
        'https://cdn.example.com/path/foo.webp?v=2'
      );

      expect(result.contentType).toBe('image/webp');
      expect(result.extension).toBe('webp');
    });

    it('rejeita URL insegura (SSRF) sem chamar fetch', async () => {
      mockIsSafe.mockResolvedValue(false);
      const fetchSpy = jest.fn();
      globalThis.fetch = fetchSpy as any;

      await expect(
        loadFromUrlOrDataUrl('http://169.254.169.254/latest/meta-data')
      ).rejects.toThrow('Unsafe URL');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
