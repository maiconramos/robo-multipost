import { makeSecureId } from './make.secure.id';

const ALPHABET_REGEX = /^[A-Za-z0-9]+$/;

describe('makeSecureId', () => {
  it('retorna string do tamanho solicitado', () => {
    expect(makeSecureId(40)).toHaveLength(40);
    expect(makeSecureId(1)).toHaveLength(1);
  });

  it('retorna string vazia para tamanho zero ou negativo', () => {
    expect(makeSecureId(0)).toBe('');
    expect(makeSecureId(-5)).toBe('');
  });

  it('usa apenas caracteres do alfabeto base62', () => {
    expect(makeSecureId(200)).toMatch(ALPHABET_REGEX);
  });

  it('gera valores distintos em chamadas consecutivas', () => {
    const a = makeSecureId(32);
    const b = makeSecureId(32);
    expect(a).not.toEqual(b);
  });
});
