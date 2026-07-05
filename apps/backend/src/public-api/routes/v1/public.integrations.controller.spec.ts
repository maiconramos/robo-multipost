import { HttpException } from '@nestjs/common';

jest.mock('./public.integrations.controller', () => {
  const actual = jest.requireActual('./public.integrations.controller');
  return actual;
}, { virtual: false });

jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: jest.fn(),
  socialIntegrationList: [],
}));

jest.mock('nostr-tools', () => ({}));

// Sem mockar o Sentry, `Sentry.metrics.count` real abre um agregador de
// metricas com timer de flush, e o worker do Jest nao encerra graciosamente.
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));

// `ioRedis` e instanciado no import do controller (conexao com reconnect
// timer); mockamos para nao deixar handle aberto no teardown.
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { set: jest.fn(), get: jest.fn() },
}));

// Preservamos os demais exports (ex.: o decorator `IsSafeWebhookUrl`, usado
// por DTOs transitivos) e sobrescrevemos apenas a checagem SSRF para evitar
// DNS real no teste.
jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator', () => ({
  ...jest.requireActual(
    '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator'
  ),
  isSafePublicHttpsUrl: jest.fn().mockResolvedValue(true),
}));

jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  ssrfSafeDispatcher: {},
}));

jest.mock('@gitroom/nestjs-libraries/upload/allowed.upload.mime', () => ({
  detectAllowedUploadMime: jest.fn().mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' }),
}));

import { PublicIntegrationsController } from './public.integrations.controller';

const makeIntegrationService = () => ({
  getIntegrationsList: jest.fn().mockResolvedValue([]),
});

const makeMediaService = () => ({
  saveFile: jest.fn().mockResolvedValue({ id: 'media-1', path: '/uploads/x.jpg' }),
});

describe('PublicIntegrationsController - listIntegration', () => {
  let controller: PublicIntegrationsController;
  let integrationService: ReturnType<typeof makeIntegrationService>;

  beforeEach(() => {
    integrationService = makeIntegrationService();
    controller = new PublicIntegrationsController(
      integrationService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('chave de perfil sem profileId: usa publicApiProfileId como filtro', async () => {
    await controller.listIntegration({ id: 'org-1' } as any, 'prof-1', undefined);

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith('org-1', 'prof-1');
  });

  it('chave de perfil com profileId igual: passa (200)', async () => {
    await controller.listIntegration({ id: 'org-1' } as any, 'prof-1', 'prof-1');

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith('org-1', 'prof-1');
  });

  it('chave de perfil com profileId diferente: lanca 403', async () => {
    await expect(
      controller.listIntegration({ id: 'org-1' } as any, 'prof-1', 'prof-OUTRO')
    ).rejects.toBeInstanceOf(HttpException);
    expect(integrationService.getIntegrationsList).not.toHaveBeenCalled();
  });

  it('chave de org sem profileId: retorna tudo (comportamento atual)', async () => {
    await controller.listIntegration({ id: 'org-1' } as any, undefined, undefined);

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith('org-1', undefined);
  });
});

describe('PublicIntegrationsController - upload (escopo por perfil)', () => {
  let controller: PublicIntegrationsController;
  let mediaService: ReturnType<typeof makeMediaService>;

  beforeEach(() => {
    mediaService = makeMediaService();
    controller = new PublicIntegrationsController(
      makeIntegrationService() as any,
      {} as any,
      mediaService as any,
      {} as any,
      {} as any,
      {} as any
    );
    // storage e instanciado via UploadFactory.createStorage() no construtor;
    // sobrescrevemos com um mock para nao tocar disco/rede no teste.
    (controller as any).storage = {
      uploadFile: jest
        .fn()
        .mockResolvedValue({ originalname: 'x.jpg', path: '/uploads/x.jpg' }),
    };
  });

  it('uploadSimple com chave de perfil: vincula a midia ao perfil', async () => {
    await controller.uploadSimple(
      { id: 'org-1' } as any,
      'prof-1',
      { originalname: 'x.jpg' } as any
    );

    expect(mediaService.saveFile).toHaveBeenCalledWith(
      'org-1',
      'x.jpg',
      '/uploads/x.jpg',
      undefined,
      'prof-1'
    );
  });

  it('uploadSimple com chave de org: profileId undefined (sem escopo, comportamento atual)', async () => {
    await controller.uploadSimple(
      { id: 'org-1' } as any,
      undefined,
      { originalname: 'x.jpg' } as any
    );

    expect(mediaService.saveFile).toHaveBeenCalledWith(
      'org-1',
      'x.jpg',
      '/uploads/x.jpg',
      undefined,
      undefined
    );
  });

  it('uploadSimple sem arquivo: lanca 400 e nao salva', async () => {
    await expect(
      controller.uploadSimple({ id: 'org-1' } as any, 'prof-1', undefined as any)
    ).rejects.toBeInstanceOf(HttpException);
    expect(mediaService.saveFile).not.toHaveBeenCalled();
  });

  it('uploadsFromUrl com chave de perfil: vincula a midia ao perfil', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    (global as any).fetch = fetchMock;

    await controller.uploadsFromUrl(
      { id: 'org-1' } as any,
      'prof-1',
      { url: 'https://cdn.example.com/x.jpg' } as any
    );

    expect(mediaService.saveFile).toHaveBeenCalledWith(
      'org-1',
      'x.jpg',
      '/uploads/x.jpg',
      undefined,
      'prof-1'
    );
  });
});

const makePostsService = () => ({
  getPosts: jest.fn().mockResolvedValue([]),
  getPost: jest.fn(),
  deletePost: jest.fn().mockResolvedValue({ id: 'post-1' }),
  mapTypeToPost: jest.fn(),
  createPost: jest.fn().mockResolvedValue([]),
  checkPostAnalytics: jest.fn().mockResolvedValue([]),
  findFreeDateTime: jest.fn().mockResolvedValue('2026-07-05T10:00:00'),
});

describe('PublicIntegrationsController - posts (escopo por perfil)', () => {
  let controller: PublicIntegrationsController;
  let postsService: ReturnType<typeof makePostsService>;
  let integrationService: any;

  beforeEach(() => {
    postsService = makePostsService();
    integrationService = {
      ...makeIntegrationService(),
      validateIntegrationProfile: jest.fn().mockResolvedValue(undefined),
      checkAnalytics: jest.fn().mockResolvedValue([]),
    };
    controller = new PublicIntegrationsController(
      integrationService as any,
      postsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('chave de perfil lista apenas posts do proprio perfil', async () => {
    const query = { startDate: 'a', endDate: 'b' } as any;

    await controller.getPosts({ id: 'org-1' } as any, 'prof-1', query);

    expect(postsService.getPosts).toHaveBeenCalledWith('org-1', query, 'prof-1');
  });

  it('chave de perfil com query profileId divergente: lanca 403', async () => {
    const query = { startDate: 'a', endDate: 'b', profileId: 'prof-OUTRO' } as any;

    await expect(
      controller.getPosts({ id: 'org-1' } as any, 'prof-1', query)
    ).rejects.toBeInstanceOf(HttpException);
    expect(postsService.getPosts).not.toHaveBeenCalled();
  });

  it('chave de org continua listando org-wide', async () => {
    const query = { startDate: 'a', endDate: 'b' } as any;

    await controller.getPosts({ id: 'org-1' } as any, undefined, query);

    expect(postsService.getPosts).toHaveBeenCalledWith('org-1', query, undefined);
  });

  it('chave de perfil nao cria post em canal de outro perfil', async () => {
    postsService.mapTypeToPost.mockResolvedValue({
      posts: [{ integration: { id: 'int-1' } }],
    });
    integrationService.validateIntegrationProfile.mockRejectedValue(
      new Error('Integration does not belong to this profile')
    );

    await expect(
      controller.createPost({ id: 'org-1' } as any, 'prof-1', { type: 'now' })
    ).rejects.toThrow('Integration does not belong to this profile');
    expect(postsService.createPost).not.toHaveBeenCalled();
  });

  it('chave de perfil cria post estampado com o proprio perfil', async () => {
    postsService.mapTypeToPost.mockResolvedValue({
      posts: [{ integration: { id: 'int-1' } }],
    });

    await controller.createPost({ id: 'org-1' } as any, 'prof-1', { type: 'now' });

    expect(integrationService.validateIntegrationProfile).toHaveBeenCalledWith(
      'org-1',
      'int-1',
      'prof-1'
    );
    expect(postsService.createPost).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ type: 'now' }),
      'prof-1'
    );
  });

  it('chave de perfil nao exclui post de outro perfil (404)', async () => {
    postsService.getPost.mockResolvedValue({
      group: 'grp-1',
      posts: [{ id: 'post-1', profileId: 'prof-OUTRO' }],
    });

    await expect(
      controller.deletePost({ id: 'org-1' } as any, 'prof-1', 'post-1')
    ).rejects.toBeInstanceOf(HttpException);
    expect(postsService.deletePost).not.toHaveBeenCalled();
  });

  it('chave de perfil exclui post do proprio perfil com escopo', async () => {
    postsService.getPost.mockResolvedValue({
      group: 'grp-1',
      posts: [{ id: 'post-1', profileId: 'prof-1' }],
    });

    await controller.deletePost({ id: 'org-1' } as any, 'prof-1', 'post-1');

    expect(postsService.deletePost).toHaveBeenCalledWith('org-1', 'grp-1', 'prof-1');
  });

  it('analytics de canal repassa o perfil da chave', async () => {
    await controller.getAnalytics(
      { id: 'org-1' } as any,
      'prof-1',
      'int-1',
      '7'
    );

    expect(integrationService.checkAnalytics).toHaveBeenCalledWith(
      { id: 'org-1' },
      'int-1',
      '7',
      false,
      'prof-1'
    );
  });

  it('analytics de post repassa o perfil da chave', async () => {
    await controller.getPostAnalytics(
      { id: 'org-1' } as any,
      'prof-1',
      'post-1',
      '7'
    );

    expect(postsService.checkPostAnalytics).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      7,
      false,
      'prof-1'
    );
  });

  it('find-slot valida o canal contra o perfil da chave', async () => {
    await controller.findSlotIntegration(
      { id: 'org-1' } as any,
      'prof-1',
      'int-1'
    );

    expect(integrationService.validateIntegrationProfile).toHaveBeenCalledWith(
      'org-1',
      'int-1',
      'prof-1'
    );
    expect(postsService.findFreeDateTime).toHaveBeenCalledWith(
      'org-1',
      'int-1',
      'prof-1'
    );
  });
});
