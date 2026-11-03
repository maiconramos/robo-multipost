import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
// perfil ativo com papel VIEWER
vi.mock('@gitroom/frontend/hooks/use-profile-permissions', () => ({
  useProfilePermissions: () => ({
    role: 'VIEWER',
    canWrite: false,
    canManageProfile: false,
    isViewer: true,
  }),
}));

import { AutomationWorkspace } from './shared-workspace.component';

afterEach(cleanup);

describe('workspace da automacao - Visualizador', () => {
  it('nao mostra Salvar, bloqueia nome e status e avisa que e so leitura', () => {
    const onSave = vi.fn();
    const onStatusChange = vi.fn();
    render(
      <AutomationWorkspace
        name="Regra"
        onNameChange={vi.fn()}
        nameLabel="Nome"
        status="ACTIVE"
        dirty={true}
        busy={false}
        valid={true}
        onSave={onSave}
        onStatusChange={onStatusChange}
        navigation={{ mode: 'quick', onModeChange: vi.fn() }}
      >
        <input aria-label="Mensagem" defaultValue="oi" />
      </AutomationWorkspace>
    );

    expect(screen.queryByRole('button', { name: 'save_flow' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveProperty('disabled', true);
    expect(screen.getByText('automation_view_only')).toBeTruthy();
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveProperty('disabled', true);
    // campos do formulario tambem travados
    expect(
      (screen.getByRole('textbox', { name: 'Mensagem' }) as HTMLInputElement).matches(':disabled')
    ).toBe(true);
  });
});
