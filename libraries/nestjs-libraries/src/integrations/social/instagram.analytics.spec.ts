import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { InstagramProvider } from './instagram.provider';
import { RefreshToken } from '../social.abstract';

const NOW = Date.parse('2026-11-05T20:19:22.000Z');
const payload = (data: unknown) => new Response(JSON.stringify({ data }));
const daily = [
  { name: 'reach', values: [{ value: 13, end_time: '2026-11-05T00:00:00Z' }] },
];
const totals = [{ name: 'views', total_value: { value: 0 } }];

describe('Instagram analytics: intervalo e falhas da Meta', () => {
  let provider: InstagramProvider;
  let read: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    provider = new InstagramProvider();
    read = jest.spyOn(provider as any, 'analyticsFetch');
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([
    [7, 'graph.facebook.com'],
    [30, 'graph.facebook.com'],
    [7, 'graph.instagram.com'],
    [30, 'graph.instagram.com'],
  ])(
    'consulta %s dias em %s sem exceder a janela nem pedir horas futuras',
    async (days: number, host: string) => {
      read.mockImplementation(async (request: string) => {
        const url = new URL(request);
        const since = Number(url.searchParams.get('since'));
        const until = Number(url.searchParams.get('until'));
        // Simula a recusa da Meta quando a consulta ultrapassa trinta dias.
        if (until - since > 30 * 86400)
          return new Response(JSON.stringify({ error: { code: 100 } }), {
            status: 400,
          });
        return payload(url.searchParams.get('metric_type') ? totals : daily);
      });
      const result = await provider.analytics(
        'ig-test',
        'SECRET',
        days,
        undefined,
        host
      );
      expect(result).toEqual([
        { label: 'Reach', data: [{ total: 13, date: expect.any(String) }] },
        { label: 'Views', data: [{ total: 0, date: expect.any(String) }] },
      ]);
      expect(read).toHaveBeenCalledTimes(2);
      const ranges = read.mock.calls.map(([request]) => {
        const url = new URL(request);
        expect(url.hostname).toBe(host);
        const until = Number(url.searchParams.get('until'));
        const since = Number(url.searchParams.get('since'));
        expect(until).toBeLessThanOrEqual(NOW / 1000);
        expect(until - since).toBe(days * 86400);
        return { since, until };
      });
      expect(ranges[0]).toEqual(ranges[1]);
      expect(warn).not.toHaveBeenCalled();
    }
  );

  it.each(['daily', 'totals'])(
    'recusa erro do grupo %s com diagnostico seguro e sem TypeError',
    async (phase) => {
      const failed = () =>
        new Response(
          JSON.stringify({
            error: {
              code: 100,
              error_subcode: 33,
              message: 'SECRET https://private.example/?access_token=SECRET',
            },
          }),
          { status: 400 }
        );
      if (phase === 'totals') read.mockResolvedValueOnce(payload(daily));
      read.mockResolvedValueOnce(failed());
      await expect(provider.analytics('ig-test', 'SECRET', 30)).rejects.toThrow(
        'INSTAGRAM_ANALYTICS_UNAVAILABLE'
      );
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'instagram-analytics-unavailable',
          phase,
          days: 30,
          status: 400,
          code: 100,
          subcode: 33,
        })
      );
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(
        /SECRET|private\.example|access_token/
      );
    }
  );

  it.each([
    new Response('<html>SECRET</html>', { status: 502 }),
    new Response(JSON.stringify({ data: null })),
    new Response(JSON.stringify({ data: {}, secret: 'SECRET' })),
    new Response(JSON.stringify({ data: [], error: { code: 4 } })),
    new Response(JSON.stringify({ data: [] }), { status: 429 }),
  ])(
    'recusa resposta indisponivel sem fabricar zeros ou sucesso vazio',
    async (response) => {
      read.mockResolvedValueOnce(response);
      await expect(provider.analytics('ig-test', 'SECRET', 30)).rejects.toThrow(
        'INSTAGRAM_ANALYTICS_UNAVAILABLE'
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
    }
  );

  it('aceita arrays vazios legitimos sem aviso', async () => {
    read.mockImplementation(async () => payload([]));
    await expect(provider.analytics('ig-test', 'SECRET', 7)).resolves.toEqual(
      []
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('propaga RefreshToken para a recuperacao existente sem repetir a chamada', async () => {
    const failure = new RefreshToken('instagram', '{}', '{}', 'expired');
    read.mockRejectedValueOnce(failure);
    await expect(provider.analytics('ig-test', 'SECRET', 30)).rejects.toBe(
      failure
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
