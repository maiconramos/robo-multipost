jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/services/stripe.service', () => ({
  StripeService: class StripeServiceMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class NotificationServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/crypto/nowpayments', () => ({
  Nowpayments: class NowpaymentsMock {},
}));

import { BillingController } from './billing.controller';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

const policiesOf = (method: keyof BillingController) =>
  Reflect.getMetadata(CHECK_POLICIES_KEY, BillingController.prototype[method]);

describe('BillingController - so administrador mexe na assinatura', () => {
  it.each([
    'applyDiscount',
    'finishTrial',
    'embedded',
    'subscribe',
    'modifyPayment',
    'cancel',
    'prorate',
    'lifetime',
    'crypto',
  ] as Array<keyof BillingController>)('%s exige Sections.ADMIN', (method) => {
    expect(policiesOf(method)).toEqual([
      [AuthorizationActions.Create, Sections.ADMIN],
    ]);
  });

  it('leitura do plano continua aberta para membros', () => {
    expect(policiesOf('getCurrentBilling')).toBeUndefined();
  });
});

describe('BillingController.cancel - e-mail ao operador', () => {
  it('escapa o HTML do nome da org e do motivo', async () => {
    const notification = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const stripe = { setToCancel: jest.fn().mockResolvedValue({}) };
    const controller = new BillingController(
      {} as any,
      stripe as any,
      notification as any,
      {} as any
    );

    await controller.cancel(
      { id: 'org-1', name: '<b>ACME</b>' } as any,
      { email: 'a@b.com' } as any,
      { feedback: '<a href="https://phish">clique</a>' }
    );

    const html = notification.sendEmail.mock.calls[0][2];
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;a href=&quot;https://phish&quot;&gt;');
    expect(stripe.setToCancel).toHaveBeenCalledWith('org-1');
  });
});
