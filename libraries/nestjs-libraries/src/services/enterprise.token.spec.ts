import { sign, verify } from 'jsonwebtoken';
import {
  InvalidEnterpriseTokenError,
  verifyEnterpriseToken,
} from './enterprise.token';

describe('verifyEnterpriseToken', () => {
  const ORIGINAL = process.env.JWT_SECRET;
  const secret = 'segredo-de-teste';

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL;
  });

  const token = (payload: object | string) => sign(payload, secret);

  it('aceita o payload de provisionamento enterprise', () => {
    const payload = {
      id: 'ext-1',
      name: 'Cliente',
      saasName: 'parceiro',
      email: 'c@exemplo.com',
    };
    expect(verifyEnterpriseToken(token(payload))).toMatchObject(payload);
  });

  it('aceita o payload de delete-channel (apiKey + id)', () => {
    expect(
      verifyEnterpriseToken(token({ apiKey: 'key', id: 'int-1' }))
    ).toMatchObject({ apiKey: 'key', id: 'int-1' });
  });

  it('rejeita token de login (linha de User com providerName)', () => {
    const login = token({
      id: 'user-1',
      name: 'Alguem',
      email: 'a@exemplo.com',
      providerName: 'LOCAL',
    });
    expect(() => verifyEnterpriseToken(login)).toThrow(
      InvalidEnterpriseTokenError
    );
  });

  it('rejeita convite de equipe (orgId/timeLimit)', () => {
    expect(() =>
      verifyEnterpriseToken(
        token({ email: 'a@b.c', role: 'ADMIN', orgId: 'org', id: 'x' })
      )
    ).toThrow(InvalidEnterpriseTokenError);
    expect(() =>
      verifyEnterpriseToken(token({ id: 'x', timeLimit: '2030-01-01' }))
    ).toThrow(InvalidEnterpriseTokenError);
  });

  it('rejeita token de redefinicao de senha (expires)', () => {
    expect(() =>
      verifyEnterpriseToken(token({ id: 'user-1', expires: '2030-01-01' }))
    ).toThrow(InvalidEnterpriseTokenError);
  });

  it('rejeita token da extensao Chrome e demais formatos conhecidos', () => {
    for (const payload of [
      { integrationId: 'i', organizationId: 'o', internalId: 'n', provider: 'skool' },
      { orgId: 'o', billing: 'ULTIMATE' },
      { password: 'nostr' },
      { discount: true },
      { order_id: 'np' },
    ]) {
      expect(() => verifyEnterpriseToken(token(payload))).toThrow(
        InvalidEnterpriseTokenError
      );
    }
  });

  it('rejeita assinatura invalida, payload nao-objeto e entrada vazia', () => {
    expect(() =>
      verifyEnterpriseToken(sign({ id: 'x', saasName: 's' }, 'outro-segredo'))
    ).toThrow();
    expect(() => verifyEnterpriseToken(token('apenas-string'))).toThrow(
      InvalidEnterpriseTokenError
    );
    expect(() => verifyEnterpriseToken('')).toThrow(
      InvalidEnterpriseTokenError
    );
    expect(() => verifyEnterpriseToken(undefined)).toThrow(
      InvalidEnterpriseTokenError
    );
  });

  it('desliga as rotas enterprise quando o JWT_SECRET e o valor de exemplo do compose', () => {
    const placeholder =
      'random string that is unique to every install - just type random characters here!';
    const forged = sign({ id: 'ext-1', saasName: 'x' }, placeholder);

    expect(() =>
      verifyEnterpriseToken(forged, (t) => verify(t, placeholder), placeholder)
    ).toThrow(InvalidEnterpriseTokenError);
  });
});
