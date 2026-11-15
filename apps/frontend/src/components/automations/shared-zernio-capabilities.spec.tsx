import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { AutomationPublicationSelector } from './shared-publication-selector.component';
import { PrivateMessageVariations } from './shared-private-variations.component';
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: () => ({ data: undefined as unknown, mutate: vi.fn() }),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (k: string) => k,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
afterEach(cleanup);
it('oculta alvos sem suporte e limita a escolha a uma publicacao', () => {
  const change = vi.fn();
  render(
    <AutomationPublicationSelector
      integrationId="z"
      mode="specific"
      postIds={['1']}
      posts={[
        { id: '1', caption: 'Primeiro' },
        { id: '2', caption: 'Segundo' },
      ]}
      onChange={change}
      scheduledEnabled={false}
      allowNext={false}
      maxSpecificPosts={1}
    />
  );
  expect(screen.queryByText('wizard_next_publication')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Segundo' }));
  expect(change).not.toHaveBeenCalled();
});
it('limita as variacoes a seis e oferece somente tokens Zernio', () => {
  render(
    <PrivateMessageVariations
      messages={['A', 'B', 'C', 'D', 'E', 'F']}
      onChange={vi.fn()}
      engine="zernio"
      maxVariants={6}
    />
  );
  expect(
    (screen.getByText('wizard_add_reply_variant') as HTMLButtonElement).disabled
  ).toBe(true);
  fireEvent.focus(screen.getAllByRole('textbox')[0]);
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_insert_variable' })
  );
  expect(
    screen.queryByRole('button', { name: 'automation_variable_comment_text' })
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'automation_variable_name' })
  ).toBeTruthy();
});
