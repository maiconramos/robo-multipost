import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopilotProvider } from './copilot.provider';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('contrato de transporte dos assistentes', () => {
  it.each(['chat', 'agent'])('consulta metadados de %s pelo POST autenticado existente', async (route) => {
    const endpoint = `http://127.0.0.1:9/copilot/${route}`;
    const requests: Array<{
      url: string;
      method: string;
      credentials?: RequestCredentials;
      body?: string;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.href
            : input.url;
        requests.push({
          url,
          method: init?.method || 'GET',
          credentials: init?.credentials,
          body: init?.body as string,
        });
        return new Response(
          JSON.stringify({
            agents: { default: { name: 'default', description: 'Fixture' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      })
    );
    render(
      <CopilotProvider runtimeUrl={endpoint}>
        <div>Editor</div>
      </CopilotProvider>
    );
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests.every((request) => request.url === endpoint)).toBe(true);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].credentials).toBe('include');
    expect(JSON.parse(requests[0].body || '{}').method).toBe('info');
  });
});
