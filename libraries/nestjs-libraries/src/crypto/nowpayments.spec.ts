jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);

import { sign } from 'jsonwebtoken';
import { Nowpayments } from './nowpayments';

const JWT = 'segredo-jwt-de-teste';

describe('Nowpayments.processPayment', () => {
  const original = process.env.JWT_SECRET;
  let subscription: { lifeTime: jest.Mock };
  let service: Nowpayments;
  const path = () => sign({ order_id: 'org-a_abc12' }, JWT);

  beforeEach(() => {
    process.env.JWT_SECRET = JWT;
    subscription = { lifeTime: jest.fn().mockResolvedValue({}) };
    service = new Nowpayments(subscription as any);
  });

  afterAll(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });

  it('pagamento do proprio pedido vira vitalicio para a org assinada na URL', async () => {
    await service.processPayment(path(), {
      order_id: 'org-a_abc12',
      payment_status: 'finished',
    } as any);

    expect(subscription.lifeTime).toHaveBeenCalledWith('org-a', 'abc12', 'PRO');
  });

  it('corpo com outra org que a assinada na URL e ignorado', async () => {
    await service.processPayment(path(), {
      order_id: 'org-b_zzz99',
      payment_status: 'finished',
    } as any);

    expect(subscription.lifeTime).not.toHaveBeenCalled();
  });

  it('URL com token invalido nao concede', async () => {
    await service.processPayment('nao-e-jwt', {
      order_id: 'org-a_abc12',
      payment_status: 'finished',
    } as any);

    expect(subscription.lifeTime).not.toHaveBeenCalled();
  });

  it('pagamento ainda nao confirmado nao concede', async () => {
    await service.processPayment(path(), {
      order_id: 'org-a_abc12',
      payment_status: 'waiting',
    } as any);

    expect(subscription.lifeTime).not.toHaveBeenCalled();
  });
});
