// Mocka a validacao SSRF e o dispatcher undici para tornar os testes de
// URL HTTP deterministicos (sem DNS real) e evitar construir o Agent undici.
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator',
  () => ({ isSafePublicHttpsUrl: jest.fn(), isSsrfProtectionDisabled: () => false })
);
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({
    ssrfSafeDispatcher: { __mock: 'dispatcher' },
    ssrfSafeFetch: (input: string, init: RequestInit) =>
      globalThis.fetch(input, init),
  })
);

// file-type e ESM: detector falso por magic bytes (o real e testado em
// allowed.upload.mime.spec.ts)
jest.mock('file-type', () => ({
  fileTypeFromBuffer: async (buf: Buffer) => {
    if (buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
    if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return { mime: 'image/png', ext: 'png' };
    if (buf.slice(0, 4).toString() === 'RIFF') return { mime: 'image/webp', ext: 'webp' };
    return undefined;
  },
}));

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
      // assinatura PNG em base64
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';

      const result = await loadFromUrlOrDataUrl(dataUrl);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockIsSafe).not.toHaveBeenCalled();
      expect(result.buffer[0]).toBe(0x89);
      expect(result.contentType).toBe('image/png');
      expect(result.extension).toBe('png');
    });

    it('recusa SVG/HTML (seriam servidos de volta no dominio da app)', async () => {
      await expect(
        loadFromUrlOrDataUrl('data:image/svg+xml;base64,PHN2Zy8+')
      ).rejects.toThrow('nao permitido');
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
        new Response(Buffer.from([0xff, 0xd8, 3]), {
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
        headers: { 'accept-encoding': 'identity' },
      });
      expect(result.contentType).toBe('image/jpeg');
      expect(result.extension).toBe('jpg');
      expect(result.buffer.length).toBe(3);
    });

    it('tipo vem do conteudo, nao do content-type do servidor', async () => {
      mockIsSafe.mockResolvedValue(true);
      globalThis.fetch = jest.fn(async () =>
        new Response(Buffer.from('RIFFxxxxWEBP'), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      ) as any;

      const result = await loadFromUrlOrDataUrl(
        'https://cdn.example.com/path/foo.html?v=2'
      );

      expect(result.contentType).toBe('image/webp');
      expect(result.extension).toBe('webp');
    });

    it('recusa pagina HTML servida como imagem', async () => {
      mockIsSafe.mockResolvedValue(true);
      globalThis.fetch = jest.fn(async () =>
        new Response('<html><script>alert(1)</script></html>', {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      ) as any;

      await expect(
        loadFromUrlOrDataUrl('https://example.com/avatar.png')
      ).rejects.toThrow('nao permitido');
    });

    it('recusa resposta comprimida (gzip inflaria acima do limite na memoria)', async () => {
      mockIsSafe.mockResolvedValue(true);
      globalThis.fetch = jest.fn(async () =>
        new Response(Buffer.from([0xff, 0xd8]), {
          status: 200,
          headers: { 'content-encoding': 'gzip' },
        })
      ) as any;

      await expect(
        loadFromUrlOrDataUrl('https://example.com/bomb.jpg')
      ).rejects.toThrow('Compressed response refused');
    });

    it('recusa resposta acima de 1 GB (limite de upload de video)', async () => {
      mockIsSafe.mockResolvedValue(true);
      globalThis.fetch = jest.fn(async () =>
        new Response(new Uint8Array(1), {
          status: 200,
          headers: { 'content-length': String(2 * 1024 * 1024 * 1024) },
        })
      ) as any;

      await expect(
        loadFromUrlOrDataUrl('https://example.com/huge.mp4')
      ).rejects.toThrow(/exceeds/);
    });

    it('recusa HTTP de erro em vez de gravar a pagina de erro como midia', async () => {
      mockIsSafe.mockResolvedValue(true);
      globalThis.fetch = jest.fn(async () =>
        new Response('not found', { status: 404 })
      ) as any;

      await expect(
        loadFromUrlOrDataUrl('https://example.com/missing.jpg')
      ).rejects.toThrow('HTTP 404');
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
