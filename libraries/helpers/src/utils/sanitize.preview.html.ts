import DOMPurify from 'isomorphic-dompurify';

// As pre-visualizacoes do composer montam HTML a partir do texto do post
// depois do stripHtmlValidation('normal', ..., true), que tira as tags e
// DECODIFICA &lt;/&gt; de volta. Um texto "<img src=x onerror=...>" salvo por
// outro membro (ou pela API/MCP/RSS) virava HTML vivo ao abrir o post. Todo
// __html de preview passa por aqui: fica so marcacao de formatacao.
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'span',
  'mark',
  'div',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'style',
  'data-tooltip-id',
  'data-tooltip-content',
];

export const sanitizePreviewHtml = (html: unknown): string => {
  if (typeof html !== 'string' || !html) {
    return '';
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });
};
