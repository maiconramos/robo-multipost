import { describe, expect, it } from 'vitest';
import { initialCalendarDisplay } from './calendar.display';
describe('visualizacao inicial do calendario responsivo', () => {
  it('usa dia no celular e semana no desktop sem preferencia', () => {
    expect(initialCalendarDisplay(null, '', true)).toBe('day');
    expect(initialCalendarDisplay(null, '', false)).toBe('week');
  });
  it('preserva URL e cookie explicitos antes do padrao mobile', () => {
    expect(initialCalendarDisplay('month', 'day', true)).toBe('month');
    expect(initialCalendarDisplay(null, 'list', true)).toBe('list');
    expect(initialCalendarDisplay(null, 'week', true)).toBe('week');
  });
  it('ignora preferencias invalidas sem produzir intervalo indefinido', () => {
    expect(initialCalendarDisplay('invalid', 'month', true)).toBe('month');
    expect(initialCalendarDisplay('invalid', 'invalid', true)).toBe('day');
  });
});
