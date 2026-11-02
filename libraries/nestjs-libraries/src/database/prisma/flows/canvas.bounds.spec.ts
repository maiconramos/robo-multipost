import { assertCanvasBounds, CANVAS_MAX_PATHS } from './canvas.bounds';

const node = (id: string, type: string, data: object = {}) => ({
  id,
  type,
  data: JSON.stringify(data),
});

describe('assertCanvasBounds', () => {
  it('aceita o fluxo comum (gatilho -> esperar -> responder -> DM)', () => {
    expect(() =>
      assertCanvasBounds({
        nodes: [
          node('t', 'TRIGGER'),
          node('d', 'DELAY', { duration: 2, unit: 'hours' }),
          node('r', 'REPLY_COMMENT'),
          node('m', 'SEND_DM'),
        ],
        edges: [
          { sourceNodeId: 't', targetNodeId: 'd' },
          { sourceNodeId: 'd', targetNodeId: 'r' },
          { sourceNodeId: 'r', targetNodeId: 'm' },
        ],
      })
    ).not.toThrow();
  });

  it('aceita condicao com dois ramos', () => {
    expect(() =>
      assertCanvasBounds({
        nodes: [node('t', 'TRIGGER'), node('c', 'CONDITION'), node('a', 'SEND_DM'), node('b', 'REPLY_COMMENT')],
        edges: [
          { sourceNodeId: 't', targetNodeId: 'c' },
          { sourceNodeId: 'c', targetNodeId: 'a' },
          { sourceNodeId: 'c', targetNodeId: 'b' },
        ],
      })
    ).not.toThrow();
  });

  it('recusa mais de 100 nos', () => {
    const nodes = Array.from({ length: 101 }, (_, i) => node(`n${i}`, 'REPLY_COMMENT'));
    expect(() => assertCanvasBounds({ nodes, edges: [] })).toThrow('INVALID_GRAPH');
  });

  it('recusa DELAY maior que 30 dias', () => {
    expect(() =>
      assertCanvasBounds({
        nodes: [node('t', 'TRIGGER'), node('d', 'DELAY', { duration: 999999, unit: 'hours' })],
        edges: [{ sourceNodeId: 't', targetNodeId: 'd' }],
      })
    ).toThrow('DELAY_TOO_LONG');
  });

  it('recusa diamantes encadeados (caminhos explodem)', () => {
    const nodes = [node('t', 'TRIGGER')];
    const edges: Array<{ sourceNodeId: string; targetNodeId: string }> = [];
    let prev = 't';
    for (let i = 0; i < 10; i++) {
      nodes.push(node(`a${i}`, 'CONDITION'), node(`b${i}`, 'CONDITION'), node(`j${i}`, 'REPLY_COMMENT'));
      edges.push(
        { sourceNodeId: prev, targetNodeId: `a${i}` },
        { sourceNodeId: prev, targetNodeId: `b${i}` },
        { sourceNodeId: `a${i}`, targetNodeId: `j${i}` },
        { sourceNodeId: `b${i}`, targetNodeId: `j${i}` }
      );
      prev = `j${i}`;
    }
    expect(2 ** 10).toBeGreaterThan(CANVAS_MAX_PATHS);
    expect(() => assertCanvasBounds({ nodes, edges })).toThrow('GRAPH_TOO_COMPLEX');
  });

  it('recusa ciclo', () => {
    expect(() =>
      assertCanvasBounds({
        nodes: [node('t', 'TRIGGER'), node('a', 'REPLY_COMMENT'), node('b', 'SEND_DM')],
        edges: [
          { sourceNodeId: 't', targetNodeId: 'a' },
          { sourceNodeId: 'a', targetNodeId: 'b' },
          { sourceNodeId: 'b', targetNodeId: 'a' },
        ],
      })
    ).toThrow('INVALID_GRAPH');
  });
});
