import { ZernioAutomationClient } from './zernio-automation.client';
import * as transport from '../../dtos/webhooks/ssrf.safe.dispatcher';
jest.mock('../../dtos/webhooks/ssrf.safe.dispatcher', () => ({
  ssrfSafeFetch: jest.fn(),
}));
const http = transport.ssrfSafeFetch as jest.Mock;
describe('cliente Zernio automacoes', () => {
  beforeEach(() => http.mockReset());
  it('envia uma unica mutacao com host fixo e sem redirecionar credenciais', async () => {
    http.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, automation: { id: 'remote' } }),
        { status: 200 }
      )
    );
    await new ZernioAutomationClient().request(
      'key',
      '/comment-automations',
      'POST',
      { isActive: false }
    );
    expect(http).toHaveBeenCalledTimes(1);
    expect(http).toHaveBeenCalledWith(
      'https://zernio.com/api/v1/comment-automations',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({ Authorization: 'Bearer key' }),
      })
    );
  });
  it('nao repete POST incerto nem retorna corpo remoto', async () => {
    http.mockRejectedValue(new Error('secret provider payload'));
    await expect(
      new ZernioAutomationClient().request(
        'key',
        '/comment-automations',
        'POST',
        {}
      )
    ).rejects.toMatchObject({
      uncertain: true,
      message: 'ZERNIO_OUTCOME_UNKNOWN',
    });
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('recusa erro de permissao com orientacao estatica', async () => {
    http.mockResolvedValue(
      new Response('secret provider payload', { status: 403 })
    );
    await expect(
      new ZernioAutomationClient().request('key', '/accounts')
    ).rejects.toMatchObject({
      uncertain: false,
      message: 'ZERNIO_AUTHORIZATION_REQUIRED',
    });
  });
  it('nao aceita endpoint controlado pelo usuario', async () => {
    await expect(
      new ZernioAutomationClient().request('key', 'https://evil.example/')
    ).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });
});

it.each(['not JSON', 'x'.repeat(1024 * 1024 + 1)])(
  'limita resposta e trata mutacao malformada como incerta',
  async (body) => {
    http.mockReset();
    http.mockResolvedValue(new Response(body));
    await expect(
      new ZernioAutomationClient().request(
        'key',
        '/comment-automations',
        'POST',
        {}
      )
    ).rejects.toMatchObject({
      uncertain: true,
      message: 'ZERNIO_OUTCOME_UNKNOWN',
    });
    expect(http).toHaveBeenCalledTimes(1);
  }
);
