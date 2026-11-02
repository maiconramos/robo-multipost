import { describe, expect, it } from 'vitest';
import { sanitizePreviewHtml } from '@gitroom/helpers/utils/sanitize.preview.html';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

describe('sanitizePreviewHtml', () => {
  it('texto salvo como "<img onerror>" nao vira HTML vivo na pre-visualizacao', () => {
    const stored = '<p>&lt;img src=x onerror=alert(1)&gt;</p>';
    const text = stripHtmlValidation('normal', stored, true);
    expect(text).toContain('<img');

    const html = sanitizePreviewHtml(text);
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
  });

  it('mantem a marcacao da pre-visualizacao (mencao e trecho cortado)', () => {
    const html = sanitizePreviewHtml(
      'oi <span class="font-bold" style="color: #ae8afc">@ana</span><mark class="bg-red-500" data-tooltip-id="tooltip" data-tooltip-content="corta">resto</mark>'
    );
    expect(html).toContain('<span class="font-bold" style="color: #ae8afc">@ana</span>');
    expect(html).toContain('data-tooltip-content="corta"');
  });

  it('remove link javascript:', () => {
    expect(sanitizePreviewHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });

  it('valor vazio ou nao-string vira string vazia', () => {
    expect(sanitizePreviewHtml(undefined)).toBe('');
    expect(sanitizePreviewHtml(42)).toBe('');
  });
});
