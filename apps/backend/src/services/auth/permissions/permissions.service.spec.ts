// integration.manager puxa todos os providers sociais (nostr-tools e ESM e
// quebra o ts-jest); mock segue o padrao dos demais specs do backend.
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({})
);

import { PermissionsService } from './permissions.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { AuthorizationActions, Sections } from './permission.exception.class';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let subscriptions: ReturnType<typeof createMock<SubscriptionService>>;
  const originalStripeKey = process.env.STRIPE_PUBLISHABLE_KEY;

  beforeEach(() => {
    subscriptions = createMock<SubscriptionService>();
    subscriptions.getSubscriptionByOrganizationId.mockResolvedValue(
      null as any
    );
    service = new PermissionsService(
      subscriptions as any,
      createMock<PostsService>() as any,
      createMock<IntegrationService>() as any,
      createMock<WebhooksService>() as any
    );
  });

  afterEach(() => {
    if (originalStripeKey === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    } else {
      process.env.STRIPE_PUBLISHABLE_KEY = originalStripeKey;
    }
  });

  describe('check - secao ADMIN sem stripe', () => {
    beforeEach(() => {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    });

    it('nega admin para role USER mesmo sem stripe configurado', async () => {
      const ability = await service.check('org-1', new Date(), 'USER', [
        [AuthorizationActions.Create, Sections.ADMIN],
      ]);

      expect(ability.can(AuthorizationActions.Create, Sections.ADMIN)).toBe(
        false
      );
    });

    it('concede admin para role ADMIN sem stripe configurado', async () => {
      const ability = await service.check('org-1', new Date(), 'ADMIN', [
        [AuthorizationActions.Create, Sections.ADMIN],
      ]);

      expect(ability.can(AuthorizationActions.Create, Sections.ADMIN)).toBe(
        true
      );
    });

    it('concede admin para role SUPERADMIN sem stripe configurado', async () => {
      const ability = await service.check('org-1', new Date(), 'SUPERADMIN', [
        [AuthorizationActions.Create, Sections.ADMIN],
      ]);

      expect(ability.can(AuthorizationActions.Create, Sections.ADMIN)).toBe(
        true
      );
    });

    it('mantem bypass de secoes de tier sem stripe configurado', async () => {
      const ability = await service.check('org-1', new Date(), 'USER', [
        [AuthorizationActions.Create, Sections.CHANNEL],
      ]);

      expect(ability.can(AuthorizationActions.Create, Sections.CHANNEL)).toBe(
        true
      );
    });

    it('separa admin de tier na mesma requisicao para role USER', async () => {
      const ability = await service.check('org-1', new Date(), 'USER', [
        [AuthorizationActions.Create, Sections.CHANNEL],
        [AuthorizationActions.Create, Sections.ADMIN],
      ]);

      expect(ability.can(AuthorizationActions.Create, Sections.CHANNEL)).toBe(
        true
      );
      expect(ability.can(AuthorizationActions.Create, Sections.ADMIN)).toBe(
        false
      );
    });
  });

  describe('check - secao ADMIN com stripe', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake';
    });

    it('nega admin para role USER com stripe configurado', async () => {
      const ability = await service.check('org-1', new Date(), 'USER', [
        [AuthorizationActions.Create, Sections.ADMIN],
      ]);

      expect(ability.can(AuthorizationActions.Create, Sections.ADMIN)).toBe(
        false
      );
    });

    it('concede admin para role ADMIN com stripe configurado', async () => {
      const ability = await service.check('org-1', new Date(), 'ADMIN', [
        [AuthorizationActions.Create, Sections.ADMIN],
      ]);

      expect(ability.can(AuthorizationActions.Create, Sections.ADMIN)).toBe(
        true
      );
    });
  });
});
