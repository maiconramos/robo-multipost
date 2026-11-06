export type ThemeMode = 'light' | 'dark';
export const DEFAULT_THEME: ThemeMode = 'light';

export function resolveTheme(value: unknown): ThemeMode {
  return value === 'dark' ? 'dark' : DEFAULT_THEME;
}
