import { allowedRequestOrigins, isCrossSiteCookieMutation } from './csrf.origin';

const allowed = allowedRequestOrigins({
  FRONTEND_URL: 'https://app.exemplo.com',
  NEXT_PUBLIC_BACKEND_URL: 'https://api.exemplo.com/api',
});

const req = (over: Partial<{ method: string; headers: any; cookies: any }> = {}) => ({
  method: 'POST',
  headers: {},
  cookies: { auth: 'jwt' },
  ...over,
});

describe('isCrossSiteCookieMutation', () => {
  it('POST com cookie vindo de outro site e bloqueado', () => {
    expect(isCrossSiteCookieMutation(req({ headers: { origin: 'https://atacante.com' } }), allowed)).toBe(true);
  });

  it('POST de subdominio irmao (mesmo site, outra origem) e bloqueado', () => {
    expect(isCrossSiteCookieMutation(req({ headers: { origin: 'https://blog.exemplo.com' } }), allowed)).toBe(true);
  });

  it('origem "null" (iframe sandbox) e bloqueada', () => {
    expect(isCrossSiteCookieMutation(req({ headers: { origin: 'null' } }), allowed)).toBe(true);
  });

  it('POST do proprio frontend passa', () => {
    expect(isCrossSiteCookieMutation(req({ headers: { origin: 'https://app.exemplo.com' } }), allowed)).toBe(false);
  });

  it('POST da origem do backend passa', () => {
    expect(isCrossSiteCookieMutation(req({ headers: { origin: 'https://api.exemplo.com' } }), allowed)).toBe(false);
  });

  it('GET nunca e bloqueado', () => {
    expect(isCrossSiteCookieMutation(req({ method: 'GET', headers: { origin: 'https://atacante.com' } }), allowed)).toBe(false);
  });

  it('autenticado pelo header auth (API/CLI) nao e CSRF', () => {
    expect(isCrossSiteCookieMutation(req({ headers: { origin: 'https://atacante.com', auth: 'jwt' } }), allowed)).toBe(false);
  });

  it('sem Origin usa o Sec-Fetch-Site', () => {
    expect(isCrossSiteCookieMutation(req({ headers: { 'sec-fetch-site': 'cross-site' } }), allowed)).toBe(true);
    expect(isCrossSiteCookieMutation(req({ headers: { 'sec-fetch-site': 'same-origin' } }), allowed)).toBe(false);
    expect(isCrossSiteCookieMutation(req({ headers: {} }), allowed)).toBe(false);
  });
});
