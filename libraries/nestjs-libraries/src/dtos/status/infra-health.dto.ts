/**
 * Contrato do endpoint GET /status/health (Fase 3) — aba "Saúde da infra".
 *
 * Read-model das sondas ativas de infraestrutura (admin-only). Cada componente
 * é sondado de verdade (não só presença de config), com timeout. As mensagens
 * são sanitizadas (name+message) — NUNCA expõem credencial. Health é global
 * (infra compartilhada do self-host), atrás do mesmo guard admin do /problems.
 */

export type InfraHealthStatus = 'ok' | 'warning' | 'error';

export type InfraHealthKey =
  | 'database'
  | 'redis'
  | 'temporal'
  | 'storage'
  | 'email';

export interface InfraHealthComponent {
  key: InfraHealthKey;
  status: InfraHealthStatus;
  message: string | null; // detalhe sanitizado (ex.: "R2", "conexão recusada")
  latencyMs: number | null; // duração da sonda; null quando não sondado
  note: string | null; // observação (tooltip) — ex.: sonda só de presença, sem validar
}

export interface InfraHealthResponse {
  // `false` quando STATUS_INFRA_HEALTH_ENABLED=false — a aba não sonda nada e o
  // endpoint não expõe estado de infra. Default (env ausente) = habilitado.
  enabled: boolean;
  components: InfraHealthComponent[];
  checkedAt: string; // ISO — quando as sondas rodaram (pode vir do cache de 30s)
  summary: {
    ok: number;
    warning: number;
    error: number;
  };
}
