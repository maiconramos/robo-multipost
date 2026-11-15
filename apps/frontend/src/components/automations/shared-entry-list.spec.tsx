import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { FlowListComponent } from './flow-list.component';
import { NovaAutomacaoModal } from './nova-automacao-modal.component';
import { simpleDefinition } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
const state = vi.hoisted(() => ({
  push: vi.fn(),
  fetch: vi.fn(),
  mutate: vi.fn(),
  shared: [] as any[],
  legacy: [] as any[],
  zernio: [] as any[],
  integrations: [] as any[],
  error: undefined as any,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => {
  const t = (key: string) => key;
  return { useT: () => t };
});
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('./hooks/use-flows', () => ({
  useFlows: () => ({ data: state.legacy, mutate: state.mutate }),
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: (path: string) => ({
    data: path === '/managed-automations' ? state.zernio : state.shared,
    error: state.error,
    mutate: state.mutate,
  }),
}));
vi.mock('./repost/repost-list.component', () => ({
  RepostListComponent: () => <div />,
}));
vi.mock(
  '@gitroom/frontend/components/launches/helpers/platform-icon.helper',
  () => ({ PlatformIconBadge: () => <span /> })
);
vi.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({ useIntegrationList: () => ({ data: state.integrations }) })
);
beforeEach(() => {
  vi.clearAllMocks();
  state.error = undefined;
  state.legacy = [];
  state.zernio = [];
  state.integrations = [
    { id: 'ig', name: 'Instagram teste', identifier: 'instagram' },
  ];
  state.shared = [
    {
      id: 'shared',
      name: 'Facebook teste',
      status: 'ACTIVE',
      revision: 7,
      definition: simpleDefinition({ message: 'Oi' }),
      channels: [
        {
          integrationId: 'fb',
          name: 'Pagina',
          platform: 'facebook',
          postMode: 'specific',
          postIds: ['p'],
        },
      ],
    },
  ];
  state.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});
afterEach(cleanup);
describe('entrada e lista unificadas', () => {
  it.each([
    ['instagram', 'comment', '/automations/instagram/new?type=comment'],
    ['instagram', 'story', '/automations/instagram/new?type=story'],
    ['instagram', 'repost', '/automations/reposts/new'],
    ['facebook', 'comment', '/automations/new?trigger=comment_on_post'],
    ['facebook', 'message', '/automations/new?trigger=messenger_message'],
  ])('abre %s %s sem criar registros', (network, trigger, route) => {
    render(<NovaAutomacaoModal open onClose={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('tab', {
        name: network === 'instagram' ? 'Instagram' : 'Facebook',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`automation_start_${trigger}`),
      })
    );
    expect(state.push).toHaveBeenCalledWith(route);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
  it('alterna os gatilhos sem repetir formularios e fecha com Escape', () => {
    const close = vi.fn();
    render(<NovaAutomacaoModal open onClose={close} />);
    const facebook = screen.getByRole('tab', { name: 'Facebook' });
    fireEvent.click(facebook);
    expect(
      screen.queryByRole('button', { name: /automation_start_story/ })
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: /automation_start_message/ })
    ).toBeTruthy();
    fireEvent.keyDown(facebook, { key: 'ArrowLeft' });
    expect(
      screen
        .getByRole('tab', { name: 'Instagram' })
        .getAttribute('aria-selected')
    ).toBe('true');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('contem o foco do teclado e restaura o botao de abertura', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<NovaAutomacaoModal open onClose={vi.fn()} />);
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'Instagram' })
    );
    const close = screen.getByRole('button', { name: 'close' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    const last = screen.getByRole('button', {
      name: /automation_start_repost/,
    });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it('exibe uma tabela com linhas V1 e V2 e usa revisao somente no V2', async () => {
    state.legacy = [
      {
        id: 'old',
        name: 'Instagram antigo',
        status: 'ACTIVE',
        triggerPostIds: null,
      },
    ];
    render(<FlowListComponent />);
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByRole('table').textContent).toContain('Facebook teste');
    expect(screen.getByRole('table').textContent).toContain('Instagram antigo');
    fireEvent.click(screen.getAllByRole('switch')[1]);
    await waitFor(() => expect(state.fetch).toHaveBeenCalled());
    expect(state.fetch.mock.calls[0][0]).toBe('/flows-v2/shared/status');
    expect(JSON.parse(state.fetch.mock.calls[0][1].body)).toEqual({
      status: 'PAUSED',
      expectedRevision: 7,
    });
  });
  it('mostra erro parcial e atualiza a lista em conflito de revisao', async () => {
    state.error = new Error('failed');
    state.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'REVISION_CONFLICT' }),
    });
    render(<FlowListComponent />);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(state.mutate).toHaveBeenCalled());
  });
});

it('abre e gerencia regra Zernio pela rota correta', async () => {
  state.shared = [];
  state.zernio = [
    {
      id: 'z',
      name: 'Zernio teste',
      integrationId: 'zi',
      executionVersion: 3,
      revision: 9,
      status: 'ACTIVE',
      configuration: { postMode: 'all', dmMessage: 'Oi' },
      syncState: 'idle',
    },
  ];
  render(<FlowListComponent />);
  expect(screen.getByText('Zernio teste')).toBeTruthy();
  const row = screen.getByText('Zernio teste').closest('tr')!;
  expect(row.querySelector('a')?.getAttribute('href')).toBe(
    '/automations/zernio/z?view=history'
  );
  fireEvent.click(
    Array.from(row.querySelectorAll('button')).find(
      (b) => b.textContent === 'flow_action_edit'
    )!
  );
  expect(state.push).toHaveBeenCalledWith('/automations/zernio/z');
  fireEvent.click(row.querySelector('[role="switch"]')!);
  await waitFor(() =>
    expect(state.fetch).toHaveBeenCalledWith(
      '/managed-automations/z/status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedRevision: 9, status: 'PAUSED' }),
      })
    )
  );
});
