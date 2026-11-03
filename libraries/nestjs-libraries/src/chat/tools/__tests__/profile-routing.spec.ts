jest.mock('../../../database/prisma/profiles/profile.service', () => ({
  ProfileService: class {},
}));
jest.mock('../../../database/prisma/media/media.service', () => ({
  MediaService: class {},
}));
jest.mock('../../../database/prisma/integrations/integration.service', () => ({
  IntegrationService: class {},
}));
jest.mock('../../../database/prisma/knowledge/knowledge.service', () => ({
  KnowledgeService: class {},
}));
jest.mock('../../../ai/ai-web-search.service', () => ({
  AiWebSearchService: class {},
}));
jest.mock('../../../upload/upload.factory', () => ({
  UploadFactory: {
    createStorage: () => ({
      uploadSimple: jest.fn().mockResolvedValue('/uploads/generated.png'),
    }),
  },
}));
jest.mock('../../../integrations/integration.manager', () => ({}));
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
import { IntegrationListTool } from '../integration.list.tool';
import { MediaListTool } from '../media.list.tool';
import { GenerateImageTool } from '../generate.image.tool';
import { GenerateVideoTool } from '../generate.video.tool';
import { KnowledgeQueryTool } from '../knowledge.query.tool';
import { WebSearchTool } from '../web-search.tool';
import { GetAccountContextTool } from '../operational.query.tool';
import {
  GetCommentAutomationTool,
  UpdateCommentAutomationTool,
} from '../manage.automations.tool';
import { CreateCommentAutomationTool } from '../create.comment.automation.tool';
const context = (profileId?: string) => ({
  requestContext: {
    get: (key: string) => ({ organization: '{"id":"org"}', profileId }[key]),
  },
});
describe('roteamento de clientes pelo conector geral MCP', () => {
  const profiles = {
    getProfileById: jest.fn(async (org: string, id: string) =>
      org === 'org' && ['a', 'b'].includes(id)
        ? { id, name: id, apiKey: 'NEVER_RETURN' }
        : null
    ),
    getProfilesByOrgId: jest.fn().mockResolvedValue([
      { id: 'a', name: 'AMZ' },
      { id: 'b', name: 'Outro' },
    ]),
    getPersona: jest.fn().mockResolvedValue({ imageStyle: 'Marca B' }),
  };
  beforeEach(() => jest.clearAllMocks());
  it('canais identificam dono e chave restrita nao inclui canais legados sem perfil', async () => {
    const service = {
      getIntegrationsList: jest.fn().mockResolvedValue([
        {
          id: 'ig-a',
          name: 'AMZ',
          profileId: 'a',
          providerIdentifier: 'instagram',
          token: 'NEVER_RETURN',
        },
        {
          id: 'ig-b',
          name: 'Outro',
          profileId: 'b',
          providerIdentifier: 'instagram',
        },
        {
          id: 'legacy',
          name: 'Legado',
          profileId: null,
          providerIdentifier: 'instagram',
        },
      ]),
    };
    const tool: any = new IntegrationListTool(
      service as never,
      profiles as never
    ).run();
    const all = await tool.execute({}, context());
    expect(all.output.map((p: any) => p.profileId)).toEqual(['a', 'b', null]);
    expect(all.output[0].profile).toEqual({ id: 'a', name: 'AMZ' });
    expect(JSON.stringify(all)).not.toContain('NEVER_RETURN');
    const own = await tool.execute({}, context('a'));
    expect(own.output.map((p: any) => p.id)).toEqual(['ig-a']);
    await expect(
      tool.execute({ profileId: 'b' }, context('a'))
    ).rejects.toThrow('PROFILE_KEY_MISMATCH');
  });
  it('biblioteca pode consultar cliente B sem deixar selecao na proxima consulta', async () => {
    const service = {
      getMedia: jest.fn().mockResolvedValue({ pages: 0, results: [] }),
    };
    const tool: any = new MediaListTool(
      service as never,
      profiles as never
    ).run();
    await tool.execute({ profileId: 'b' }, context());
    await tool.execute({}, context());
    expect(service.getMedia.mock.calls.map((c) => c[2])).toEqual([
      'b',
      undefined,
    ]);
  });
  it('descoberta de contexto nao simula troca persistente da credencial', async () => {
    const tool: any = new GetAccountContextTool(profiles as never).run();
    const selected = await tool.execute({ profileId: 'b' }, context());
    expect(selected.errors || selected.error).toBeDefined();
    const r = await tool.execute({}, context());
    expect(r.output).toMatchObject({
      profile: null,
      postAutomationScope: 'organization',
      writeProfileRequired: true,
    });
  });
  it('imagem usa persona, creditos e biblioteca do perfil selecionado', async () => {
    const service = {
      generateImage: jest.fn().mockResolvedValue('YQ=='),
      saveFile: jest
        .fn()
        .mockResolvedValue({ id: 'm', path: '/uploads/generated.png' }),
    };
    const tool: any = new GenerateImageTool(
      service as never,
      profiles as never
    ).run();
    await tool.execute(
      { profileId: 'b', prompt: 'Imagem', mode: 'T2I', aspectRatio: '1:1' },
      context()
    );
    expect(profiles.getPersona).toHaveBeenCalledWith('org', 'b');
    expect(service.generateImage).toHaveBeenCalledWith(
      expect.stringContaining('Marca B'),
      expect.objectContaining({ id: 'org' }),
      true,
      'b',
      '1:1',
      expect.anything()
    );
    expect(service.saveFile.mock.calls[0][4]).toBe('b');
  });
  it('video, conhecimento e busca usam o perfil validado sem Default', async () => {
    const media = {
      generateAiVideo: jest
        .fn()
        .mockResolvedValue({ id: 'm', path: 'https://cdn/video.mp4' }),
    };
    const knowledge = { query: jest.fn().mockResolvedValue([]) };
    const search = { search: jest.fn().mockResolvedValue({ results: [] }) };
    await (
      new GenerateVideoTool(media as never, profiles as never).run() as any
    ).execute(
      { profileId: 'b', prompt: 'Video', mode: 'T2V', aspectRatio: '9:16' },
      context()
    );
    await (
      new KnowledgeQueryTool(knowledge as never, profiles as never).run() as any
    ).execute({ profileId: 'b', query: 'Produtos' }, context());
    await (
      new WebSearchTool(search as never, profiles as never).run() as any
    ).execute({ profileId: 'b', query: 'Noticias' }, context());
    expect(media.generateAiVideo.mock.calls[0][2]).toBe('b');
    expect(knowledge.query.mock.calls[0][0]).toBe('b');
    expect(search.search.mock.calls[0][2]).toBe('b');
    await expect(
      (
        new KnowledgeQueryTool(
          knowledge as never,
          profiles as never
        ).run() as any
      ).execute({ query: 'Dados' }, context())
    ).rejects.toThrow('PROFILE_REQUIRED');
  });
  it.each([
    [GetCommentAutomationTool, { flowId: 'f' }, 'detail'],
    [
      UpdateCommentAutomationTool,
      { flowId: 'f', configuration: { dmMessage: 'Nova' } },
      'update',
    ],
    [
      CreateCommentAutomationTool,
      { name: 'Teste', integrationId: 'ig', dmMessage: 'Oi' },
      'create',
    ],
  ] as const)(
    'operacao de automacao exige perfil e recusa chave de outro cliente %p',
    async (Tool, input, method) => {
      const service = {
        scope: jest
          .fn()
          .mockResolvedValue({ organizationId: 'org', profileId: 'b' }),
        detail: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      };
      const tool: any = new Tool(service as never).run();
      const absent = await tool.execute(input, context());
      expect(absent.errors).toContain('PROFILE_REQUIRED');
      const denied = await tool.execute(
        { ...input, profileId: 'b' },
        context('a')
      );
      expect(denied.errors).toContain('PROFILE_KEY_MISMATCH');
      expect(service[method]).not.toHaveBeenCalled();
      await tool.execute({ ...input, profileId: 'b' }, context());
      expect(service.scope).toHaveBeenCalledWith('org', 'b');
      expect(service[method]).toHaveBeenCalled();
    }
  );
});
