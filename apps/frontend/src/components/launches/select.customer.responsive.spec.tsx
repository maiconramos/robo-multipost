import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectCustomer } from './select.customer';
import type { Integrations } from './calendar.context';
vi.mock('@gitroom/react/toaster/toaster', () => ({ useToaster: () => ({ show: vi.fn() }) }));
vi.mock('@gitroom/frontend/components/new-launch/store', () => ({ useLaunchStore: () => ({ setCurrent: vi.fn() }) }));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({ useT: () => (_key: string, fallback: string) => fallback }));
afterEach(cleanup);
describe('filtro de cliente no celular', () => {
  it('permite limpar o cliente e acompanha a preferencia controlada pelo calendario', () => {
    const onChange = vi.fn();
    const integrations = [{ customer: { id: 'a', name: 'Cliente A' } }, { customer: { id: 'b', name: 'Cliente B' } }] as Integrations[];
    const view = render(<SelectCustomer list integrations={integrations} customer="a" onChange={onChange} />);
    const all = view.getByRole('button', { name: 'All customers' });
    fireEvent.click(all);
    expect(onChange).toHaveBeenCalledWith('');
    view.rerender(<SelectCustomer list integrations={integrations} onChange={onChange} />);
    expect(view.getByRole('button', { name: 'All customers' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.getByRole('button', { name: 'Cliente A' }).getAttribute('aria-pressed')).toBe('false');
  });
});
