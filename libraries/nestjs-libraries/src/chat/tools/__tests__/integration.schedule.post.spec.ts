jest.mock('../../../integrations/integration.manager', () => ({
  socialIntegrationList: [
    { identifier: 'instagram', maxLength: () => 2200 },
    { identifier: 'threads', maxLength: () => 500 },
  ],
}));
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
// Unit tests must not start the real telemetry aggregator and its flush timer.
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));
import {
  IntegrationSchedulePostTool,
  schedulePostInputSchema,
} from '../integration.schedule.post';
import { managedMessageSchema } from '../../../dtos/posts/post-management.dto';
describe('criacao MCP completa de posts', () => {
  const posts = {
    mapTypeToPost: jest.fn(async (body) => body),
    createPost: jest
      .fn()
      .mockResolvedValue([{ postId: 'novo', integration: 'i' }]),
  };
  const integration = {
    getIntegrationById: jest.fn().mockResolvedValue({
      id: 'i',
      profileId: 'perfil',
      providerIdentifier: 'instagram',
    }),
  };
  const management = {
    scope: jest
      .fn()
      .mockResolvedValue({ organizationId: 'org', profileId: 'perfil' }),
    assertMediaScope: jest.fn().mockResolvedValue(undefined),
    options: jest.fn().mockResolvedValue([{ id: 'tag', name: 'Campanha' }]),
  };
  const options = {
    requestContext: {
      get: (key: string) =>
        ({ organization: '{"id":"org"}', profileId: 'perfil' }[key]),
    },
  };
  beforeEach(() => jest.clearAllMocks());
  it('criacao do Threads usa bytes UTF8 sem perder o contrato novo', async () => {
    integration.getIntegrationById.mockResolvedValueOnce({
      id: 'i',
      profileId: 'perfil',
      providerIdentifier: 'threads',
    });
    const tool: any = new IntegrationSchedulePostTool(
      posts as any,
      integration as any,
      management as any
    ).run();
    const result = await tool.execute(
      {
        socialPost: [
          {
            integrationId: 'i',
            isPremium: false,
            date: '2026-11-01T15:00:00Z',
            shortLink: false,
            type: 'schedule',
            settings: [],
            postsAndComments: [{ content: 'á'.repeat(251), attachments: [] }],
          },
        ],
      },
      options
    );
    expect(result.errors).toContain('POST_CONTENT_TOO_LONG_BYTES');
    expect(posts.createPost).not.toHaveBeenCalled();
  });
  it('expoe tags intervalo alt thumbnail e delay sem perder o formato anterior', async () => {
    const tool: any = new IntegrationSchedulePostTool(
      posts as any,
      integration as any,
      management as any
    ).run();
    const result = await tool.execute(
      {
        socialPost: [
          {
            integrationId: 'i',
            isPremium: false,
            date: '2026-11-01T15:00:00.000Z',
            shortLink: false,
            type: 'schedule',
            intervalInDays: 7,
            tags: [{ value: 'tag', label: 'Campanha' }],
            settings: [
              { key: 'post_type', value: '"post"' },
              { key: 'is_trial_reel', value: 'false' },
            ],
            postsAndComments: [
              {
                content: '<p>Post</p>',
                media: [
                  {
                    id: 'm',
                    path: 'https://example.com/a.jpg',
                    alt: 'Foto',
                    thumbnail: 'https://example.com/thumb.jpg',
                  },
                ],
                delay: 2,
              },
            ],
          },
        ],
      },
      options
    );
    expect(result.output).toHaveLength(1);
    expect(posts.mapTypeToPost).toHaveBeenCalled();
    expect(posts.createPost).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({
        inter: 7,
        tags: [{ value: 'tag', label: 'Campanha' }],
        posts: [
          expect.objectContaining({
            settings: expect.objectContaining({ is_trial_reel: false }),
            value: [
              expect.objectContaining({
                delay: 2,
                image: [expect.objectContaining({ alt: 'Foto' })],
              }),
            ],
          }),
        ],
      }),
      'perfil'
    );
  });
  it('valida lote inteiro antes de criar e aceita attachments antigo', async () => {
    posts.mapTypeToPost.mockRejectedValueOnce(new Error('invalid'));
    const tool: any = new IntegrationSchedulePostTool(
      posts as any,
      integration as any,
      management as any
    ).run();
    await tool.execute(
      {
        socialPost: [
          {
            integrationId: 'i',
            isPremium: false,
            date: '2026-11-01T15:00:00.000Z',
            shortLink: false,
            type: 'schedule',
            settings: [],
            postsAndComments: [
              { content: 'Post', attachments: ['https://example.com/a.jpg'] },
            ],
          },
        ],
      },
      options
    );
    expect(posts.createPost).not.toHaveBeenCalled();
  });
  it('informa ids tentados quando falha apos possivel gravacao parcial da raiz', async () => {
    posts.createPost.mockRejectedValueOnce(new Error('database interrupted'));
    const tool: any = new IntegrationSchedulePostTool(
      posts as any,
      integration as any,
      management as any
    ).run();
    const result = await tool.execute(
      {
        socialPost: [
          {
            integrationId: 'i',
            isPremium: false,
            date: '2026-11-01T15:00:00.000Z',
            shortLink: false,
            type: 'schedule',
            settings: [],
            postsAndComments: [{ content: 'Post', attachments: [] }],
          },
        ],
      },
      options
    );
    expect(result).toMatchObject({
      outcomeUnknown: true,
      uncertainPosts: [
        expect.objectContaining({
          postId: expect.any(String),
          integration: 'i',
        }),
      ],
    });
  });

  // Porte do upstream 8c63e686: cada post criado volta com a pagina publica de
  // preview (a mesma do botao "Preview" do calendario) para o agente mostrar.
  it('devolve previewUrl de cada post criado', async () => {
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://multi.example.com';
    try {
      const tool: any = new IntegrationSchedulePostTool(
        posts as any,
        integration as any,
        management as any
      ).run();
      const result = await tool.execute(
        {
          socialPost: [
            {
              integrationId: 'i',
              isPremium: false,
              date: '2026-11-01T15:00:00Z',
              shortLink: false,
              type: 'schedule',
              settings: [],
              postsAndComments: [{ content: 'oi', attachments: [] }],
            },
          ],
        },
        options
      );
      expect(result.output).toEqual([
        {
          postId: 'novo',
          integration: 'i',
          profileId: 'perfil',
          previewUrl: 'https://multi.example.com/p/novo?share=true',
        },
      ]);
    } finally {
      process.env.FRONTEND_URL = previous;
    }
  });

  // upstream 28701a98: o contrato do conteudo cita a imagem inline; o fork
  // aponta para as tools que ele tem (mediaListTool/generateImageTool) e
  // mantem o escopo por perfil.
  it('descreve <img> no conteudo so para canais cujas regras pedem', () => {
    const content =
      schedulePostInputSchema.shape.socialPost.element.shape.postsAndComments
        .element.shape.content;
    for (const description of [
      content.description,
      managedMessageSchema.shape.content.description,
    ]) {
      expect(description).toContain('<img src="...">');
      expect(description).toContain('integrationSchema');
      expect(description).toContain('mediaListTool');
      expect(description).not.toContain('uploadFromUrlTool');
    }
  });

  it('repassa a imagem do conteudo ao DTO (o sanitizer decide) e mantem o perfil', async () => {
    const tool: any = new IntegrationSchedulePostTool(
      posts as any,
      integration as any,
      management as any
    ).run();
    const content =
      '<p>a</p><img src="https://multi.example.com/uploads/2026/10/28/a.png" alt="x">';
    await tool.execute(
      {
        socialPost: [
          {
            integrationId: 'i',
            isPremium: false,
            date: '2026-11-01T15:00:00Z',
            shortLink: false,
            type: 'schedule',
            settings: [],
            postsAndComments: [{ content, attachments: [] }],
          },
        ],
      },
      options
    );
    expect(posts.mapTypeToPost).toHaveBeenCalledWith(
      expect.objectContaining({
        posts: [
          expect.objectContaining({
            value: [expect.objectContaining({ content })],
          }),
        ],
      }),
      'org'
    );
    expect(posts.createPost).toHaveBeenCalledWith(
      'org',
      expect.anything(),
      'perfil'
    );
  });

  it('canal de outro perfil continua recusado', async () => {
    integration.getIntegrationById.mockResolvedValueOnce({
      id: 'i',
      profileId: 'outro',
      providerIdentifier: 'instagram',
    });
    const tool: any = new IntegrationSchedulePostTool(
      posts as any,
      integration as any,
      management as any
    ).run();
    const result = await tool.execute(
      {
        socialPost: [
          {
            integrationId: 'i',
            isPremium: false,
            date: '2026-11-01T15:00:00Z',
            shortLink: false,
            type: 'schedule',
            settings: [],
            postsAndComments: [
              {
                content: '<img src="https://multi.example.com/uploads/a.png">',
                attachments: [],
              },
            ],
          },
        ],
      },
      options
    );
    expect(result.errors).toContain('CHANNEL_PROFILE_MISMATCH');
    expect(posts.createPost).not.toHaveBeenCalled();
  });
  const item = (profileId?: string, integrationId = 'i') => ({
    profileId,
    integrationId,
    isPremium: false,
    date: '2027-11-01T15:00:00Z',
    shortLink: false,
    type: 'draft',
    settings: [] as { key: string; value: string }[],
    postsAndComments: [{ content: 'Teste', attachments: [] as string[] }],
  });
  const orgContext = {
    requestContext: {
      get: (k: string) => (k === 'organization' ? '{"id":"org"}' : undefined),
    },
  };
  it('chave geral sem perfil nunca grava no Default nem herda conta', async () => {
    const r = await (
      new IntegrationSchedulePostTool(
        posts as any,
        integration as any,
        management as any
      ).run() as any
    ).execute({ socialPost: [item()] }, orgContext);
    expect(r.errors).toContain('PROFILE_REQUIRED');
    expect(JSON.parse(r.errors)[0].message).toContain('getAccountContextTool');
    expect(JSON.parse(r.errors)[0].message).toContain('socialPost[].profileId');
    expect(posts.createPost).not.toHaveBeenCalled();
    expect(integration.getIntegrationById).not.toHaveBeenCalled();
  });
  it('lote de dois clientes preserva perfil individual e o informa no recibo', async () => {
    management.scope
      .mockImplementationOnce(async (_org, p) => ({
        organizationId: 'org',
        profileId: p,
      }))
      .mockImplementationOnce(async (_org, p) => ({
        organizationId: 'org',
        profileId: p,
      }));
    integration.getIntegrationById
      .mockResolvedValueOnce({
        id: 'a',
        profileId: 'a',
        providerIdentifier: 'instagram',
      })
      .mockResolvedValueOnce({
        id: 'b',
        profileId: 'b',
        providerIdentifier: 'instagram',
      });
    const r = await (
      new IntegrationSchedulePostTool(
        posts as any,
        integration as any,
        management as any
      ).run() as any
    ).execute({ socialPost: [item('a', 'a'), item('b', 'b')] }, orgContext);
    expect(r.errors).toBeUndefined();
    expect(posts.createPost.mock.calls.map((c) => c[2])).toEqual(['a', 'b']);
    expect(r.output.map((p: { profileId: string }) => p.profileId)).toEqual([
      'a',
      'b',
    ]);
  });
  it('segundo canal incompatível recusa lote inteiro antes da primeira gravacao', async () => {
    management.scope
      .mockResolvedValueOnce({ organizationId: 'org', profileId: 'a' })
      .mockResolvedValueOnce({ organizationId: 'org', profileId: 'b' });
    integration.getIntegrationById
      .mockResolvedValueOnce({
        id: 'a',
        profileId: 'a',
        providerIdentifier: 'instagram',
      })
      .mockResolvedValueOnce({
        id: 'a',
        profileId: 'a',
        providerIdentifier: 'instagram',
      });
    const r = await (
      new IntegrationSchedulePostTool(
        posts as any,
        integration as any,
        management as any
      ).run() as any
    ).execute({ socialPost: [item('a', 'a'), item('b', 'a')] }, orgContext);
    expect(r.errors).toContain('CHANNEL_PROFILE_MISMATCH');
    expect(posts.createPost).not.toHaveBeenCalled();
  });
  it('chave de perfil recusa selecao diferente sem consultar canal ou gravar', async () => {
    const r = await (
      new IntegrationSchedulePostTool(
        posts as any,
        integration as any,
        management as any
      ).run() as any
    ).execute({ socialPost: [item('outro')] }, options);
    expect(r.errors).toContain('PROFILE_KEY_MISMATCH');
    expect(integration.getIntegrationById).not.toHaveBeenCalled();
    expect(posts.createPost).not.toHaveBeenCalled();
  });
});
