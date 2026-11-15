import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import { ZernioInstagramEditor } from './shared-zernio-editor.component';
const state = vi.hoisted(() => ({
  api: vi.fn(),
  push: vi.fn(),
  profile: 'p',
  flow: undefined as any,
  noAccounts: false,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (k: string) => k,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push, replace: state.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@gitroom/frontend/hooks/use-current-profile.hook', () => ({
  useCurrentProfile: () => ({ profile: { id: state.profile } }),
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.api,
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: (path: string | null) => ({
    data: path?.includes('resource=channels')
      ? state.noAccounts
        ? []
        : [
            {
              id: 'zi',
              name: 'Instagram Z',
              providerIdentifier: 'zernio-instagram',
            },
          ]
      : path?.includes('resource=readiness')
      ? { ready: true }
      : path?.includes('resource=posts')
      ? { data: [] }
      : path === '/managed-automations/f'
      ? state.flow
      : undefined,
    mutate: vi.fn(),
  }),
}));
vi.mock('./wizard-phone-preview.component', () => ({
  WizardPhonePreview: (p: any) => (
    <div data-testid="preview">{p.dmMessage}</div>
  ),
}));
vi.mock('./shared-execution-history.component', () => ({
  AutomationExecutionHistory: (p: any) => (
    <div>
      history:{p.engine}:{p.flowId}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.flow = undefined;
  state.profile = 'p';
  state.noAccounts = false;
});
it('salva rascunho no servico compartilhado sem chamar rotas Meta', async () => {
  state.api.mockImplementation(
    async (path: string, init: any) =>
      new Response(
        JSON.stringify(
          path.endsWith('/status')
            ? { message: 'ZERNIO_AUTHORIZATION_REQUIRED' }
            : {
                id: 'new',
                revision: 1,
                status: 'DRAFT',
                executionVersion: 3,
                configuration: JSON.parse(init.body),
                syncState: 'idle',
              }
        ),
        { status: path.endsWith('/status') ? 412 : 200 }
      )
  );
  render(<ZernioInstagramEditor />);
  fireEvent.change(screen.getByLabelText('select_instagram_account'), {
    target: { value: 'zi' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'shared_message' }), {
    target: { value: 'Meu link' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'save_flow' }));
  await waitFor(() => expect(state.api).toHaveBeenCalled());
  const [path, init] = state.api.mock.calls[0];
  expect(path).toBe('/managed-automations');
  expect(JSON.parse(init.body)).toMatchObject({
    integrationId: 'zi',
    postMode: 'all',
    activate: false,
    dmVariants: [{ message: 'Meu link' }],
  });
  expect(state.api.mock.calls.some(([p]: any) => p.includes('/flows'))).toBe(
    false
  );
});
it('usa historico existente com engine Zernio e nao habilita construtor nativo', async () => {
  state.flow = {
    id: 'f',
    name: 'Regra',
    integrationId: 'zi',
    revision: 3,
    status: 'PAUSED',
    executionVersion: 3,
    syncState: 'idle',
    configuration: {
      name: 'Regra',
      integrationId: 'zi',
      postMode: 'all',
      dmMessage: 'Oi',
    },
  };
  render(<ZernioInstagramEditor id="f" />);
  await waitFor(() => expect(screen.getByDisplayValue('Regra')).toBeTruthy());
  expect(
    (
      screen.getByRole('tab', {
        name: 'automation_workspace_flow',
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(
    screen.getByRole('tab', { name: 'automation_workspace_history' })
  );
  await waitFor(() =>
    expect(screen.getByText('history:zernio:f')).toBeTruthy()
  );
});

it('aguarda ativacao terminar antes de navegar para o rascunho criado', async () => {
  let settle: (value: Response) => void = () => {};
  state.api.mockImplementation(async (path: string, init: any) => {
    if (path.endsWith('/status'))
      return new Promise<Response>((resolve) => {
        settle = resolve;
      });
    return new Response(
      JSON.stringify({
        id: 'new',
        revision: 1,
        status: 'DRAFT',
        executionVersion: 3,
        configuration: JSON.parse(init.body),
        syncState: 'idle',
      })
    );
  });
  render(<ZernioInstagramEditor />);
  fireEvent.change(screen.getByLabelText('select_instagram_account'), {
    target: { value: 'zi' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'shared_message' }), {
    target: { value: 'Oi' },
  });
  fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
  await waitFor(() =>
    expect(
      state.api.mock.calls.some(([path]: any) => path.endsWith('/status'))
    ).toBe(true)
  );
  expect(state.push).not.toHaveBeenCalled();
  settle(
    new Response(
      JSON.stringify({
        id: 'new',
        revision: 4,
        status: 'ACTIVE',
        executionVersion: 3,
        syncState: 'idle',
      })
    )
  );
  await waitFor(() =>
    expect(state.push).toHaveBeenCalledWith(
      '/automations/zernio/new?view=quick'
    )
  );
});

it('preserva ID apos falha de ativacao e nao cria outro rascunho ao tentar novamente', async () => {
  state.api.mockImplementation(async (path: string, init: any) => {
    if (path.endsWith('/status'))
      return new Response(
        JSON.stringify({ message: 'ZERNIO_AUTHORIZATION_REQUIRED' }),
        { status: 412 }
      );
    return new Response(
      JSON.stringify({
        id: 'saved',
        revision: 2,
        status: 'DRAFT',
        executionVersion: 3,
        configuration: init
          ? JSON.parse(init.body)
          : {
              name: 'Regra',
              integrationId: 'zi',
              postMode: 'all',
              dmVariants: [{ message: 'Oi' }],
            },
        syncState: 'idle',
      })
    );
  });
  render(<ZernioInstagramEditor />);
  fireEvent.change(screen.getByLabelText('select_instagram_account'), {
    target: { value: 'zi' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'shared_message' }), {
    target: { value: 'Oi' },
  });
  fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(state.push).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: 'activate_flow' })
    ).toHaveProperty('disabled', false)
  );
  fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
  await waitFor(() =>
    expect(
      state.api.mock.calls.filter(([p]: any) => p.endsWith('/status'))
    ).toHaveLength(2)
  );
  expect(
    state.api.mock.calls.filter(
      ([p, i]: any) => p === '/managed-automations' && i.method === 'POST'
    )
  ).toHaveLength(1);
  expect(
    state.api.mock.calls
      .filter(([p]: any) => p.endsWith('/status'))
      .map(([p]: any) => p)
  ).toEqual([
    '/managed-automations/saved/status',
    '/managed-automations/saved/status',
  ]);
});

it('orienta a conectar uma conta quando o perfil nao tem Instagram Zernio', () => {
  state.noAccounts = true;
  render(<ZernioInstagramEditor />);
  expect(screen.getByText('zernio_no_accounts')).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: 'zernio_connect_account' })
      .getAttribute('href')
  ).toBe('/launches');
});
