import { checkAuth } from './auth.context';
import { runWithContext } from './async.storage';
import { agentIdentity } from './tools/agent-profile-scope';
describe('identidade autenticada por chamada MCP', () => {
  it('contexto reutilizado nao conserva perfil da credencial anterior', async () => {
    const values = new Map<string, unknown>();
    const options = { requestContext: values };
    await runWithContext(
      { requestId: 'a', auth: { id: 'org' }, profileId: 'a' },
      () => checkAuth({}, options)
    );
    expect(values.get('profileId')).toBe('a');
    await runWithContext({ requestId: 'org', auth: { id: 'org' } }, () => {
      checkAuth({}, options);
      expect(values.get('profileId')).toBeUndefined();
      expect(agentIdentity(options, 'b').profileId).toBe('b');
    });
  });
  it('contexto de transporte nao sobrepoe identidade do AsyncLocalStorage', async () => {
    await runWithContext(
      { requestId: 'a', auth: { id: 'org' }, profileId: 'a' },
      () => {
        const options = {
          requestContext: new Map([
            ['organization', '{"id":"other"}'],
            ['profileId', 'b'],
          ]),
        };
        expect(() => agentIdentity(options, 'b')).toThrow(
          'PROFILE_KEY_MISMATCH'
        );
        expect(agentIdentity(options).organization.id).toBe('org');
      }
    );
  });
});
