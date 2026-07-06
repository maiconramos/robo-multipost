import {
  CATALOG,
  EmailLang,
} from '@gitroom/nestjs-libraries/emails/i18n/catalog';

/**
 * i18n de e-mail — funcao PURA (sem crypto/Date/Math.random/IO).
 *
 * NUNCA importar este modulo dentro de codigo de workflow do Temporal: a
 * renderizacao acontece em services/activities (contexto Node), e o payload que
 * viaja pelos workflows carrega apenas chave + params. Assim o bundle de
 * workflow continua determinístico ("crypto-free" — ver make.is.ts).
 */

const SUPPORTED: readonly EmailLang[] = ['pt', 'en'];
const DEFAULT_LANG: EmailLang = 'pt';

export type EmailParams = Record<string, string | number | undefined | null>;

export function normalizeLang(raw?: string | null): EmailLang {
  if (!raw) {
    return DEFAULT_LANG;
  }
  // Aceita `pt`, `pt-BR`, `pt_BR` e headers Accept-Language com q-values
  // (`en;q=0.9,fr;q=0.8`): pega a primeira tag e reduz ao codigo base.
  const base = raw
    .toLowerCase()
    .split(',')[0]
    .split(';')[0]
    .trim()
    .split(/[-_]/)[0];
  return (SUPPORTED as readonly string[]).includes(base)
    ? (base as EmailLang)
    : DEFAULT_LANG;
}

export function resolveOrgLang(
  org?: { language?: string | null } | null
): EmailLang {
  return normalizeLang(org?.language);
}

// Escapa entidades HTML no VALOR interpolado (nunca no template — os templates
// do catalogo sao confiaveis e contem HTML proposital como <a>/<br>). Espelha o
// comportamento padrao do i18next no frontend (escapeValue: true), fechando XSS
// via params vindos de texto livre do usuario (ex.: integration.name, error).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolate(template: string, params?: EmailParams): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined || value === null
      ? ''
      : escapeHtml(String(value));
  });
}

/**
 * Traduz uma chave de e-mail no idioma informado, interpolando {{params}}.
 * Fallback: idioma pedido -> pt -> a propria chave (nunca lanca).
 */
export function emailT(
  key: string,
  lang?: string | null,
  params?: EmailParams
): string {
  const normalized = normalizeLang(lang);
  const template =
    CATALOG[normalized]?.[key] ?? CATALOG[DEFAULT_LANG]?.[key] ?? key;
  return interpolate(template, params);
}

/**
 * Um item de notificacao que viaja por chave+params (sem string pre-renderizada).
 */
export type NotificationEmailItem = {
  subjectKey?: string;
  messageKey: string;
  params?: EmailParams;
  type: 'success' | 'fail' | 'info';
};

/**
 * Renderiza um lote de notificacoes (digest) no idioma da org. Mantido aqui
 * para a activity de e-mail permanecer um wrapper fino (convencao do
 * orchestrator: activity nao contem logica).
 */
export function renderDigestEmail(
  items: NotificationEmailItem[],
  lang?: string | null
): { subject: string; html: string } {
  const normalized = normalizeLang(lang);
  const subject =
    items.length === 1 && items[0].subjectKey
      ? emailT(items[0].subjectKey, normalized, items[0].params)
      : emailT('email_digest_subject', normalized);
  const html = items
    .map((item) => emailT(item.messageKey, normalized, item.params))
    .join('<br/>');
  return { subject, html };
}
