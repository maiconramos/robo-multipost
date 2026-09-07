jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class NotificationServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class WebhooksServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/flows/flows.service',
  () => ({ FlowsService: class FlowsServiceMock {} })
);
jest.mock('@gitroom/helpers/utils/strip.html.validation', () => ({
  stripHtmlValidation: jest.fn((_editor: unknown, content: string) => content),
}));
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({
    ssrfSafeFetch: jest.fn(),
  })
);

import { createMock } from '@gitroom/nestjs-libraries/test';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { TemporalService } from 'nestjs-temporal-core';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { FlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows/flows.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { PostActivity } from './post.activity';

const integration = {
  id: 'integration-1',
  internalId: 'ig-1',
  organizationId: 'org-1',
  profileId: 'profile-1',
  providerIdentifier: 'instagram',
  token: 'enc:v1:ciphertext',
  refreshToken: 'enc:v1:refresh-ciphertext',
  customInstanceDetails: '{"password":"must-not-enter-history"}',
};

const post = {
  id: 'post-1',
  content: '<p>Teste</p>',
  settings: '{}',
  image: '[]',
};

const buildActivity = () => {
  const postService = createMock<PostsService>();
  const notificationService = createMock<NotificationService>();
  const integrationManager = createMock<IntegrationManager>();
  const integrationService = createMock<IntegrationService>();
  const refreshIntegrationService = createMock<RefreshIntegrationService>();
  const webhooksService = createMock<WebhooksService>();
  const start = jest.fn().mockResolvedValue(undefined);
  const signalWithStart = jest.fn().mockResolvedValue(undefined);
  const temporalService = {
    client: {
      getRawClient: jest.fn().mockReturnValue({
        workflow: { start, signalWithStart },
      }),
    },
  } as unknown as TemporalService;
  const subscriptionService = createMock<SubscriptionService>();
  const flowsService = createMock<FlowsService>();
  const encryption = createMock<EncryptionService>();
  const provider = {
    editor: 'normal',
    convertToJPEG: false,
    post: jest.fn(),
    postPending: jest.fn(),
    checkPostStatus: jest.fn(),
    finalizePost: jest.fn(),
  };

  integrationManager.getSocialIntegration.mockReturnValue(provider as any);
  integrationService.getIntegrationById.mockResolvedValue(integration as any);
  postService.updateTags.mockResolvedValue([post] as any);
  postService.updateMedia.mockResolvedValue([] as any);
  encryption.decrypt.mockReturnValue('plain-token');
  const activity = new PostActivity(
    postService,
    notificationService,
    integrationManager,
    integrationService,
    refreshIntegrationService,
    webhooksService,
    temporalService,
    subscriptionService,
    flowsService,
    encryption
  );

  return {
    activity,
    postService,
    integrationService,
    provider,
    encryption,
    start,
    signalWithStart,
  };
};

describe('PostActivity V112', () => {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterAll(() => {
    if (stripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = stripeSecret;
    }
  });

  it('publica pelo contrato pending sem expor o token cifrado ao provider', async () => {
    const { activity, provider, encryption } = buildActivity();
    provider.postPending.mockResolvedValue([
      {
        id: 'post-1',
        postId: '',
        releaseURL: '',
        status: 'pending',
        pendingData: { containerId: 'container-1' },
      },
    ]);

    await expect(
      activity.postSocialPending('org-1', 'integration-1', [post as any])
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'pending',
        pendingData: { containerId: 'container-1' },
      }),
    ]);

    expect(encryption.decrypt).toHaveBeenCalledWith('ciphertext');
    expect(provider.postPending).toHaveBeenCalledWith(
      'ig-1',
      'plain-token',
      expect.any(Array),
      expect.objectContaining({ token: 'plain-token' })
    );
  });

  it('usa o post legado quando o provider ainda nao implementou pending', async () => {
    const { activity, provider } = buildActivity();
    provider.postPending = undefined as any;
    provider.post.mockResolvedValue([
      {
        id: 'post-1',
        postId: 'remote-1',
        releaseURL: 'https://example.com/post',
        status: 'success',
      },
    ]);

    await activity.postSocialPending('org-1', 'integration-1', [post as any]);

    expect(provider.post).toHaveBeenCalledWith(
      'ig-1',
      'plain-token',
      expect.any(Array),
      expect.objectContaining({ token: 'plain-token' })
    );
  });

  it('descriptografa novamente antes de consultar ou finalizar', async () => {
    const { activity, provider } = buildActivity();
    provider.checkPostStatus.mockResolvedValue({
      status: 'ready',
      pendingData: { containerId: 'container-1' },
    });
    provider.finalizePost.mockResolvedValue({
      status: 'completed',
      postId: 'remote-1',
      releaseURL: 'https://example.com/post',
    });

    await activity.checkPostStatus('org-1', 'integration-1', {
      containerId: 'container-1',
    });
    await activity.finalizePost('org-1', 'integration-1', {
      containerId: 'container-1',
    });

    expect(provider.checkPostStatus).toHaveBeenCalledWith(
      'plain-token',
      { containerId: 'container-1' },
      expect.objectContaining({ token: 'plain-token' })
    );
    expect(provider.finalizePost).toHaveBeenCalledWith(
      'plain-token',
      { containerId: 'container-1' },
      expect.objectContaining({ token: 'plain-token' })
    );
  });

  it('retorna somente sucesso sanitizado ao workflow depois do refresh', async () => {
    const { activity } = buildActivity();
    const refresh = (activity as any)._refreshIntegrationService;
    refresh.refresh.mockResolvedValue({
      accessToken: 'plain-token-that-must-not-enter-history',
    });

    await expect(
      activity.refreshTokenForWorkflow('org-1', 'integration-1', 'expired')
    ).resolves.toBe(true);
  });

  it('recusa pendingData com credencial antes de persistir no historico', async () => {
    const { activity, provider } = buildActivity();
    provider.postPending.mockResolvedValue([
      {
        id: 'post-1',
        postId: '',
        releaseURL: '',
        status: 'pending',
        pendingData: { accessToken: 'must-not-reach-temporal' },
      },
    ]);

    await expect(
      activity.postSocialPending('org-1', 'integration-1', [post as any])
    ).rejects.toThrow(
      'Pending post state contains a forbidden credential field'
    );
  });

  it('nao retorna post excluido ou de perfil cancelado ao workflow', async () => {
    const { activity, postService } = buildActivity();
    postService.getPostsRecursively.mockResolvedValue([]);

    await expect(activity.getPostV112('org-1', 'post-1')).resolves.toBe(false);
    expect(postService.getPostsRecursively).toHaveBeenCalledWith(
      'post-1',
      true,
      'org-1',
      true
    );
  });

  it('devolve ao workflow apenas metadados seguros da integracao', async () => {
    const { activity, postService } = buildActivity();
    postService.getPostsRecursively.mockResolvedValue([
      {
        ...post,
        error: 'request body access_token=must-not-enter-history',
        childrenPost: [{ error: 'nested-secret' }],
        integration,
      },
    ] as any);

    const result = await activity.getPostV112('org-1', 'post-1');

    expect((result as any).integration).toEqual({
      id: 'integration-1',
      organizationId: 'org-1',
      profileId: 'profile-1',
      providerIdentifier: 'instagram',
      name: undefined,
      disabled: undefined,
      refreshNeeded: undefined,
    });
    expect(result).not.toHaveProperty('error');
    expect(result).not.toHaveProperty('childrenPost');
  });

  it('respeita o canario V112 ao recuperar posts ausentes', async () => {
    const previous = process.env.POST_WORKFLOW_V112_INTEGRATION_IDS;
    process.env.POST_WORKFLOW_V112_INTEGRATION_IDS = 'integration-1';
    const { activity, postService, signalWithStart } = buildActivity();
    postService.searchForMissingThreeHoursPosts.mockResolvedValue([
      {
        id: 'post-1',
        organizationId: 'org-1',
        integration: {
          id: 'integration-1',
          providerIdentifier: 'instagram',
        },
      },
    ] as any);

    try {
      await activity.searchForMissingThreeHoursPosts();
    } finally {
      if (previous === undefined) {
        delete process.env.POST_WORKFLOW_V112_INTEGRATION_IDS;
      } else {
        process.env.POST_WORKFLOW_V112_INTEGRATION_IDS = previous;
      }
    }

    expect(signalWithStart).toHaveBeenCalledWith(
      'postWorkflowV112',
      expect.objectContaining({ workflowId: 'post_post-1' })
    );
  });
});
