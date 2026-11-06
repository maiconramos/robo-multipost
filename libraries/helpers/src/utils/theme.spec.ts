import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, resolveTheme } from './theme';
describe('preferencia de tema', () => {
  it('usa claro como padrao', () => {
    expect(DEFAULT_THEME).toBe('light');
  });
  it.each(['light', 'dark'] as const)('conserva %s', (value) => {
    expect(resolveTheme(value)).toBe(value);
  });
  it.each([
    undefined,
    null,
    '',
    'system',
    'unexpected',
    'dark extra',
    {},
    ['dark'],
  ])('normaliza valor invalido %s', (value) => {
    expect(resolveTheme(value)).toBe('light');
  });
});
