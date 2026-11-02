jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);

import { createHmac } from 'crypto';
import { sign } from 'jsonwebtoken';
import { Nowpayments, isValidNowpaymentsSignature } from './nowpayments';

const SECRET = 'ipn-secret';
const JWT = 'segredo-jwt-de-teste';

const sigFor = (body: Record<string, unknown>) => {
  const sorted = Object.keys(body)
    .sort()
    .reduce((acc, k) => ({ ...acc, [k]: body[k] }), {});
  return createHmac('sha512', SECRET).update(JSON.stringify(sorted)).digest('hex');
};

describe('Nowpayments.processPayment', () => {
  const env = { ipn: process.env.NOWPAYMENTS_IPN_SECRET, jwt: process.env.JWT_SECRET };
  let subscription: { lifeTime: jest.Mock };
  let service: Nowpayments;
  const path = () => sign({ order_id: 'org-a_abc12' }, JWT);

  beforeEach(() => {
    process.env.NOWPAYMENTS_IPN_SECRET = SECRET;
    process.env.JWT_SECRET = JWT;
    subscription = { lifeTime: jest.fn().mockResolvedValue({}) };
    service = new Nowpayments(subscription as any);
  });

  afterAll(() => {
    if (env.ipn === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
    else process.env.NOWPAYMENTS_IPN_SECRET = env.ipn;
    if (env.jwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = env.jwt;
  });

  it('pagamento assinado do proprio pedido vira vitalicio para a org assinada', async () => {
    const body = { order_id: 'org-a_abc12', payment_status: 'finished' };

    await service.processPayment(path(), body as any, sigFor(body));

    expect(subscription.lifeTime).toHaveBeenCalledWith('org-a', 'abc12', 'PRO');
  });

  it('sem assinatura do IPN nao concede nada', async () => {
    const body = { order_id: 'org-a_abc12', payment_status: 'finished' };

    await service.processPayment(path(), body as any, undefined);

    expect(subscription.lifeTime).not.toHaveBeenCalled();
  });

  it('sem NOWPAYMENTS_IPN_SECRET configurado falha fechado', async () => {
    delete process.env.NOWPAYMENTS_IPN_SECRET;
    const body = { order_id: 'org-a_abc12', payment_status: 'finished' };

    await service.processPayment(path(), body as any, sigFor(body));

    expect(subscription.lifeTime).not.toHaveBeenCalled();
  });

  it('corpo com outra org que a assinada na URL e ignorado', async () => {
    const body = { order_id: 'org-b_zzz99', payment_status: 'finished' };

    await service.processPayment(path(), body as any, sigFor(body));

    expect(subscription.lifeTime).not.toHaveBeenCalled();
  });

  it('pagamento ainda nao confirmado nao concede', async () => {
    const body = { order_id: 'org-a_abc12', payment_status: 'waiting' };

    await service.processPayment(path(), body as any, sigFor(body));

    expect(subscription.lifeTime).not.toHaveBeenCalled();
  });
});

describe('isValidNowpaymentsSignature', () => {
  it('ordena chaves aninhadas antes do HMAC', () => {
    const body = { b: 1, a: { d: 2, c: 3 } };
    const expected = createHmac('sha512', SECRET)
      .update(JSON.stringify({ a: { c: 3, d: 2 }, b: 1 }))
      .digest('hex');

    expect(isValidNowpaymentsSignature(body, expected, SECRET)).toBe(true);
    expect(isValidNowpaymentsSignature(body, 'x'.repeat(128), SECRET)).toBe(false);
  });
});
