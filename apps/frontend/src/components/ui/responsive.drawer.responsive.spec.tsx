import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { ResponsiveDrawer } from './responsive.drawer';

vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
let viewportChange: (event: { matches: boolean }) => void;
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: (_event: string, callback: typeof viewportChange) => {
      viewportChange = callback;
    },
    removeEventListener: vi.fn(),
  });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    {},
  ] as unknown as DOMRectList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const Fixture = ({ route = '/launches' }: { route?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <ResponsiveDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Navegação"
        routeKey={route}
      >
        <a href="/launches">Calendário</a>
        <button>Último</button>
      </ResponsiveDrawer>
    </>
  );
};
describe('painel responsivo', () => {
  it('fecha por Escape e devolve foco sem sobrescrever o estilo de outro modal', () => {
    document.body.style.overflow = 'clip';
    const view = render(<Fixture />);
    const trigger = view.getByRole('button', { name: 'Abrir' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(view.getByRole('dialog', { name: 'Navegação' })).toBeTruthy();
    expect(document.body.classList.contains('responsiveDrawerOpen')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(view.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('clip');
    expect(document.body.classList.contains('responsiveDrawerOpen')).toBe(
      false
    );
    document.body.style.overflow = '';
  });
  it('contem Tab incluindo links e fecha pelo fundo', () => {
    const view = render(<Fixture />);
    fireEvent.click(view.getByText('Abrir'));
    const close = view.getByRole('button', { name: 'Close' });
    const last = view.getByRole('button', { name: 'Último' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.click(view.getByTestId('responsive-drawer-backdrop'));
    expect(view.queryByRole('dialog')).toBeNull();
  });
  it('fecha ao mudar rota ou voltar para desktop', () => {
    const view = render(<Fixture />);
    fireEvent.click(view.getByText('Abrir'));
    view.rerender(<Fixture route="/settings" />);
    expect(view.queryByRole('dialog')).toBeNull();
    fireEvent.click(view.getByText('Abrir'));
    act(() => viewportChange({ matches: false }));
    expect(view.queryByRole('dialog')).toBeNull();
  });
});
