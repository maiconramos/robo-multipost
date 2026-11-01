import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { NotificationOpenComponent } from './notification.component';

let state: { data?: unknown; isLoading: boolean; mutate: () => void; error?: Error };
vi.mock('swr', () => ({ default: () => state }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => vi.fn() }));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: unknown) => typeof fallback === 'string' ? fallback : 'Mensagem traduzida',
}));
afterEach(cleanup);
describe('notificacoes responsivas', () => {
  it('mostra nova tentativa para JSON de erro e nao quebra ao abrir', () => {
    state = { data: { statusCode: 403 }, isLoading: false, mutate: vi.fn() };
    const view = render(<NotificationOpenComponent />);
    fireEvent.click(view.getByRole('button', { name: /Try again/ }));
    expect(state.mutate).toHaveBeenCalledOnce();
  });
  it('distingue carregamento de lista vazia', () => {
    state = { isLoading: true, mutate: vi.fn() };
    const view = render(<NotificationOpenComponent />);
    expect(view.queryByText('No notifications')).toBeNull();
    state = { data: { notifications: [] }, isLoading: false, mutate: vi.fn() };
    view.rerender(<NotificationOpenComponent />);
    expect(view.getByText('No notifications')).toBeTruthy();
  });
  it('preserva traducao e sanitizacao do conteudo legado', () => {
    state = { data: { lastReadNotifications: '2020-01-01', notifications: [
      { createdAt: '2026-01-01', content: 'fallback', contentKey: 'published', contentParams: {} },
      { createdAt: '2026-01-01', content: '<img src=x onerror="alert(1)"><script>alert(1)</script>Texto legado' },
    ] }, isLoading: false, mutate: vi.fn() };
    const view = render(<NotificationOpenComponent />);
    expect(view.getByText('Mensagem traduzida')).toBeTruthy();
    expect(view.getByText('Texto legado')).toBeTruthy();
    expect(view.container.querySelector('script,[onerror]')).toBeNull();
  });
});
