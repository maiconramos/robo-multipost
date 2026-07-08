/**
 * Contrato do endpoint GET /status/problems — fonte unica de tipo (backend +
 * frontend). Sao read-models (nao ha validacao de entrada), por isso interfaces
 * puras, sem class-validator. Severidade e classificada no backend
 * (StatusService); o frontend so agrupa/renderiza.
 *
 * Sanitizacao: `reason` (canal) vem de `Integration.refreshError` e `error`
 * (automacao) de `FlowExecution.error` — ambos ja sao SANITIZADOS na origem
 * (name+message; nunca o token). Posts NAO expoem um campo de erro: `Post.error`
 * e uma serializacao COMPLETA da excecao de publicacao e poderia conter o corpo
 * da requisicao com refresh_token/client_secret — a Fase 1 mostra apenas a
 * contagem por canal, entao o campo nem trafega pela API.
 *
 * `profile: null` = canal/post compartilhado ou legado (perfil nulo) — o
 * frontend rotula "Workspace".
 */

export type StatusSeverity = 'critical' | 'warning';

export interface StatusProfileRef {
  id: string;
  name: string;
}

export interface StatusChannelRef {
  id: string;
  identifier: string;
  name: string;
  picture: string | null;
}

export interface StatusChannelProblem {
  type: 'channel';
  severity: StatusSeverity;
  id: string;
  identifier: string; // providerIdentifier — alimenta o botao Reconectar
  internalId: string; // alimenta o botao Reconectar (?refresh=)
  name: string;
  picture: string | null;
  refreshNeeded: boolean;
  disabled: boolean;
  reason: string | null; // Integration.refreshError (ja sanitizado)
  reasonAt: string | null; // Integration.refreshErrorAt (ISO)
  profile: StatusProfileRef | null;
}

export interface StatusPostProblem {
  type: 'post';
  severity: 'critical';
  id: string;
  updatedAt: string; // ISO
  channel: StatusChannelRef | null; // null se a integracao foi removida
  profile: StatusProfileRef | null;
}

export interface StatusAutomationProblem {
  type: 'automation';
  severity: 'warning';
  id: string;
  flowId: string;
  flowName: string;
  error: string | null;
  profile: StatusProfileRef | null;
}

export interface StatusProblemsSummary {
  critical: number;
  warning: number;
  total: number;
  truncated: boolean; // posts/automations bateram no limite
}

export interface StatusProblemsResponse {
  channels: StatusChannelProblem[];
  posts: StatusPostProblem[];
  automations: StatusAutomationProblem[];
  summary: StatusProblemsSummary;
}

/**
 * Contrato do endpoint GET /status/history (Fase 2) — aba "Histórico".
 *
 * Read-model do log append-only `StatusEvent`: eventos de falha de DOMINIO que
 * SOBREVIVEM à resolução (diferente da aba Problemas, que é estado derivado e
 * some quando resolve). Cada item carrega o snapshot do canal (name/picture/
 * identifier — o `identifier` alimenta o badge de plataforma) e o perfil de
 * origem, resolvido em leitura.
 *
 * `message` já vem SANITIZADO da origem (name+message, cap 500) — NUNCA o token
 * nem o corpo cru da exceção (mesma disciplina da Fase 1). `entityId` é o alvo
 * do link de depuração: postId (POST_FAILED → /p/:id + Temporal) ou flowId
 * (AUTOMATION_FAILED → /automacoes/:id); null para CHANNEL_DISCONNECT.
 */
export type StatusEventType =
  | 'CHANNEL_DISCONNECT'
  | 'POST_FAILED'
  | 'AUTOMATION_FAILED';

export interface StatusHistoryChannel {
  name: string | null;
  picture: string | null;
  identifier: string | null; // providerIdentifier — alimenta o badge
}

export interface StatusHistoryItem {
  id: string;
  type: StatusEventType;
  severity: StatusSeverity;
  message: string | null;
  createdAt: string; // ISO
  channel: StatusHistoryChannel | null;
  profile: StatusProfileRef | null;
  entityId: string | null; // postId (POST_FAILED) / flowId (AUTOMATION_FAILED) — link de depuração
}

export interface StatusHistoryResponse {
  items: StatusHistoryItem[];
  nextCursor: string | null; // id do último item; passar em ?cursor= para a próxima página
  hasMore: boolean;
}
