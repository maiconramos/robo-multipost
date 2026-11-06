import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { ThemeProvider, useTheme } from '@gitroom/react/helpers/theme';
import ModeComponent, { modeEmitter } from './mode.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
const clearCookie = () => {
  document.cookie = 'mode=; max-age=0; path=/';
};
beforeEach(() => {
  clearCookie();
  document.body.className = 'text-primary';
});
afterEach(() => {
  cleanup();
  clearCookie();
  modeEmitter.removeAllListeners();
  document.body.className = '';
});
describe('tema inicial e preferencia salva', () => {
  it('inicia claro sem preferencia e conserva outras classes do body', () => {
    render(<ModeComponent />);
    expect(document.body.classList.contains('light')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(false);
    expect(document.body.classList.contains('text-primary')).toBe(true);
  });
  it.each(['dark', 'light'])(
    'preserva preferencia %s ao abrir novamente',
    (mode) => {
      document.cookie = `mode=${mode}; path=/`;
      const view = render(<ModeComponent />);
      expect(document.body.classList.contains(mode)).toBe(true);
      view.unmount();
      render(<ModeComponent />);
      expect(document.body.classList.contains(mode)).toBe(true);
      expect(document.cookie).toContain(`mode=${mode}`);
    }
  );
  it('usa claro para cookie invalido sem aplicar classe arbitraria', () => {
    document.cookie = 'mode=unexpected; path=/';
    render(<ModeComponent />);
    expect(document.body.classList.contains('light')).toBe(true);
    expect(document.body.classList.contains('unexpected')).toBe(false);
  });
  it('permite alternar e conserva a escolha apos remontar', () => {
    const view = render(<ModeComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }));
    expect(document.cookie).toContain('mode=dark');
    expect(document.body.classList.contains('dark')).toBe(true);
    view.unmount();
    render(<ModeComponent />);
    expect(document.body.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }));
    expect(document.cookie).toContain('mode=light');
    expect(document.body.classList.contains('light')).toBe(true);
  });
});

function ThemeConsumer() {
  const [mode] = useTheme();
  return <output data-testid="consumer">{mode}</output>;
}
describe('tema inicial compartilhado entre servidor e cliente', () => {
  it.each(['dark', 'light'] as const)(
    'hidrata %s sem divergencia e preserva a preferencia',
    async (mode) => {
      const tree = (
        <ThemeProvider initialTheme={mode}>
          <ModeComponent />
          <ThemeConsumer />
        </ThemeProvider>
      );
      // No document cookie is available in the real server render.
      clearCookie();
      const html = renderToString(tree);
      expect(html).toContain(`>${mode}</output>`);
      document.cookie = `mode=${mode}; path=/`;
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      const recover = vi.fn();
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      let root: ReturnType<typeof hydrateRoot>;
      try {
        await act(async () => {
          root = hydrateRoot(container, tree, { onRecoverableError: recover });
        });
        expect(container.querySelector('output')?.textContent).toBe(mode);
        expect(document.body.classList.contains(mode)).toBe(true);
        expect(recover).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
      } finally {
        await act(async () => root!.unmount());
        container.remove();
        errors.mockRestore();
      }
    }
  );
});
