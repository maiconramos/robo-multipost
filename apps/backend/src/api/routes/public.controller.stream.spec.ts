jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkServiceMock {},
}));
jest.mock('@gitroom/nestjs-libraries/agent/agent.graph.insert.service', () => ({
  AgentGraphInsertService: class AgentGraphInsertServiceMock {},
}));

jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator',
  () => ({
    ...jest.requireActual(
      '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator'
    ),
    isSafePublicHttpsUrl: jest.fn().mockResolvedValue(true),
  })
);

import { EventEmitter } from 'events';
import { Writable } from 'stream';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { PublicController } from './public.controller';

// O player de video fecha a conexao antes do upstream responder: o fetch
// aborta e isso nao e erro (antes subia como ExceptionsHandler no log).
describe('PublicController.streamFile (player fechado)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const build = () =>
    new PublicController(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any
    );

  it('fetch abortado pelo cliente termina sem lancar', async () => {
    const req = new EventEmitter();
    const res = Object.assign(new EventEmitter(), {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
    });
    global.fetch = jest.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('This operation was aborted', 'AbortError'))
        );
        res.emit('close');
      });
    }) as any;

    await expect(
      build().streamFile(
        { url: 'https://cdn.example.com/v.mp4' } as any,
        res as any,
        req as any
      )
    ).resolves.toBeUndefined();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('falha de rede sem abort continua sendo erro', async () => {
    const req = new EventEmitter();
    const res = Object.assign(new EventEmitter(), {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
    });
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as any;

    await expect(
      build().streamFile(
        { url: 'https://cdn.example.com/v.mp4' } as any,
        res as any,
        req as any
      )
    ).rejects.toThrow('fetch failed');
  });
});

const streamResponse = () => {
  const chunks: Buffer[] = [];
  const headers = new Map<string, string>();
  const res = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  }) as Writable & {
    statusCode: number;
    status: jest.Mock;
    setHeader: jest.Mock;
    send: jest.Mock;
  };
  res.statusCode = 200;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.setHeader = jest.fn((name: string, value: string) => {
    headers.set(name.toLowerCase(), value);
  });
  res.send = jest.fn((body: string) => res.end(body));
  return { res, headers, body: () => Buffer.concat(chunks).toString() };
};

const streamRequest = (range?: unknown) =>
  Object.assign(new EventEmitter(), { headers: { range } });

const streamController = () =>
  new PublicController(
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any
  );

describe('PublicController.streamFile (selecao de quadros por Range)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    (isSafePublicHttpsUrl as jest.Mock).mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ['bytes=1024-1028', 'bytes 1024-1028/10000'],
    ['bytes=9995-', 'bytes 9995-9999/10000'],
    ['bytes=-5', 'bytes 9995-9999/10000'],
  ])(
    'encaminha intervalo unico %s e preserva resposta parcial',
    async (range, contentRange) => {
      const { res, headers, body } = streamResponse();
      global.fetch = jest.fn().mockResolvedValue(
        new Response('frame', {
          status: 206,
          headers: {
            'content-range': contentRange,
            'content-length': '5',
            'content-type': 'video/mp4',
            'accept-ranges': 'bytes',
          },
        })
      );
      await streamController().streamFile(
        { url: 'https://cdn.example.com/v.mp4' } as any,
        res as any,
        streamRequest(range) as any
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://cdn.example.com/v.mp4',
        expect.objectContaining({
          headers: { Range: range, 'Accept-Encoding': 'identity' },
          redirect: 'manual',
          dispatcher: expect.anything(),
          signal: expect.anything(),
        })
      );
      expect(res.statusCode).toBe(206);
      expect(headers.get('content-range')).toBe(contentRange);
      expect(headers.get('content-length')).toBe('5');
      expect(body()).toBe('frame');
    }
  );

  it('retorna 416 com tamanho da origem sem expor corpo nem virar 500', async () => {
    const { res, headers, body } = streamResponse();
    global.fetch = jest.fn().mockResolvedValue(
      new Response('private upstream error', {
        status: 416,
        headers: { 'content-range': 'bytes */10000' },
      })
    );
    await expect(
      streamController().streamFile(
        { url: 'https://cdn.example.com/v.mp4' } as any,
        res as any,
        streamRequest('bytes=10000-') as any
      )
    ).resolves.toBe(res);
    expect(res.statusCode).toBe(416);
    expect(headers.get('content-range')).toBe('bytes */10000');
    expect(body()).toBe('');
  });

  it.each(
    [
      'bytes=0-1,3-4',
      'bytes=abc',
      'bytes=-',
      'bytes=10-5',
      'bytes=' + '1'.repeat(130) + '-',
      ['bytes=0-1', 'bytes=2-3'],
    ].map((range) => [range])
  )(
    'recusa Range invalido ou multiplo antes de buscar origem: %s',
    async (range) => {
      const { res } = streamResponse();
      global.fetch = jest.fn();
      await streamController().streamFile(
        { url: 'https://cdn.example.com/v.mp4' } as any,
        res as any,
        streamRequest(range) as any
      );
      expect(res.statusCode).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(isSafePublicHttpsUrl).not.toHaveBeenCalled();
    }
  );

  it('origem que ignora Range continua 200 sem anunciar suporte inexistente', async () => {
    const { res, headers, body } = streamResponse();
    global.fetch = jest.fn().mockResolvedValue(
      new Response('whole video', {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    );
    await streamController().streamFile(
      { url: 'https://cdn.example.com/v.mp4' } as any,
      res as any,
      streamRequest('bytes=1024-') as any
    );
    expect(res.statusCode).toBe(200);
    expect(headers.has('accept-ranges')).toBe(false);
    expect(headers.has('content-range')).toBe(false);
    expect(body()).toBe('whole video');
  });

  it('preserva Range em redirect seguro sem encaminhar cookies ou credenciais', async () => {
    const { res } = streamResponse();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn2.example.com/v.mp4' },
        })
      )
      .mockResolvedValueOnce(
        new Response('frame', {
          status: 206,
          headers: {
            'content-range': 'bytes 0-4/10000',
            'content-type': 'video/mp4',
          },
        })
      );
    const req = streamRequest('bytes=0-4');
    Object.assign(req.headers, {
      cookie: 'private',
      authorization: 'Bearer private',
    });
    await streamController().streamFile(
      { url: 'https://cdn.example.com/v.mp4' } as any,
      res as any,
      req as any
    );
    expect(isSafePublicHttpsUrl).toHaveBeenNthCalledWith(
      1,
      'https://cdn.example.com/v.mp4'
    );
    expect(isSafePublicHttpsUrl).toHaveBeenNthCalledWith(
      2,
      'https://cdn2.example.com/v.mp4'
    );
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [, options] of calls)
      expect(options.headers).toEqual({
        Range: 'bytes=0-4',
        'Accept-Encoding': 'identity',
      });
  });
  it('bloqueia redirect privado antes da segunda busca e cancela corpo anterior', async () => {
    const { res } = streamResponse();
    (isSafePublicHttpsUrl as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const redirect = new Response('redirect payload', {
      status: 302,
      headers: { location: 'https://127.0.0.1/private.mp4' },
    });
    const cancel = jest.spyOn(redirect.body!, 'cancel');
    global.fetch = jest.fn().mockResolvedValueOnce(redirect);
    await streamController().streamFile(
      { url: 'https://cdn.example.com/v.mp4' } as any,
      res as any,
      streamRequest('bytes=0-4') as any
    );
    expect(res.statusCode).toBe(400);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each([
    'text/html',
    'image/svg+xml',
    'application/xhtml+xml',
    'text/plain',
  ])('recusa conteudo ativo ou inesperado da origem: %s', async (type) => {
    const { res, body } = streamResponse();
    const upstream = new Response('unexpected upstream content', {
      headers: { 'content-type': type },
    });
    const cancel = jest.spyOn(upstream.body!, 'cancel');
    global.fetch = jest.fn().mockResolvedValue(upstream);
    await streamController().streamFile(
      { url: 'https://cdn.example.com/v.mp4' } as any,
      res as any,
      streamRequest() as any
    );
    expect(res.statusCode).toBe(502);
    expect(body()).not.toContain('unexpected upstream content');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    'video/mp4',
    'video/mp4; charset=binary',
    'application/mp4',
    'application/octet-stream',
  ])(
    'normaliza MIME de video e impede interpretacao ativa: %s',
    async (type) => {
      const { res, headers, body } = streamResponse();
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          new Response('video bytes', { headers: { 'content-type': type } })
        );
      await streamController().streamFile(
        { url: 'https://cdn.example.com/v.mp4' } as any,
        res as any,
        streamRequest() as any
      );
      expect(res.statusCode).toBe(200);
      expect(headers.get('content-type')).toBe('video/mp4');
      expect(headers.get('x-content-type-options')).toBe('nosniff');
      expect(headers.get('content-security-policy')).toContain(
        "default-src 'none'"
      );
      expect(headers.get('content-security-policy')).toContain('sandbox');
      expect(body()).toBe('video bytes');
    }
  );
  it('aceita video binario sem Content-Type mantendo MIME seguro', async () => {
    const { res, headers, body } = streamResponse();
    const upstream = new Response(new Uint8Array([102, 114, 97, 109, 101]));
    expect(upstream.headers.get('content-type')).toBeNull();
    global.fetch = jest.fn().mockResolvedValue(upstream);
    await streamController().streamFile(
      { url: 'https://cdn.example.com/v.mp4' } as any,
      res as any,
      streamRequest() as any
    );
    expect(res.statusCode).toBe(200);
    expect(headers.get('content-type')).toBe('video/mp4');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(body()).toBe('frame');
  });
});
