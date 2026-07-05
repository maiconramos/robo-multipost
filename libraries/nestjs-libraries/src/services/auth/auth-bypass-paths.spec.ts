import { isAuthBypassPath } from './auth-bypass-paths';

describe('isAuthBypassPath', () => {
  it('libera o prefixo exato /auth', () => {
    expect(isAuthBypassPath('/auth')).toBe(true);
  });

  it('libera sub-rotas de /auth', () => {
    expect(isAuthBypassPath('/auth/login')).toBe(true);
    expect(isAuthBypassPath('/auth/activate/123')).toBe(true);
  });

  it('libera o handshake de conexao de canal', () => {
    expect(isAuthBypassPath('/integrations/social-connect')).toBe(true);
    expect(isAuthBypassPath('/integrations/provider/x')).toBe(true);
  });

  it('NAO libera /oauth/authorize (nao casa por substring)', () => {
    expect(isAuthBypassPath('/oauth/authorize')).toBe(false);
    expect(isAuthBypassPath('/oauth/token')).toBe(false);
  });

  it('NAO libera rotas que apenas contem os prefixos como substring', () => {
    expect(isAuthBypassPath('/user/authorize')).toBe(false);
    expect(isAuthBypassPath('/integrations/social-connect-fake')).toBe(false);
  });

  it('NAO libera rotas de dados comuns', () => {
    expect(isAuthBypassPath('/posts')).toBe(false);
    expect(isAuthBypassPath('/profiles/abc/members')).toBe(false);
  });
});
