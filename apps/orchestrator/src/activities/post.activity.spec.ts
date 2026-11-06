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
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import {
  BadBody,
  PublishedWithError,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { ssrfSafeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

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
    webhooksService,
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

// Porte do upstream 23beddcd: post no ar com falha num passo seguinte.
describe('PostActivity - PublishedWithError', () => {
  const published = () =>
    new PublishedWithError(
      'youtube',
      'post-1',
      'vid-1',
      'https://www.youtube.com/watch?v=vid-1',
      'Video publicado, miniatura recusada'
    );

  it('V112 guarda o link do post e falha como BadBody', async () => {
    const { activity, provider, postService } = buildActivity();
    provider.postPending = undefined as any;
    provider.post.mockRejectedValue(published());

    const err = await activity
      .postSocialPending('org-1', 'integration-1', [post as any])
      .catch((e) => e);

    expect(err).toBeInstanceOf(BadBody);
    expect(err.message).toBe('Video publicado, miniatura recusada');
    expect(postService.updatePublishedRelease).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      'vid-1',
      'https://www.youtube.com/watch?v=vid-1'
    );
  });

  it('V102 faz o mesmo e falha como BadBody mesmo se gravar o link falhar', async () => {
    const { activity, provider, postService } = buildActivity();
    provider.post.mockRejectedValue(published());
    postService.updatePublishedRelease.mockRejectedValue(new Error('db'));

    await expect(
      activity.postSocial({ ...integration } as any, [post as any])
    ).rejects.toBeInstanceOf(BadBody);
    expect(postService.updatePublishedRelease).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      'vid-1',
      'https://www.youtube.com/watch?v=vid-1'
    );
  });

  it('V112 com postPending tambem guarda o link', async () => {
    const { activity, provider, postService } = buildActivity();
    provider.postPending.mockRejectedValue(published());

    await expect(
      activity.postSocialPending('org-1', 'integration-1', [post as any])
    ).rejects.toBeInstanceOf(BadBody);
    expect(postService.updatePublishedRelease).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      'vid-1',
      'https://www.youtube.com/watch?v=vid-1'
    );
  });

  it('outros erros seguem sem gravar link', async () => {
    const { activity, provider, postService } = buildActivity();
    provider.postPending = undefined as any;
    const boom = new Error('rede');
    provider.post.mockRejectedValue(boom);

    await expect(
      activity.postSocialPending('org-1', 'integration-1', [post as any])
    ).rejects.toBe(boom);
    expect(postService.updatePublishedRelease).not.toHaveBeenCalled();
  });
});

describe('PostActivity Zernio aceito', () => {
  it('retorna aceite para tornar resultado duravel antes da escrita de suporte', async () => {
    const { activity, provider, integrationService, postService } =
      buildActivity();
    integrationService.getIntegrationById.mockResolvedValue({
      ...integration,
      providerIdentifier: 'zernio-tiktok',
    } as any);
    provider.postPending.mockResolvedValue([
      {
        id: 'post-1',
        postId: 'zernio-accepted',
        releaseURL: '',
        status: 'pending',
        pendingData: { postId: 'zernio-accepted' },
      },
    ]);
    await activity.postSocialPending('org-1', 'integration-1', [post] as any);
    expect(postService.updatePublishedRelease).not.toHaveBeenCalled();
    expect(provider.checkPostStatus).not.toHaveBeenCalled();
  });
  it('atividade de suporte repete apenas a escrita sem enviar novamente', async () => {
    const { activity, provider, postService } = buildActivity();
    postService.updatePublishedRelease.mockRejectedValueOnce(
      new Error('db temporarily offline')
    );
    await expect(
      activity.recordAcceptedPost('org-1', 'post-1', 'remote', '')
    ).rejects.toThrow('db temporarily offline');
    await activity.recordAcceptedPost('org-1', 'post-1', 'remote', '');
    expect(postService.updatePublishedRelease).toHaveBeenCalledTimes(2);
    expect(provider.postPending).not.toHaveBeenCalled();
  });
});

// Porte do upstream #2087: os workflows passam o id do post na plataforma; o
// canal vai junto para o fallback do releaseId montar o payload.
describe('PostActivity.sendWebhooks', () => {
  beforeEach(() => {
    (ssrfSafeFetch as jest.Mock).mockReset().mockResolvedValue({ status: 200 });
  });

  it('busca o post pelo id da plataforma e pelo canal e envia o payload', async () => {
    const { activity, postService, webhooksService } = buildActivity();
    const payload = [{ id: 'post-1', releaseURL: 'https://x.com/1' }];
    webhooksService.getWebhooks.mockResolvedValue([
      { url: 'https://hooks.example/all', integrations: [] },
      {
        url: 'https://hooks.example/canal',
        integrations: [{ integration: { id: 'integration-1' } }],
      },
      {
        url: 'https://hooks.example/outro',
        integrations: [{ integration: { id: 'integration-2' } }],
      },
    ] as any);
    postService.getPostByForWebhookId.mockResolvedValue(payload as any);

    await activity.sendWebhooks('1789', 'org-1', 'integration-1');

    expect(postService.getPostByForWebhookId).toHaveBeenCalledWith(
      '1789',
      'integration-1'
    );
    expect((ssrfSafeFetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual(
      ['https://hooks.example/all', 'https://hooks.example/canal']
    );
    expect((ssrfSafeFetch as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
  });

  it('falha de um webhook nao impede os demais', async () => {
    const { activity, postService, webhooksService } = buildActivity();
    webhooksService.getWebhooks.mockResolvedValue([
      { url: 'https://hooks.example/a', integrations: [] },
      { url: 'https://hooks.example/b', integrations: [] },
    ] as any);
    postService.getPostByForWebhookId.mockResolvedValue([] as any);
    (ssrfSafeFetch as jest.Mock)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce({ status: 200 });

    await expect(
      activity.sendWebhooks('1789', 'org-1', 'integration-1')
    ).resolves.toBeDefined();
    expect(ssrfSafeFetch).toHaveBeenCalledTimes(2);
  });
});

// imagem inline (upstream 2aae02fe): a conversao do conteudo so mantem <img>
// para o provider que declara inlineImages (WordPress, ListMonk), com as
// settings do post.
describe('PostActivity imagem inline', () => {
  const strip = stripHtmlValidation as jest.Mock;

  beforeEach(() => strip.mockClear());

  const inlineArg = () => strip.mock.calls[0][6];

  it('V112 passa inlineImages com as settings do post', async () => {
    const { activity, provider, postService } = buildActivity();
    const inlineImages = jest.fn().mockReturnValue(true);
    Object.assign(provider, { editor: 'html', inlineImages });
    const withSettings = { ...post, settings: '{"title":"t"}' };
    postService.updateTags.mockResolvedValue([withSettings] as any);
    provider.postPending.mockResolvedValue([
      { id: 'post-1', postId: 'r', releaseURL: '', status: 'completed' },
    ]);

    await activity.postSocialPending('org-1', 'integration-1', [
      withSettings as any,
    ]);

    expect(inlineImages).toHaveBeenCalledWith({ title: 't' });
    expect(inlineArg()).toBe(true);
  });

  it('V102 tambem passa inlineImages', async () => {
    const { activity, provider } = buildActivity();
    Object.assign(provider, { inlineImages: () => true });
    provider.post.mockResolvedValue([
      { id: 'post-1', postId: 'r', releaseURL: '', status: 'success' },
    ]);

    await activity.postSocial({ ...integration } as any, [post as any]);

    expect(inlineArg()).toBe(true);
  });

  it('provider sem inlineImages recebe false (texto sem <img>)', async () => {
    const { activity, provider } = buildActivity();
    provider.postPending.mockResolvedValue([
      { id: 'post-1', postId: 'r', releaseURL: '', status: 'completed' },
    ]);

    await activity.postSocialPending('org-1', 'integration-1', [post as any]);

    expect(inlineArg()).toBe(false);
  });
});

describe('PostActivity V102 - snapshots de organizacao excluida', () => {
  it.each([
    ['ausente', null],
    ['desativado', { ...integration, disabled: true }],
    [
      'excluido',
      { ...integration, deletedAt: new Date('2026-10-29T12:00:00Z') },
    ],
  ])(
    'postSocial recusa canal %s antes de provider ou decifragem',
    async (_label, live) => {
      const {
        activity,
        integrationService,
        provider,
        encryption,
        postService,
      } = buildActivity();
      integrationService.getIntegrationById.mockResolvedValue(live as any);
      await expect(
        activity.postSocial({ ...integration } as any, [post as any])
      ).rejects.toMatchObject({
        nonRetryable: true,
        type: 'ChannelUnavailable',
      });
      expect(integrationService.getIntegrationById).toHaveBeenCalledWith(
        'org-1',
        'integration-1'
      );
      expect(provider.post).not.toHaveBeenCalled();
      expect(encryption.decrypt).not.toHaveBeenCalled();
      expect(postService.updateTags).not.toHaveBeenCalled();
    }
  );
  it.each([
    ['ausente', null],
    ['desativado', { ...integration, disabled: true }],
    [
      'excluido',
      { ...integration, deletedAt: new Date('2026-10-29T12:00:00Z') },
    ],
  ])(
    'postComment recusa canal %s mesmo com credencial no historico',
    async (_label, live) => {
      const {
        activity,
        integrationService,
        provider,
        encryption,
        postService,
      } = buildActivity();
      const comment = jest.fn();
      (provider as any).comment = comment;
      integrationService.getIntegrationById.mockResolvedValue(live as any);
      await expect(
        activity.postComment(
          'released-post',
          undefined,
          { ...integration } as any,
          [post as any]
        )
      ).rejects.toMatchObject({
        nonRetryable: true,
        type: 'ChannelUnavailable',
      });
      expect(integrationService.getIntegrationById).toHaveBeenCalledWith(
        'org-1',
        'integration-1'
      );
      expect(comment).not.toHaveBeenCalled();
      expect(encryption.decrypt).not.toHaveBeenCalled();
      expect(postService.updateTags).not.toHaveBeenCalled();
    }
  );
});

describe('PostActivity V112 canal indisponivel', () => {
  it.each([
    null,
    { ...integration, disabled: true },
    { ...integration, deletedAt: new Date() },
  ])(
    'recusa canal antes de publicar com credencial armazenada',
    async (live) => {
      const { activity, integrationService, provider, encryption } =
        buildActivity();
      integrationService.getIntegrationById.mockResolvedValue(live as any);
      await expect(
        activity.postSocialPending('org-1', 'integration-1', [post as any])
      ).rejects.toMatchObject({
        type: 'ChannelUnavailable',
        nonRetryable: true,
      });
      expect(provider.postPending).not.toHaveBeenCalled();
      expect(provider.post).not.toHaveBeenCalled();
      expect(encryption.decrypt).not.toHaveBeenCalled();
    }
  );
});

describe('PostActivity guarda Stories com comentarios', () => {
  it.each([
    'postSocialPending',
    'postSocial',
    'postCommentV112',
    'postComment',
  ])('recusa %s antes de tags, midias ou provider', async (method) => {
    const { activity, postService, provider } = buildActivity();
    postService.unsupportedCommentThreadError.mockResolvedValue(
      'Stories do Facebook: remova os comentarios.'
    );
    const run =
      method === 'postSocialPending'
        ? activity.postSocialPending('org-1', 'integration-1', [post as any])
        : method === 'postSocial'
        ? activity.postSocial({ ...integration } as any, [post as any])
        : method === 'postCommentV112'
        ? activity.postCommentV112(
            'remote',
            undefined,
            'org-1',
            'integration-1',
            [post as any]
          )
        : activity.postComment('remote', undefined, { ...integration } as any, [
            post as any,
          ]);
    await expect(run).rejects.toThrow(
      'Stories do Facebook: remova os comentarios.'
    );
    expect(postService.updateTags).not.toHaveBeenCalled();
    expect(postService.updateMedia).not.toHaveBeenCalled();
    expect(provider.post).not.toHaveBeenCalled();
    expect(provider.postPending).not.toHaveBeenCalled();
  });
});
