import { sanitizeWithDataAttrAllowlist } from '@gitroom/helpers/utils/dompurify.data.attrs';
import {
  MediaPrefix,
  rewriteInlineImages,
} from '@gitroom/helpers/utils/inline.images';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'span',
  'img',
];

// so a mencao; qualquer outro data-* (ex.: data-tooltip-html) cai
const POST_DATA_ATTRS = new Set(['data-mention-id', 'data-mention-label']);

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'data-mention-id',
  'data-mention-label',
  'src',
  'alt',
];

// Imagem inline (upstream 2aae02fe). O upstream registra um hook global no
// DOMPurify que so derruba <img> sem http(s); o hook global tambem valeria
// para sanitizeChatContent (mesma instancia). Aqui o DOMPurify tira os
// atributos perigosos e rewriteInlineImages deixa so a midia da instancia
// (FRONTEND_URL/uploads ou bucket R2) com src e alt — data:, javascript:,
// outro host e caminho relativo caem. No navegador, sem `mediaPrefixes`, toda
// imagem cai (o ambiente do servidor nao existe ali).
export const sanitizePostContent = (
  value: unknown,
  mediaPrefixes?: MediaPrefix[]
): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  // a block tag the editor doesn't know would be dropped with its text kept,
  // gluing its line to the next one
  const paragraphs = value.replace(
    /<(\/?)(div|section|article|blockquote|pre|h[4-6])\b[^<>]*>/gi,
    '<$1p>'
  );

  return rewriteInlineImages(
    sanitizeWithDataAttrAllowlist(paragraphs, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
    }, POST_DATA_ATTRS),
    { prefixes: mediaPrefixes }
  );
};
