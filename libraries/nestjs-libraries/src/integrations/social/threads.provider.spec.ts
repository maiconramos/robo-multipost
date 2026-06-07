import 'reflect-metadata';
import { ThreadsProvider } from './threads.provider';

describe('ThreadsProvider.handleErrors', () => {
  let provider: ThreadsProvider;

  beforeEach(() => {
    provider = new ThreadsProvider();
  });

  it('deve mapear midia inacessivel para bad-body', () => {
    const result = provider.handleErrors(
      'The media could not be fetched from this URI'
    );

    expect(result?.type).toBe('bad-body');
    expect(result?.value).toContain('uploaded to Postiz first');
  });

  it('deve mapear token invalido para refresh-token', () => {
    const result = provider.handleErrors('Error validating access token');

    expect(result).toEqual({
      type: 'refresh-token',
      value: 'Threads access token expired',
    });
  });

  it('deve mapear limite de 500 caracteres para bad-body', () => {
    const result = provider.handleErrors('text must be at most 500 characters');

    expect(result?.type).toBe('bad-body');
  });
});
