import {
  isPlaceholderJwtSecret,
  isShortJwtSecret,
} from './jwt-secret.strength';

describe('jwt-secret.strength', () => {
  it('reconhece o valor de exemplo do docker-compose', () => {
    expect(
      isPlaceholderJwtSecret(
        'random string that is unique to every install - just type random characters here!'
      )
    ).toBe(true);
  });

  it('reconhece o valor de exemplo do .env.example (com espacos nas pontas)', () => {
    expect(isPlaceholderJwtSecret('  random string for your JWT secret, make it long ')).toBe(true);
  });

  it('chave aleatoria nao e placeholder', () => {
    expect(isPlaceholderJwtSecret('a3f9c1e07b5d4e2a9c8f6b1d0e7a4c3b')).toBe(false);
    expect(isPlaceholderJwtSecret(undefined)).toBe(false);
  });

  it('chave com menos de 32 caracteres e curta', () => {
    expect(isShortJwtSecret('curta')).toBe(true);
    expect(isShortJwtSecret('a3f9c1e07b5d4e2a9c8f6b1d0e7a4c3b')).toBe(false);
  });
});
