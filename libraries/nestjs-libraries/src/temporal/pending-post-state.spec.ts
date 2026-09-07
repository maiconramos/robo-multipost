import { assertSafePendingData } from './pending-post-state';

describe('assertSafePendingData', () => {
  it('aceita estado pequeno e serializavel do provider', () => {
    const state = {
      containerId: 'container-1',
      stage: 'processing',
      parts: [{ index: 0, completed: true }],
    };

    expect(assertSafePendingData(state)).toEqual(state);
  });

  it.each([
    { accessToken: 'secret' },
    { nested: { client_secret: 'secret' } },
    { headers: { Authorization: 'Bearer secret' } },
    { refresh_token: 'secret' },
  ])('rejeita credenciais no estado pendente', (state) => {
    expect(() => assertSafePendingData(state)).toThrow(
      'Pending post state contains a forbidden credential field'
    );
  });

  it('rejeita estado circular ou nao serializavel sem imprimir o conteudo', () => {
    const state: Record<string, unknown> = {};
    state.self = state;

    expect(() => assertSafePendingData(state)).toThrow(
      'Pending post state must be JSON serializable'
    );
  });

  it('limita o estado serializado a 64 KiB', () => {
    expect(() =>
      assertSafePendingData({ providerState: 'x'.repeat(65 * 1024) })
    ).toThrow('Pending post state exceeds 65536 bytes');
  });

  it('valida tambem a forma produzida por toJSON', () => {
    expect(() =>
      assertSafePendingData({
        toJSON: () => ({ accessToken: 'must-not-reach-temporal' }),
      })
    ).toThrow('Pending post state contains a forbidden credential field');
  });
});
