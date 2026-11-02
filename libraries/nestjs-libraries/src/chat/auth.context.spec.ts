import { RequestContext } from '@mastra/core/request-context';
import { checkAuth } from './auth.context';
import { runWithContext } from './async.storage';

describe('checkAuth - contexto das ferramentas MCP', () => {
  it('chamada da org inteira nao herda o perfil de uma chamada anterior', async () => {
    const requestContext = new RequestContext();

    await runWithContext(
      { requestId: 'r1', auth: { id: 'org-a' }, profileId: 'prof-cliente' } as any,
      () => checkAuth({}, { requestContext })
    );
    expect(requestContext.get('profileId' as never)).toBe('prof-cliente');

    await runWithContext(
      { requestId: 'r2', auth: { id: 'org-b' } } as any,
      () => checkAuth({}, { requestContext })
    );
    expect(requestContext.get('profileId' as never)).toBeUndefined();
    expect(JSON.parse(requestContext.get('organization' as never) as string)).toEqual({ id: 'org-b' });
  });
});
