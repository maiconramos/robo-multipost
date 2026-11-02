import DOMPurify from 'isomorphic-dompurify';

type SanitizeConfig = Parameters<typeof DOMPurify.sanitize>[1];

/**
 * Sanitiza permitindo SO os atributos `data-*` listados. O DOMPurify aceita
 * qualquer `data-*` por padrao, e o ToolTip global (react-tooltip) renderiza
 * `data-tooltip-html` como HTML ao passar o mouse (XSS). `ALLOW_DATA_ATTR:
 * false` nao serve: com um ALLOWED_URI_REGEXP proprio, os `data-*` listados
 * passam a ser validados como URL e somem (ex.: data-mention-id).
 */
export function sanitizeWithDataAttrAllowlist(
  html: string,
  config: SanitizeConfig,
  allowedDataAttrs: ReadonlySet<string>
): string {
  const hook = (_node: Element, data: { attrName: string; keepAttr: boolean }) => {
    const name = data.attrName.toLowerCase();
    if (name.startsWith('data-') && !allowedDataAttrs.has(name)) {
      data.keepAttr = false;
    }
  };
  DOMPurify.addHook('uponSanitizeAttribute', hook as never);
  try {
    return DOMPurify.sanitize(html, config) as unknown as string;
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute', hook as never);
  }
}
