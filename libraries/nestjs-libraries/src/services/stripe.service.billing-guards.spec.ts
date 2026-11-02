// StripeService importa SubscriptionService/OrganizationService/UsersService,
// que cascateiam ate nostr-tools (ESM-only); nada disso e usado aqui.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class OrganizationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class UsersServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({
  TrackService: class TrackServiceMock {},
}));

import { StripeService, isLifetimeCodeFormat } from './stripe.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

const build = () => {
  const subscription = {
    getSubscriptionByOrganizationId: jest.fn().mockResolvedValue(null),
    getCode: jest.fn().mockResolvedValue(null),
    createOrUpdateSubscription: jest.fn().mockResolvedValue({}),
  };
  const service = new StripeService(
    subscription as any,
    {} as any,
    {} as any,
    {} as any
  );
  return { service, subscription };
};

describe('StripeService.applyDiscount', () => {
  it('nao aplica o cupom quando a assinatura nao e elegivel', async () => {
    const { service } = build();
    jest.spyOn(service, 'checkDiscount').mockResolvedValue(false);

    await expect(service.applyDiscount('cus_1')).resolves.toBe(false);
  });
});

describe('StripeService.lifetimeDeal', () => {
  let decryptSpy: jest.SpyInstance;
  afterEach(() => decryptSpy?.mockRestore());

  it('recusa bloco qualquer com padding valido (sem o formato do codigo)', async () => {
    const { service, subscription } = build();
    decryptSpy = jest
      .spyOn(AuthService, 'fixedDecryption')
      .mockReturnValue('\u0007ÿxz');

    await expect(service.lifetimeDeal('org-1', 'abcd')).resolves.toEqual({ success: false });
    expect(subscription.createOrUpdateSubscription).not.toHaveBeenCalled();
  });

  it('aceita codigo no formato emitido pelo CodesService', async () => {
    const { service, subscription } = build();
    decryptSpy = jest
      .spyOn(AuthService, 'fixedDecryption')
      .mockReturnValue('appsumo-token:42');

    await expect(service.lifetimeDeal('org-1', 'abcd')).resolves.toEqual({ success: true });
    expect(subscription.createOrUpdateSubscription).toHaveBeenCalled();
  });
});

describe('isLifetimeCodeFormat', () => {
  it.each([
    ['token:0', true],
    ['token:9999', true],
    ['token:10000', false],
    ['token', false],
    ['tok\u0001en:1', false],
    [123, false],
  ])('%p -> %p', (value, expected) => {
    expect(isLifetimeCodeFormat(value)).toBe(expected);
  });
});
