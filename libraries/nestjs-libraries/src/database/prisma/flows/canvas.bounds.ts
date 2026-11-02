import { BadRequestException } from '@nestjs/common';

/**
 * Limites do canvas das automacoes antigas (V1), aplicados tambem no painel
 * (a API publica/MCP ja passa por validateLegacyCanvas). O executor percorre
 * TODAS as arestas a partir do TRIGGER: "diamantes" encadeados multiplicam os
 * caminhos (2^n respostas/DMs), um ciclo estoura a profundidade e um DELAY
 * gigante deixa a execucao dormindo indefinidamente.
 */
export const CANVAS_MAX_NODES = 100;
export const CANVAS_MAX_EDGES = 200;
export const CANVAS_MAX_BYTES = 131072;
export const CANVAS_MAX_PATHS = 50;
export const CANVAS_MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

const UNIT_MS: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
};

interface CanvasLike {
  nodes: Array<{ id?: string; type: string; data?: string }>;
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>;
}

export function assertCanvasBounds(body: CanvasLike) {
  const nodes = Array.isArray(body?.nodes) ? body.nodes : [];
  const edges = Array.isArray(body?.edges) ? body.edges : [];
  if (
    nodes.length > CANVAS_MAX_NODES ||
    edges.length > CANVAS_MAX_EDGES ||
    JSON.stringify(body).length > CANVAS_MAX_BYTES
  ) {
    throw new BadRequestException('INVALID_GRAPH');
  }

  for (const node of nodes) {
    if (node.type !== 'DELAY') continue;
    let cfg: { duration?: unknown; unit?: unknown } = {};
    try {
      cfg = JSON.parse(node.data || '{}');
    } catch {
      cfg = {};
    }
    const duration = Number(cfg.duration ?? 0);
    const unitMs = UNIT_MS[String(cfg.unit || 'seconds')] ?? 1000;
    if (!Number.isFinite(duration) || duration < 0 || duration * unitMs > CANVAS_MAX_DELAY_MS) {
      throw new BadRequestException('DELAY_TOO_LONG');
    }
  }

  // caminhos a partir do TRIGGER (o executor segue cada aresta): grafo sem
  // ciclo e com poucos caminhos
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.sourceNodeId) || [];
    list.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, list);
  }
  const paths = new Map<string, number>();
  const visiting = new Set<string>();
  const countPaths = (id: string): number => {
    if (paths.has(id)) return paths.get(id)!;
    if (visiting.has(id)) throw new BadRequestException('INVALID_GRAPH');
    visiting.add(id);
    const next = outgoing.get(id) || [];
    let total = next.length ? 0 : 1;
    for (const target of next) {
      total += countPaths(target);
      if (total > CANVAS_MAX_PATHS) {
        throw new BadRequestException('GRAPH_TOO_COMPLEX');
      }
    }
    visiting.delete(id);
    paths.set(id, total);
    return total;
  };
  for (const trigger of nodes.filter((n) => n.type === 'TRIGGER')) {
    if (trigger.id) countPaths(trigger.id);
  }
}
