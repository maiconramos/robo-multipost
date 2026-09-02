import axios from 'axios';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import {
  getSsrfSafeAxios,
  getSsrfSafeDispatcher,
  ssrfSafeDispatcher,
  ssrfSafeLookup,
} from './ssrf.safe.dispatcher';
import { isSafePublicHttpsUrl } from './webhook.url.validator';

jest.mock('node:dns', () => ({
  __esModule: true,
  default: {
    lookup: jest.fn(),
  },
}));

jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: {
    lookup: jest.fn(),
  },
}));

type LookupResult = {
  address: string | Array<{ address: string; family: number }>;
  family?: number;
};

const runLookup = (hostname: string, options: Record<string, unknown> = {}) =>
  new Promise<LookupResult>((resolve, reject) => {
    ssrfSafeLookup(hostname, options, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ address, family });
    });
  });

describe('ssrf.safe.dispatcher', () => {
  const originalDisableSsrf = process.env.DISABLE_SSRF_PROTECTION;
  const dnsLookup = dns.lookup as unknown as jest.Mock;
  const dnsPromisesLookup = dnsPromises.lookup as jest.Mock;

  beforeEach(() => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    dnsLookup.mockReset();
    dnsPromisesLookup.mockReset();
  });

  afterAll(() => {
    if (originalDisableSsrf === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
      return;
    }

    process.env.DISABLE_SSRF_PROTECTION = originalDisableSsrf;
  });

  it('bloqueia IPv4 privado informado literalmente', async () => {
    await expect(runLookup('169.254.169.254')).rejects.toThrow('Blocked IP');
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('bloqueia faixas IPv4 especiais que nao sao destinos publicos', async () => {
    await expect(runLookup('192.0.2.1')).rejects.toThrow('Blocked IP');
    await expect(runLookup('198.51.100.1')).rejects.toThrow('Blocked IP');
    await expect(runLookup('203.0.113.1')).rejects.toThrow('Blocked IP');
  });

  it('bloqueia IPv6 privado informado literalmente', async () => {
    await expect(runLookup('fd00::1')).rejects.toThrow('Blocked IP');
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('bloqueia toda a faixa IPv6 link-local fe80::/10', async () => {
    await expect(runLookup('fe90::1')).rejects.toThrow('Blocked IP');
    await expect(runLookup('febf::1')).rejects.toThrow('Blocked IP');
  });

  it('bloqueia IPv4 privado mapeado em IPv6 hexadecimal', async () => {
    await expect(runLookup('::ffff:7f00:1')).rejects.toThrow('Blocked IP');
  });

  it('bloqueia prefixos IPv6 que podem traduzir ou encapsular IPv4', async () => {
    await expect(runLookup('64:ff9b::a00:1')).rejects.toThrow('Blocked IP');
    await expect(runLookup('2001:0:a00:1::1')).rejects.toThrow('Blocked IP');
  });

  it('aceita IP publico informado literalmente', async () => {
    await expect(runLookup('1.1.1.1')).resolves.toEqual({
      address: '1.1.1.1',
      family: 4,
    });
  });

  it('aceita IPv6 publico informado literalmente', async () => {
    await expect(runLookup('2606:4700:4700::1111')).resolves.toEqual({
      address: '2606:4700:4700::1111',
      family: 6,
    });
  });

  it('bloqueia resposta DNS mista quando qualquer endereco e privado', async () => {
    dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback: (...args: unknown[]) => void) =>
        callback(
          null,
          [
            { address: '1.1.1.1', family: 4 },
            { address: '10.0.0.8', family: 4 },
          ],
          0
        )
    );

    await expect(runLookup('mixed.example', { all: true })).rejects.toThrow(
      'Blocked IP'
    );
  });

  it('bloqueia DNS rebinding no lookup da conexao depois da validacao inicial', async () => {
    dnsPromisesLookup.mockResolvedValueOnce([
      { address: '1.1.1.1', family: 4 },
    ]);
    dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback: (...args: unknown[]) => void) =>
        callback(null, '127.0.0.1', 4)
    );

    await expect(
      isSafePublicHttpsUrl('https://rebinding.example/media.jpg')
    ).resolves.toBe(true);
    await expect(runLookup('rebinding.example')).rejects.toThrow('Blocked IP');
  });

  it('revalida o DNS do destino de redirect e bloqueia IP privado', async () => {
    dnsLookup
      .mockImplementationOnce(
        (_hostname, _options, callback: (...args: unknown[]) => void) =>
          callback(null, '1.1.1.1', 4)
      )
      .mockImplementationOnce(
        (_hostname, _options, callback: (...args: unknown[]) => void) =>
          callback(null, '10.0.0.9', 4)
      );

    await expect(runLookup('public.example')).resolves.toEqual({
      address: '1.1.1.1',
      family: 4,
    });
    await expect(runLookup('redirect-target.example')).rejects.toThrow(
      'Blocked IP'
    );
  });

  it('usa o mesmo lookup pinado nos clientes Undici e Axios', () => {
    const safeAxios = getSsrfSafeAxios();

    expect(getSsrfSafeDispatcher()).toBe(ssrfSafeDispatcher);
    expect(safeAxios).not.toBe(axios);
    expect(safeAxios.defaults.proxy).toBe(false);
    expect(safeAxios.defaults.httpAgent.options.lookup).toBe(ssrfSafeLookup);
    expect(safeAxios.defaults.httpsAgent.options.lookup).toBe(ssrfSafeLookup);
  });

  it('libera o opt-out self-hosted somente quando configurado explicitamente', () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';

    expect(getSsrfSafeDispatcher()).toBeUndefined();
    expect(getSsrfSafeAxios()).toBe(axios);
  });
});
