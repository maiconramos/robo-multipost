import { parseHttpByteRange } from './http.byte.range';

describe('parseHttpByteRange', () => {
  it('retorna o arquivo inteiro quando Range nao foi enviado', () => {
    expect(parseHttpByteRange(null, 10)).toEqual({
      partial: false,
      start: 0,
      end: 9,
      length: 10,
    });
  });

  it('interpreta intervalo fechado e intervalo aberto', () => {
    expect(parseHttpByteRange('bytes=2-5', 10)).toEqual({
      partial: true,
      start: 2,
      end: 5,
      length: 4,
    });
    expect(parseHttpByteRange('bytes=7-', 10)).toEqual({
      partial: true,
      start: 7,
      end: 9,
      length: 3,
    });
  });

  it('suporta suffix range e limita o final ao tamanho do arquivo', () => {
    expect(parseHttpByteRange('bytes=-4', 10)).toEqual({
      partial: true,
      start: 6,
      end: 9,
      length: 4,
    });
    expect(parseHttpByteRange('bytes=8-99', 10)).toEqual({
      partial: true,
      start: 8,
      end: 9,
      length: 2,
    });
  });

  it('rejeita ranges impossiveis, multiplos ou malformados', () => {
    expect(parseHttpByteRange('bytes=10-', 10)).toEqual({
      unsatisfiable: true,
    });
    expect(parseHttpByteRange('bytes=8-3', 10)).toEqual({
      unsatisfiable: true,
    });
    expect(parseHttpByteRange('bytes=0-1,4-5', 10)).toEqual({
      unsatisfiable: true,
    });
    expect(parseHttpByteRange('items=0-1', 10)).toEqual({
      unsatisfiable: true,
    });
  });
});
