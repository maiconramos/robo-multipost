import { HttpException } from '@nestjs/common';
import { PIPES_METADATA } from '@nestjs/common/constants';

jest.mock(
  './public.integrations.controller',
  () => {
    const actual = jest.requireActual('./public.integrations.controller');
    return actual;
  },
  { virtual: false }
);

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
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator',
  () => ({
    ...jest.requireActual(
      '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator'
    ),
    isSafePublicHttpsUrl: jest.fn().mockResolvedValue(true),
  })
);

jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({
    ssrfSafeDispatcher: {},
    ssrfSafeFetch: (...args: Parameters<typeof fetch>) => global.fetch(...args),
  })
);

jest.mock('@gitroom/nestjs-libraries/upload/allowed.upload.mime', () => ({
  detectAllowedUploadMime: jest
    .fn()
    .mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' }),
}));

import { MediaTransferService } from '@gitroom/nestjs-libraries/upload/media-transfer.service';
import { PublicIntegrationsController } from './public.integrations.controller';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { detectAllowedUploadMime } from '@gitroom/nestjs-libraries/upload/allowed.upload.mime';

const mockIsSafePublicHttpsUrl = isSafePublicHttpsUrl as jest.Mock;
const mockDetectAllowedUploadMime = detectAllowedUploadMime as jest.Mock;

const makeIntegrationService = () => ({
  getIntegrationsList: jest.fn().mockResolvedValue([]),
});

const makeMediaService = () => ({
  saveFile: jest
    .fn()
    .mockResolvedValue({ id: 'media-1', path: '/uploads/x.jpg' }),
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
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('chave de perfil sem profileId: usa publicApiProfileId como filtro', async () => {
    await controller.listIntegration(
      { id: 'org-1' } as any,
      'prof-1',
      undefined
    );

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith(
      'org-1',
      'prof-1'
    );
  });

  it('chave de perfil com profileId igual: passa (200)', async () => {
    await controller.listIntegration(
      { id: 'org-1' } as any,
      'prof-1',
      'prof-1'
    );

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith(
      'org-1',
      'prof-1'
    );
  });

  it('chave de perfil com profileId diferente: lanca 403', async () => {
    await expect(
      controller.listIntegration({ id: 'org-1' } as any, 'prof-1', 'prof-OUTRO')
    ).rejects.toBeInstanceOf(HttpException);
    expect(integrationService.getIntegrationsList).not.toHaveBeenCalled();
  });

  it('chave de org sem profileId: retorna tudo (comportamento atual)', async () => {
    await controller.listIntegration(
      { id: 'org-1' } as any,
      undefined,
      undefined
    );

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith(
      'org-1',
      undefined
    );
  });
});

describe('PublicIntegrationsController - upload (escopo por perfil)', () => {
  let controller: PublicIntegrationsController;
  let mediaService: ReturnType<typeof makeMediaService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSafePublicHttpsUrl.mockResolvedValue(true);
    mockDetectAllowedUploadMime.mockResolvedValue({
      mime: 'image/jpeg',
      ext: 'jpg',
    });
    mediaService = makeMediaService();
    const transfer = new MediaTransferService(mediaService as any);
    controller = new PublicIntegrationsController(
      makeIntegrationService() as any,
      {} as any,
      mediaService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      transfer
    );
    // storage e instanciado via UploadFactory.createStorage() no construtor;
    // sobrescrevemos com um mock para nao tocar disco/rede no teste.
    (transfer as any).storage = {
      uploadFromFile: jest
        .fn()
        .mockResolvedValue({ originalname: 'x.jpg', path: '/uploads/x.jpg' }),
      uploadFile: jest
        .fn()
        .mockResolvedValue({ originalname: 'x.jpg', path: '/uploads/x.jpg' }),
    };
  });

  it('mantem validacao por magic bytes no upload multipart publico', () => {
    const pipes = Reflect.getMetadata(
      PIPES_METADATA,
      PublicIntegrationsController.prototype.uploadSimple
    );

    expect(pipes).toEqual(
      expect.arrayContaining([expect.any(CustomFileValidationPipe)])
    );
  });

  it('uploadSimple com chave de perfil: vincula a midia ao perfil', async () => {
    await controller.uploadSimple({ id: 'org-1' } as any, 'prof-1', {
      originalname: 'x.jpg',
      buffer: Buffer.from([1, 2, 3]),
    } as any);

    expect(mediaService.saveFile).toHaveBeenCalledWith(
      'org-1',
      'x.jpg',
      '/uploads/x.jpg',
      undefined,
      'prof-1'
    );
  });

  it('uploadSimple com chave de org: profileId undefined (sem escopo, comportamento atual)', async () => {
    await controller.uploadSimple({ id: 'org-1' } as any, undefined, {
      originalname: 'x.jpg',
      buffer: Buffer.from([1, 2, 3]),
    } as any);

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
      controller.uploadSimple(
        { id: 'org-1' } as any,
        'prof-1',
        undefined as any
      )
    ).rejects.toBeInstanceOf(HttpException);
    expect(mediaService.saveFile).not.toHaveBeenCalled();
  });

  it('uploadsFromUrl com chave de perfil: vincula a midia ao perfil', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    (global as any).fetch = fetchMock;

    await controller.uploadsFromUrl({ id: 'org-1' } as any, 'prof-1', {
      url: 'https://cdn.example.com/x.jpg',
    } as any);

    expect(mediaService.saveFile).toHaveBeenCalledWith(
      'org-1',
      'x.jpg',
      '/uploads/x.jpg',
      undefined,
      'prof-1'
    );
  });

  it('uploadsFromUrl importa link comum do Drive e preserva perfil e contrato', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      })
    );
    (global as any).fetch = fetchMock;
    await controller.uploadsFromUrl({ id: 'org-1' } as any, 'prof-1', {
      url: 'https://drive.google.com/file/d/testFile12345/view?resourcekey=0-KEY',
    } as any);
    expect(fetchMock.mock.calls[0][0]).toContain(
      'https://drive.google.com/uc?'
    );
    expect(fetchMock.mock.calls[0][0]).toContain('resourcekey=0-KEY');
    expect(mediaService.saveFile).toHaveBeenCalledWith(
      'org-1',
      'x.jpg',
      '/uploads/x.jpg',
      undefined,
      'prof-1'
    );
  });

  it('uploadsFromUrl bloqueia URL insegura antes do fetch', async () => {
    mockIsSafePublicHttpsUrl.mockResolvedValueOnce(false);
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    await expect(
      controller.uploadsFromUrl({ id: 'org-1' } as any, 'prof-1', {
        url: 'http://169.254.169.254/latest/meta-data',
      } as any)
    ).rejects.toMatchObject({ status: 400 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mediaService.saveFile).not.toHaveBeenCalled();
  });

  it('uploadsFromUrl normaliza rejeicao de rede/timeout como 400', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('timeout'));

    await expect(
      controller.uploadsFromUrl({ id: 'org-1' } as any, 'prof-1', {
        url: 'https://cdn.example.com/x.jpg',
      } as any)
    ).rejects.toMatchObject({ status: 400 });

    expect(mediaService.saveFile).not.toHaveBeenCalled();
  });

  it('uploadsFromUrl rejeita Content-Length acima do limite antes de salvar', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        headers: { 'content-length': String(1024 * 1024 * 1024 + 1) },
      })
    );

    await expect(
      controller.uploadsFromUrl({ id: 'org-1' } as any, 'prof-1', {
        url: 'https://cdn.example.com/huge.mp4',
      } as any)
    ).rejects.toMatchObject({ status: 400 });

    expect(mediaService.saveFile).not.toHaveBeenCalled();
  });

  it('uploadsFromUrl rejeita transferencia chunked acima do limite do MIME real', async () => {
    const imageLimit = 10 * 1024 * 1024;
    (global as any).fetch = jest
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(imageLimit + 1)));

    await expect(
      controller.uploadsFromUrl({ id: 'org-1' } as any, 'prof-1', {
        url: 'https://cdn.example.com/large-image.jpg',
      } as any)
    ).rejects.toMatchObject({ status: 400 });

    expect(mediaService.saveFile).not.toHaveBeenCalled();
  });

  it('uploadsFromUrl preserva validacao por magic bytes antes do storage', async () => {
    mockDetectAllowedUploadMime.mockResolvedValueOnce(null);
    (global as any).fetch = jest
      .fn()
      .mockResolvedValue(new Response(Buffer.from('<svg></svg>')));

    await expect(
      controller.uploadsFromUrl({ id: 'org-1' } as any, 'prof-1', {
        url: 'https://cdn.example.com/fake.jpg',
      } as any)
    ).rejects.toMatchObject({ status: 400 });

    expect(mediaService.saveFile).not.toHaveBeenCalled();
  });
});

const makePostsService = () => ({
  getPosts: jest.fn().mockResolvedValue([]),
  getPost: jest.fn(),
  deletePost: jest.fn().mockResolvedValue({ id: 'post-1' }),
  mapTypeToPost: jest.fn(),
  stripEditorOnlyFields: jest.fn((body: any) => ({ ...body, stripped: true })),
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
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('chave de perfil lista apenas posts do proprio perfil', async () => {
    const query = { startDate: 'a', endDate: 'b' } as any;

    await controller.getPosts({ id: 'org-1' } as any, 'prof-1', query);

    expect(postsService.getPosts).toHaveBeenCalledWith(
      'org-1',
      query,
      'prof-1'
    );
  });

  it('chave de perfil com query profileId divergente: lanca 403', async () => {
    const query = {
      startDate: 'a',
      endDate: 'b',
      profileId: 'prof-OUTRO',
    } as any;

    await expect(
      controller.getPosts({ id: 'org-1' } as any, 'prof-1', query)
    ).rejects.toBeInstanceOf(HttpException);
    expect(postsService.getPosts).not.toHaveBeenCalled();
  });

  it('chave de org continua listando org-wide', async () => {
    const query = { startDate: 'a', endDate: 'b' } as any;

    await controller.getPosts({ id: 'org-1' } as any, undefined, query);

    expect(postsService.getPosts).toHaveBeenCalledWith(
      'org-1',
      query,
      undefined
    );
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

  it('remove data por canal e lote antes de mapear o post (so o editor usa)', async () => {
    postsService.mapTypeToPost.mockResolvedValue({ posts: [] });
    const raw = { type: 'now', posts: [{ date: '2026-01-01' }] };

    await controller.createPost({ id: 'org-1' } as any, undefined, raw);

    expect(postsService.stripEditorOnlyFields).toHaveBeenCalledWith(raw);
    expect(postsService.mapTypeToPost.mock.calls[0][0]).toEqual(
      expect.objectContaining({ stripped: true })
    );
  });

  it('chave de perfil cria post estampado com o proprio perfil', async () => {
    postsService.mapTypeToPost.mockResolvedValue({
      posts: [{ integration: { id: 'int-1' } }],
    });

    await controller.createPost({ id: 'org-1' } as any, 'prof-1', {
      type: 'now',
    });

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

    expect(postsService.deletePost).toHaveBeenCalledWith(
      'org-1',
      'grp-1',
      'prof-1'
    );
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

// Rotas por id que so tinham escopo de org: uma chave de perfil operava canais e
// posts de outros perfis da mesma org (achado do security-auditor, 25/10/2026).
describe('PublicIntegrationsController - rotas por id com chave de perfil', () => {
  const org = { id: 'org-1' } as any;
  const build = () => {
    const integrationService = {
      validateIntegrationProfile: jest.fn().mockResolvedValue(undefined),
      getPostsForChannel: jest.fn().mockResolvedValue([]),
      deleteChannel: jest.fn().mockResolvedValue({ id: 'int-1' }),
      getIntegrationById: jest.fn().mockResolvedValue(null),
    };
    const postsService = {
      getMissingContent: jest.fn().mockResolvedValue([]),
      updateReleaseId: jest.fn().mockResolvedValue({ id: 'post-1' }),
    };
    const controller = new PublicIntegrationsController(
      integrationService as any,
      postsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    return { controller, integrationService, postsService };
  };

  it('DELETE /integrations/:id valida o perfil da chave antes de apagar', async () => {
    const { controller, integrationService } = build();
    await controller.deleteChannel(org, 'prof-1', 'int-1');
    expect(integrationService.validateIntegrationProfile).toHaveBeenCalledWith(
      'org-1',
      'int-1',
      'prof-1'
    );
    expect(
      integrationService.validateIntegrationProfile.mock.invocationCallOrder[0]
    ).toBeLessThan(
      integrationService.getPostsForChannel.mock.invocationCallOrder[0]
    );
  });

  it('DELETE /integrations/:id: canal de outro perfil nao apaga', async () => {
    const { controller, integrationService } = build();
    integrationService.validateIntegrationProfile.mockRejectedValue(
      new HttpException('Integration does not belong to this profile', 403)
    );
    await expect(
      controller.deleteChannel(org, 'prof-1', 'int-1')
    ).rejects.toBeInstanceOf(HttpException);
    expect(integrationService.deleteChannel).not.toHaveBeenCalled();
  });

  it('chave de org (sem perfil) nao valida perfil em nenhuma das rotas', async () => {
    const { controller, integrationService } = build();
    await controller.deleteChannel(org, undefined, 'int-1');
    await expect(
      controller.getIntegrationSettings(org, undefined, 'int-x')
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      controller.triggerIntegrationTool(org, undefined, 'int-x', {
        methodName: 'x',
        data: {},
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(
      integrationService.validateIntegrationProfile
    ).not.toHaveBeenCalled();
  });

  it('GET /posts/:id/missing e PUT /posts/:id/release-id repassam o perfil da chave', async () => {
    const { controller, postsService } = build();
    await controller.getMissingContent(org, 'prof-1', 'post-1');
    expect(postsService.getMissingContent).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      false,
      'prof-1'
    );
    await controller.updateReleaseId(org, 'prof-1', 'post-1', {
      releaseId: 'v_pub_url~abc',
    });
    expect(postsService.updateReleaseId).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      'v_pub_url~abc',
      'prof-1'
    );
  });

  it('POST /integration-trigger/:id e GET /integration-settings/:id validam o perfil antes de carregar o canal', async () => {
    const { controller, integrationService } = build();
    integrationService.validateIntegrationProfile.mockRejectedValue(
      new HttpException('x', 403)
    );
    await expect(
      controller.triggerIntegrationTool(org, 'prof-1', 'int-1', {
        methodName: 'x',
        data: {},
      })
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      controller.getIntegrationSettings(org, 'prof-1', 'int-1')
    ).rejects.toBeInstanceOf(HttpException);
    expect(integrationService.getIntegrationById).not.toHaveBeenCalled();
  });
});

// Canal conectado com chave de perfil precisa nascer no perfil da chave: o
// callback (`/integrations/social-connect`) le `profile:${state}`, que so o
// dashboard gravava.
describe('PublicIntegrationsController - getIntegrationUrl (perfil da chave)', () => {
  const build = () => {
    const provider = {
      generateAuthUrl: jest.fn().mockResolvedValue({
        codeVerifier: 'cv',
        state: 'st-1',
        url: 'https://auth.example',
      }),
    };
    const integrationManager = {
      getAllowedSocialsIntegrations: () => ['x'],
      getSocialIntegration: () => provider,
    };
    return new PublicIntegrationsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      integrationManager as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  };

  beforeEach(() => {
    (ioRedis.set as jest.Mock).mockClear();
  });

  it('chave de perfil grava profile:<state> com o perfil da chave', async () => {
    await expect(
      build().getIntegrationUrl('x', '', { id: 'org-1' } as any, 'prof-1')
    ).resolves.toEqual({ url: 'https://auth.example' });

    expect(ioRedis.set).toHaveBeenCalledWith(
      'profile:st-1',
      'prof-1',
      'EX',
      3600
    );
    expect(ioRedis.set).toHaveBeenCalledWith(
      'organization:st-1',
      'org-1',
      'EX',
      3600
    );
  });

  it('chave de organizacao nao grava perfil', async () => {
    await build().getIntegrationUrl('x', '', { id: 'org-1' } as any, undefined);

    const keys = (ioRedis.set as jest.Mock).mock.calls.map((c) => c[0]);
    expect(keys).not.toContain('profile:st-1');
  });
});

// #1926: listar a biblioteca de midia pela API publica, no perfil da chave.
describe('PublicIntegrationsController - GET /media', () => {
  const media = {
    getMedia: jest.fn().mockResolvedValue({
      pages: 1,
      results: [
        {
          id: 'm1',
          name: 'a.png',
          originalName: 'logo.png',
          path: '/uploads/a.png',
          createdAt: new Date('2026-10-27T10:00:00Z'),
          thumbnail: 't.png',
          inUse: false,
        },
      ],
    }),
  };
  const build = () =>
    new PublicIntegrationsController(
      {} as any,
      {} as any,
      media as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

  beforeEach(() => media.getMedia.mockClear());

  it('chave de perfil lista so o perfil dela; resposta so com campos de exibicao', async () => {
    const result = await build().getMedia({ id: 'org-1' } as any, 'prof-1', {
      page: 3,
      search: 'logo',
    } as any);
    expect(media.getMedia).toHaveBeenCalledWith('org-1', 3, 'prof-1', 'logo');
    expect(result).toEqual({
      pages: 1,
      results: [
        {
          id: 'm1',
          name: 'a.png',
          originalName: 'logo.png',
          path: '/uploads/a.png',
          createdAt: new Date('2026-10-27T10:00:00Z'),
        },
      ],
    });
  });

  it('chave de organizacao lista a organizacao inteira (pagina 1 por padrao)', async () => {
    await build().getMedia({ id: 'org-1' } as any, undefined, {} as any);
    expect(media.getMedia).toHaveBeenCalledWith(
      'org-1',
      1,
      undefined,
      undefined
    );
  });
});

// Porte do upstream 852ac517: quem esta conectado na API publica.
describe('PublicIntegrationsController.getMe', () => {
  const users = {
    getPersonal: jest.fn().mockResolvedValue({
      id: 'user-1',
      name: 'Ana',
      bio: 'nao sai',
      picture: { id: 'pic', path: '/uploads/ana.png' },
    }),
  };
  const build = () =>
    new PublicIntegrationsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      users as any,
      {} as any
    );

  it('token OAuth mostra org e usuario so com campos de exibicao', async () => {
    await expect(
      build().getMe(
        { id: 'org-1', name: 'Agencia', apiKey: 'segredo' } as any,
        undefined,
        'user-1'
      )
    ).resolves.toEqual({
      organization: { id: 'org-1', name: 'Agencia' },
      profile: null,
      user: { id: 'user-1', name: 'Ana', picture: '/uploads/ana.png' },
    });
  });

  it('chave de perfil mostra o perfil e nenhum usuario', async () => {
    users.getPersonal.mockClear();
    await expect(
      build().getMe(
        { id: 'org-1', name: 'Agencia' } as any,
        'prof-1',
        undefined
      )
    ).resolves.toEqual({
      organization: { id: 'org-1', name: 'Agencia' },
      profile: { id: 'prof-1' },
      user: null,
    });
    expect(users.getPersonal).not.toHaveBeenCalled();
  });
});

// Escopo de perfil: video gerado e reconexao de canal pela API publica.
describe('PublicIntegrationsController - video e reconexao por perfil', () => {
  const media = { generateVideo: jest.fn().mockResolvedValue({ id: 'm-1' }) };
  const integrationService = {
    getChannelProfileByInternalId: jest.fn(),
  };
  const manager = {
    getAllowedSocialsIntegrations: jest.fn().mockReturnValue(['x']),
    getSocialIntegration: jest.fn().mockReturnValue({
      generateAuthUrl: jest.fn().mockResolvedValue({
        codeVerifier: 'v',
        state: 's',
        url: 'https://x.com/auth',
      }),
    }),
  };
  const build = () =>
    new PublicIntegrationsController(
      integrationService as any,
      {} as any,
      media as any,
      {} as any,
      manager as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

  it('video gerado com chave de perfil vai para a biblioteca do perfil', async () => {
    await build().generateVideo({ id: 'org-1' } as any, 'prof-1', {
      type: 't',
    } as any);
    expect(media.generateVideo).toHaveBeenCalledWith(
      { id: 'org-1' },
      { type: 't' },
      'prof-1'
    );
  });

  it('chave de perfil nao reconecta canal de outro perfil', async () => {
    // lookup inclui canal desativado
    integrationService.getChannelProfileByInternalId.mockResolvedValue({
      profileId: 'prof-OUTRO',
    });

    await expect(
      build().getIntegrationUrl('x', 'acc-1', { id: 'org-1' } as any, 'prof-1')
    ).rejects.toMatchObject({ status: 403 });
    expect(
      integrationService.getChannelProfileByInternalId
    ).toHaveBeenCalledWith('org-1', 'acc-1');
  });

  it('canal do proprio perfil (ou sem perfil) reconecta normalmente', async () => {
    integrationService.getChannelProfileByInternalId.mockResolvedValue({
      profileId: null,
    });

    await expect(
      build().getIntegrationUrl('x', 'acc-1', { id: 'org-1' } as any, 'prof-1')
    ).resolves.toEqual({ url: 'https://x.com/auth' });
  });
});
