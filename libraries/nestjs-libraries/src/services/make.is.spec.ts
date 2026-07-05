import { makeId } from './make.is';

const ALPHABET_REGEX = /^[A-Za-z0-9]+$/;

describe('makeId', () => {
  it('retorna string do tamanho solicitado', () => {
    expect(makeId(40)).toHaveLength(40);
    expect(makeId(1)).toHaveLength(1);
  });

  it('usa apenas caracteres do alfabeto base62', () => {
    expect(makeId(200)).toMatch(ALPHABET_REGEX);
  });

  it('gera valores distintos em chamadas consecutivas', () => {
    const a = makeId(32);
    const b = makeId(32);
    expect(a).not.toEqual(b);
  });
});
