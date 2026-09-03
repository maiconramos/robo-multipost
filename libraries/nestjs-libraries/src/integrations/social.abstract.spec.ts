import axios, { AxiosInstance } from 'axios';
import { RefreshToken, SocialAbstract } from './social.abstract';
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

  it('preserva dispatcher especifico fornecido pelo provider', async () => {
    const dispatcher = { dispatch: jest.fn() };

    await provider.fetch('https://example.com/api', {
      method: 'GET',
      dispatcher,
    } as RequestInit);

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api', {
      method: 'GET',
      dispatcher,
    });
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
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/analytics',
      {
        method: 'GET',
        dispatcher: ssrfSafeDispatcher,
      }
    );
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
