import {
  asSessionPayload,
  isIssuedBeforeCutoff,
  isSessionRevoked,
  sessionsCutoffNow,
  SESSION_MAX_AGE_SECONDS,
} from './session.token';

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const iatAt = (ms: number) => Math.floor(ms / 1000);

describe('asSessionPayload', () => {
  const session = {
    id: 'user-1',
    email: 'a@b.com',
    providerName: 'LOCAL',
    activated: true,
    iat: iatAt(NOW),
  };

  it('aceita a linha de User assinada no login', () => {
    expect(asSessionPayload(session)).toEqual(session);
  });

  it('aceita sessao de usuario OAuth com password null', () => {
    expect(asSessionPayload({ ...session, providerName: 'GOOGLE', password: null })).not.toBeNull();
  });

  it('recusa o token de redefinicao de senha', () => {
    expect(asSessionPayload({ id: 'user-1', expires: '2026-11-02 12:20:00', iat: iatAt(NOW) })).toBeNull();
  });

  it('recusa o link de ativacao (activated false)', () => {
    expect(asSessionPayload({ ...session, activated: false })).toBeNull();
  });

  it.each([
    ['convite', { id: 'abcde', orgId: 'org-1', timeLimit: 'x', email: 'a@b.com' }],
    ['extensao', { id: 'user-1', integrationId: 'int-1' }],
    ['nostr', { id: 'user-1', password: 'segredo' }],
    ['callback de apiKey', { id: 'user-1', apiKey: 'k' }],
  ])('recusa token de %s', (_name, claims) => {
    expect(asSessionPayload({ ...claims, iat: iatAt(NOW) })).toBeNull();
  });

  it('recusa token sem id, sem iat ou que nao e objeto', () => {
    expect(asSessionPayload({ iat: iatAt(NOW) })).toBeNull();
    expect(asSessionPayload({ id: 'user-1' })).toBeNull();
    expect(asSessionPayload('texto')).toBeNull();
    expect(asSessionPayload(null)).toBeNull();
  });
});

describe('isSessionRevoked', () => {
  it('sessao recente sem troca de senha continua valida', () => {
    expect(isSessionRevoked({ iat: iatAt(NOW - 1000) }, {}, NOW)).toBe(false);
  });

  it('sessao mais velha que o cookie (1 ano) expira', () => {
    const old = NOW - (SESSION_MAX_AGE_SECONDS + 60) * 1000;
    expect(isSessionRevoked({ iat: iatAt(old) }, {}, NOW)).toBe(true);
  });

  it('sessao emitida antes da troca de senha e derrubada', () => {
    const cutoff = new Date(NOW);
    expect(isSessionRevoked({ iat: iatAt(NOW - 60_000) }, { sessionsValidAfter: cutoff }, NOW + 1000)).toBe(true);
  });

  it('login feito depois da troca de senha (inclusive no mesmo segundo) vale', () => {
    const cutoff = sessionsCutoffNow(NOW + 400);
    expect(isSessionRevoked({ iat: iatAt(NOW + 800) }, { sessionsValidAfter: cutoff }, NOW + 1000)).toBe(false);
  });
});

describe('isIssuedBeforeCutoff', () => {
  it('sem corte nada e invalidado', () => {
    expect(isIssuedBeforeCutoff(undefined, null)).toBe(false);
  });

  it('com corte, token sem iat e invalidado', () => {
    expect(isIssuedBeforeCutoff(undefined, new Date(NOW))).toBe(true);
  });
});
