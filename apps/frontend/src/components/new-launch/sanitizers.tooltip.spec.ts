import { describe, expect, it } from 'vitest';
import { sanitizeChatContent } from '@gitroom/helpers/utils/sanitize.chat.content';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';
import { sanitizePreviewHtml } from '@gitroom/helpers/utils/sanitize.preview.html';

// DOMPurify REAL (o jest das libraries usa um mock identidade): o ToolTip
// global renderiza `data-tooltip-html` como HTML ao passar o mouse.
const payload =
  '<div data-tooltip-id="tooltip" data-tooltip-html="<img src=x onerror=alert(document.domain)>">x</div>';

describe('sanitizadores nao deixam passar data-tooltip-html', () => {
  it('chat do assistente', () => {
    expect(sanitizeChatContent(payload)).not.toContain('data-tooltip-html');
  });

  it('conteudo de post', () => {
    expect(sanitizePostContent(`<p>${payload}</p>`)).not.toContain('data-tooltip-html');
  });

  it('pre-visualizacao', () => {
    expect(sanitizePreviewHtml(payload)).not.toContain('data-tooltip-html');
  });

  it('mencao (data-mention-*) continua no post', () => {
    const html = sanitizePostContent(
      '<p><span data-mention-id="123" data-mention-label="ana">@ana</span></p>'
    );
    expect(html).toContain('data-mention-id="123"');
    expect(html).toContain('data-mention-label="ana"');
  });

  it('tooltip de texto do preview (data-tooltip-content) continua', () => {
    expect(
      sanitizePreviewHtml('<mark data-tooltip-id="tooltip" data-tooltip-content="corta">x</mark>')
    ).toContain('data-tooltip-content="corta"');
  });
});
