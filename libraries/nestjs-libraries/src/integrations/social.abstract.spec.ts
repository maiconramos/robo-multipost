import axios, { AxiosInstance, CanceledError } from 'axios';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import {
  BadBody,
  PublishedWithError,
  heartbeatEndpoint,
  MEDIA_READ_MAX_BYTES,
  MEDIA_READ_TIMEOUT,
  RefreshToken,
  SocialAbstract,
  truncateForTemporal,
} from './social.abstract';
import { ssrfSafeDispatcher } from '../dtos/webhooks/ssrf.safe.dispatcher';

class TestProvider extends SocialAbstract {
  identifier = 'test';

  override handleErrors(body: string) {
    if (body.includes('expired token')) {
      return { type: 'refresh-token' as const, value: 'expired' };
    }

    return undefined;
  }

  public safeAxios() {
    return this.getSsrfSafeAxios();
  }

  public readRemote(path: string) {
    return this.readOrFetch(path);
  }

  public fetchAnalytics(path: string, options?: RequestInit) {
    return (this as any).analyticsFetch(path, options);
  }

  public booleanSetting(value: boolean | string | undefined) {
    return this.assetBoolean(value);
  }
}

describe('SocialAbstract SSRF', () => {
  const originalFetch = global.fetch;
  const originalDisableSsrf = process.env.DISABLE_SSRF_PROTECTION;
  let provider: TestProvider;

  beforeEach(() => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    provider = new TestProvider();
    global.fetch = jest.fn().mockResolvedValue({ status: 200 }) as jest.Mock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalDisableSsrf === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
      return;
    }

    process.env.DISABLE_SSRF_PROTECTION = originalDisableSsrf;
  });

  it('injeta o dispatcher pinado em toda chamada fetch do provider', async () => {
    await provider.fetch('https://example.com/api', { method: 'POST' });

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api', {
      method: 'POST',
      dispatcher: ssrfSafeDispatcher,
    });
  });

  it('remove credenciais, query e fragmento do endpoint usado no heartbeat', () => {
    expect(
      heartbeatEndpoint(
        'https://user:password@example.com/api/posts?access_token=secret#debug'
      )
    ).toBe('https://example.com/api/posts');
    expect(heartbeatEndpoint('not a url?access_token=secret')).toBe(
      'invalid-url'
    );
  });

  it('recusa dispatcher alheio fornecido pelo provider (o guard nao pode ser trocado)', async () => {
    const dispatcher = { dispatch: jest.fn() };

    await expect(
      provider.fetch('https://example.com/api', {
        method: 'GET',
        dispatcher,
      } as RequestInit)
    ).rejects.toThrow('pinned dispatcher');

    expect(global.fetch).not.toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({ dispatcher })
    );
  });

  it('faz analytics com SSRF pinado sem retry nem BadBody', async () => {
    const response = { status: 429, text: async () => 'rate limited' };
    global.fetch = jest.fn().mockResolvedValue(response) as jest.Mock;

    await expect(
      provider.fetchAnalytics('https://example.com/analytics', {
        method: 'GET',
      })
    ).resolves.toBe(response);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/analytics', {
      method: 'GET',
      dispatcher: ssrfSafeDispatcher,
    });
  });

  it('preserva RefreshToken para o self-heal do fork sem repetir a chamada', async () => {
    const response = {
      status: 400,
      clone: () => ({ text: async () => 'expired token' }),
    };
    global.fetch = jest.fn().mockResolvedValue(response) as jest.Mock;

    await expect(
      provider.fetchAnalytics('https://example.com/analytics')
    ).rejects.toBeInstanceOf(RefreshToken);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('usa Axios pinado para downloads remotos auxiliares', () => {
    const safeAxios = provider.safeAxios();

    expect(safeAxios).not.toBe(axios);
    expect(safeAxios.defaults.httpAgent).toBeDefined();
    expect(safeAxios.defaults.httpsAgent).toBeDefined();
  });

  it('baixa midia remota pelo Axios retornado pelo provider', async () => {
    const safeAxios = jest.fn().mockResolvedValue({ data: Buffer.from('ok') });
    jest
      .spyOn(provider as any, 'getSsrfSafeAxios')
      .mockReturnValue(safeAxios as unknown as AxiosInstance);

    await expect(
      provider.readRemote('https://cdn.example/file')
    ).resolves.toEqual(Buffer.from('ok'));
    expect(safeAxios).toHaveBeenCalledWith({
      url: 'https://cdn.example/file',
      method: 'GET',
      responseType: 'arraybuffer',
      maxContentLength: MEDIA_READ_MAX_BYTES,
      signal: expect.any(AbortSignal),
    });
  });

  it('interpreta flags booleanas legadas sem tratar a string false como true', () => {
    expect(provider.booleanSetting('false')).toBe(false);
    expect(provider.booleanSetting('FALSE')).toBe(false);
    expect(provider.booleanSetting('true')).toBe(true);
    expect(provider.booleanSetting(false)).toBe(false);
    expect(provider.booleanSetting(undefined)).toBe(false);
  });
});

describe('Temporal provider failure payloads', () => {
  it('preserva mensagens pequenas sem alterar o diagnostico', () => {
    const message = 'Meta OAuthException code 190 subcode 464';

    expect(truncateForTemporal(message, 2_000)).toBe(message);
  });

  it('limita strings grandes e informa quantos caracteres foram removidos', () => {
    const value = 'x'.repeat(5_000);

    const result = truncateForTemporal(value, 2_000);

    expect(result.startsWith('x'.repeat(2_000))).toBe(true);
    expect(result.endsWith('… [truncated 3000 chars]')).toBe(true);
  });

  it('limita mensagem, resposta e corpo sem perder o codigo Meta no inicio', () => {
    const json = JSON.stringify({
      error: {
        code: 190,
        error_subcode: 464,
        message: 'Meta recusou o token',
        debug: 'j'.repeat(10_000),
      },
    });
    const failure = new BadBody(
      'instagram',
      json,
      'body='.concat('b'.repeat(10_000)),
      'm'.repeat(10_000)
    );

    expect(failure.message.length).toBeLessThan(2_100);
    expect(failure.message).toContain('[truncated 8000 chars]');
    expect(failure.details[0]).toEqual(
      expect.objectContaining({
        identifier: 'instagram',
        json: expect.stringContaining('"code":190'),
        body: expect.stringContaining('[truncated'),
      })
    );
    expect((failure.details[0] as { json: string }).json.length).toBeLessThan(
      4_100
    );
    expect((failure.details[0] as { body: string }).body.length).toBeLessThan(
      4_100
    );
  });

  it('aplica os mesmos limites ao sinal de refresh usado pelo self-heal', () => {
    const failure = new RefreshToken(
      'facebook',
      '{"error":{"code":190,"error_subcode":460},"debug":"'.concat(
        'j'.repeat(10_000),
        '"}'
      ),
      'token='.concat('s'.repeat(10_000)),
      'Sessao invalida '.concat('m'.repeat(10_000))
    );

    expect(failure.type).toBe('refresh_token');
    expect(failure.message).toContain('Sessao invalida');
    expect(failure.message.length).toBeLessThan(2_100);
    expect((failure.details[0] as { json: string }).json).toContain(
      '"error_subcode":460'
    );
    expect((failure.details[0] as { body: string }).body.length).toBeLessThan(
      4_100
    );
  });

  it('serializa detalhes circulares sem quebrar a criacao da falha', () => {
    const circular: Record<string, unknown> = { provider: 'x' };
    circular.self = circular;

    expect(truncateForTemporal(circular, 4_000)).toBe(
      '{"provider":"x","self":"[Circular]"}'
    );
  });
});

// CVE-2026-115932: o provider so pode abrir arquivo dentro de UPLOAD_DIRECTORY,
// mesmo que o caminho chegue sem passar por PostsService.updateMedia.
describe('SocialAbstract.localMediaPath / readOrFetch (confinamento no sink)', () => {
  const { mkdtempSync, writeFileSync } = jest.requireActual('fs') as typeof import('fs');
  const { tmpdir } = jest.requireActual('os') as typeof import('os');
  const { join, sep } = jest.requireActual('path') as typeof import('path');
  const ORIGINAL = process.env.UPLOAD_DIRECTORY;

  class SinkProvider extends SocialAbstract {
    identifier = 'sink-test';
    read(path: string) {
      return this.readOrFetch(path);
    }
    local(path: string) {
      return this.localMediaPath(path);
    }
  }

  let base: string;

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'robo-sink-'));
    writeFileSync(join(base, 'ok.png'), 'png');
    process.env.UPLOAD_DIRECTORY = base;
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.UPLOAD_DIRECTORY;
    else process.env.UPLOAD_DIRECTORY = ORIGINAL;
  });

  it('le arquivo dentro de UPLOAD_DIRECTORY', async () => {
    const provider = new SinkProvider() as any;
    await expect(provider.read(join(base, 'ok.png'))).resolves.toEqual(Buffer.from('png'));
  });

  it('rejeita traversal, caminho absoluto fora da base e prefixo irmao', () => {
    const provider = new SinkProvider() as any;
    for (const path of [
      join(base, '..', 'etc', 'passwd'),
      '/etc/passwd',
      `${base}-evil${sep}x.png`,
      base,
    ]) {
      expect(() => provider.local(path)).toThrow(BadBody);
    }
  });

  it('sem UPLOAD_DIRECTORY nenhum caminho local e aberto', () => {
    delete process.env.UPLOAD_DIRECTORY;
    const provider = new SinkProvider() as any;
    expect(() => provider.local(join(base, 'ok.png'))).toThrow(BadBody);
    process.env.UPLOAD_DIRECTORY = base;
  });
});

// Porte do upstream #2193: leitura de midia que trava depois dos headers nao
// pode segurar o slot da activity para sempre.
describe('SocialAbstract.readOrFetch (leitura travada)', () => {
  class StallProvider extends SocialAbstract {
    identifier = 'stall-test';
    read(path: string) {
      return this.readOrFetch(path);
    }
  }

  const mockAxios = (provider: StallProvider, safeAxios: jest.Mock) =>
    jest
      .spyOn(provider as any, 'getSsrfSafeAxios')
      .mockReturnValue(safeAxios as unknown as AxiosInstance);

  it('le de novo uma vez quando a primeira leitura estoura o prazo', async () => {
    const provider = new StallProvider();
    const safeAxios = jest
      .fn()
      .mockRejectedValueOnce(new CanceledError('canceled'))
      .mockResolvedValueOnce({ data: Buffer.from('img') });
    mockAxios(provider, safeAxios);

    await expect(provider.read('https://cdn.example/a.png')).resolves.toEqual(
      Buffer.from('img')
    );
    expect(safeAxios).toHaveBeenCalledTimes(2);
  });

  it('desiste com BadBody depois da segunda leitura travada, sem vazar a query', async () => {
    const provider = new StallProvider();
    const timeout = Object.assign(new Error('aborted'), {
      name: 'TimeoutError',
    });
    const safeAxios = jest.fn().mockRejectedValue(timeout);
    mockAxios(provider, safeAxios);

    const err = await provider
      .read('https://cdn.example/a.png?X-Amz-Signature=segredo')
      .catch((e) => e);

    expect(err).toBeInstanceOf(BadBody);
    expect(err.message).toBe(
      'Não foi possível ler a mídia deste post, por isso ele não foi publicado'
    );
    expect(err.nonRetryable).toBe(true);
    const details = JSON.parse((err.details[0] as { json: string }).json);
    expect(details).toEqual({
      timeoutMs: MEDIA_READ_TIMEOUT,
      path: 'https://cdn.example/a.png',
    });
    expect(safeAxios).toHaveBeenCalledTimes(2);
  });

  it('pede o download com teto de bytes (midia gigante nao enche a memoria)', async () => {
    const provider = new StallProvider();
    const safeAxios = jest.fn().mockResolvedValue({ data: Buffer.from('img') });
    mockAxios(provider, safeAxios);

    await provider.read('https://cdn.example/a.png');

    expect(safeAxios.mock.calls[0][0]).toMatchObject({
      maxContentLength: MEDIA_READ_MAX_BYTES,
    });
  });

  it('erro que nao e prazo estourado segue sem nova leitura', async () => {
    const provider = new StallProvider();
    const notFound = Object.assign(new Error('Request failed with status 404'), {
      code: 'ERR_BAD_REQUEST',
    });
    const safeAxios = jest.fn().mockRejectedValue(notFound);
    mockAxios(provider, safeAxios);

    await expect(provider.read('https://cdn.example/a.png')).rejects.toBe(
      notFound
    );
    expect(safeAxios).toHaveBeenCalledTimes(1);
  });

  describe('servidor que manda os headers e para no meio do corpo', () => {
    let server: Server;
    let url: string;
    let requests = 0;
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);

    beforeAll(async () => {
      server = createServer((req, res) => {
        requests++;
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': '1000',
        });
        // primeiro pedaco e depois silencio: a conexao fica aberta
        res.write(Buffer.alloc(10));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/stall.png`;
    });

    afterAll(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('aborta pelo prazo, tenta de novo e falha com BadBody', async () => {
      // prazo curto so no teste; o codigo usa MEDIA_READ_TIMEOUT
      const timeoutSpy = jest
        .spyOn(AbortSignal, 'timeout')
        .mockImplementation(() => realTimeout(50));
      const provider = new StallProvider();
      // servidor local: o axios pinado recusaria 127.0.0.1 (SSRF)
      jest
        .spyOn(provider as any, 'getSsrfSafeAxios')
        .mockReturnValue(axios as AxiosInstance);
      requests = 0;

      await expect(provider.read(url)).rejects.toBeInstanceOf(BadBody);

      expect(requests).toBe(2);
      expect(timeoutSpy).toHaveBeenCalledWith(MEDIA_READ_TIMEOUT);
    });
  });
});

// Retentativas esgotadas levam a mensagem curada do provider ao BadBody.
describe('SocialAbstract.fetch (retentativas esgotadas)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('usa a mensagem do handleErrors em vez de um BadBody vazio', async () => {
    class RetryProvider extends SocialAbstract {
      identifier = 'retry-test';
      override handleErrors(body: string) {
        if (body.includes('2207052')) {
          return { type: 'retry' as const, value: 'Media fetch failed, please try again' };
        }
        return undefined;
      }
    }
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      ok: false,
      text: async () => '{"error":{"error_subcode":2207052}}',
      clone() {
        return this;
      },
    }) as any;

    const provider = new RetryProvider();
    const exhausted = provider.fetch('https://graph.example/x', {}, 'retry-test', 3);
    await expect(exhausted).rejects.toBeInstanceOf(BadBody);
    await expect(exhausted).rejects.toMatchObject({
      message: 'Media fetch failed, please try again',
    });
  });
});

// upstream 0c9d3940: erro ja classificado pelo provider dentro do
// runInConcurrent nao vira 'Unknown Error'.
describe('SocialAbstract.runInConcurrent (erro classificado)', () => {
  const provider = new TestProvider();
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    errorLog = jest
      .spyOn((SocialAbstract as any).logger, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => errorLog.mockRestore());

  it('BadBody do provider sai com a propria mensagem', async () => {
    const original = new BadBody('test', '{}', '', 'Video too large');
    await expect(
      provider.runInConcurrent(async () => {
        throw original;
      })
    ).rejects.toBe(original);
  });

  it('RefreshToken do provider continua RefreshToken', async () => {
    const original = new RefreshToken('test', '{}', '', 'expired');
    await expect(
      provider.runInConcurrent(async () => {
        throw original;
      })
    ).rejects.toBe(original);
  });

  it('PublishedWithError (post ja no ar) chega intacto a activity', async () => {
    const original = new PublishedWithError('test', 'post-1', 'vid', 'https://x/vid', 'thumb');
    await expect(
      provider.runInConcurrent(async () => {
        throw original;
      })
    ).rejects.toBe(original);
  });

  it('erro cru passa pelo handleErrors e o log sai resumido', async () => {
    const raw = Object.assign(new Error('falhou'), {
      data: { error: 'expired token', access_token: 'segredo-que-nao-pode-vazar' },
    });

    await expect(
      provider.runInConcurrent(async () => {
        throw raw;
      })
    ).rejects.toBeInstanceOf(RefreshToken);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0][0])).not.toContain(
      'segredo-que-nao-pode-vazar'
    );
  });
});
