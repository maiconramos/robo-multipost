// MediaService puxa storage/IA (ESM) — o tool so precisa da assinatura
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({
    MediaService: class MediaServiceMock {},
  })
);

import { MediaListTool } from '../media.list.tool';

// Porte do upstream #1926: o agente reaproveita midia ja enviada em vez de
// pedir a URL de novo — sempre no perfil da sessao MCP.
describe('mediaListTool', () => {
  const media = {
    getMedia: jest.fn().mockResolvedValue({
      pages: 2,
      results: [
        {
          id: 'm1',
          name: 'a.png',
          originalName: 'logo.png',
          path: 'https://multi.example.com/uploads/a.png',
          createdAt: new Date('2026-10-27T10:00:00Z'),
          thumbnail: null,
          inUse: true,
        },
      ],
    }),
  };
  const options = {
    requestContext: {
      get: (key: string) =>
        (({ organization: '{"id":"org-1"}', profileId: 'prof-1' } as any)[key]),
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('lista no perfil da sessao com busca e pagina, so com campos de exibicao', async () => {
    const tool: any = new MediaListTool(
      media as any,
      { getProfileById: jest.fn().mockResolvedValue({ id: 'prof-1' }) } as any
    ).run();
    const result = await tool.execute({ search: 'logo', page: 2 }, options);

    expect(media.getMedia).toHaveBeenCalledWith('org-1', 2, 'prof-1', 'logo');
    expect(result).toEqual({
      pages: 2,
      output: [
        {
          id: 'm1',
          name: 'a.png',
          originalName: 'logo.png',
          path: 'https://multi.example.com/uploads/a.png',
          createdAt: '2026-10-27T10:00:00.000Z',
        },
      ],
    });
  });

  it('declara a ferramenta como somente leitura para os clientes MCP', () => {
    const tool: any = new MediaListTool(
      media as any,
      { getProfileById: jest.fn().mockResolvedValue({ id: 'prof-1' }) } as any
    ).run();
    expect(tool.mcp?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });

  it('sem organizacao no contexto falha fechada e nao consulta a midia', async () => {
    const tool: any = new MediaListTool(
      media as any,
      { getProfileById: jest.fn().mockResolvedValue({ id: 'prof-1' }) } as any
    ).run();
    const noOrg = { requestContext: { get: (): unknown => undefined } };
    await expect(tool.execute({}, noOrg)).rejects.toThrow(
      'ORGANIZATION_REQUIRED'
    );
    expect(media.getMedia).not.toHaveBeenCalled();
  });
});
