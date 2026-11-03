jest.mock(
  '../../../upload/media-transfer.service',
  () => ({ MediaTransferService: class {} }),
  { virtual: true }
);
jest.mock('../../../database/prisma/profiles/profile.service', () => ({
  ProfileService: class {},
}));
import { createMock } from '../../../test';
import { ProfileService } from '../../../database/prisma/profiles/profile.service';
import { MediaTransferService } from '../../../upload/media-transfer.service';
import { UploadMediaTool, UploadMediaFromUrlTool } from '../media.upload.tool';

const context = (
  org: unknown = { id: 'org', name: 'Org', apiKey: 'SECRET' },
  profileId: unknown = 'p'
) => ({
  requestContext: {
    get: (key: string) =>
      ({ organization: JSON.stringify(org), profileId }[key]),
  },
});
describe('uploads MCP', () => {
  const profiles = createMock<ProfileService>();
  const transfer = { fromUrl: jest.fn(), fromBase64: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    profiles.getProfileById.mockResolvedValue({ id: 'p' } as never);
    const saved = {
      id: 'm',
      name: 'x.png',
      originalName: null as string | null,
      path: '/uploads/x.png',
      createdAt: new Date('2026-11-03T00:00:00Z'),
      organizationId: 'org',
      secret: 'SECRET',
    };
    transfer.fromUrl.mockResolvedValue(saved);
    transfer.fromBase64.mockResolvedValue(saved);
  });
  const tool = (Tool: typeof UploadMediaTool | typeof UploadMediaFromUrlTool) =>
    new Tool(
      transfer as unknown as MediaTransferService,
      profiles
    ).run() as any;
  it('importa URL no perfil autenticado e projeta apenas campos publicos', async () => {
    const result = await tool(UploadMediaFromUrlTool).execute(
      { url: 'https://cdn.example/x.png' },
      context()
    );
    expect(transfer.fromUrl).toHaveBeenCalledWith(
      'org',
      'p',
      'https://cdn.example/x.png'
    );
    expect(result.output).toEqual({
      id: 'm',
      name: 'x.png',
      originalName: null as string | null,
      path: '/uploads/x.png',
    });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('arquivo JSON envia base64, nunca caminho local do servidor', async () => {
    await tool(UploadMediaTool).execute(
      { filename: 'x.png', base64: 'YQ==' },
      context()
    );
    expect(transfer.fromBase64).toHaveBeenCalledWith(
      'org',
      'p',
      'x.png',
      'YQ=='
    );
  });
  it('chave geral exige perfil explicito e nao salva midia compartilhada por acidente', async () => {
    const result = await tool(UploadMediaFromUrlTool).execute(
      { url: 'https://cdn.example/x.png' },
      context({ id: 'org' }, null)
    );
    expect(result.errors).toContain('PROFILE_REQUIRED');
    expect(transfer.fromUrl).not.toHaveBeenCalled();
    await tool(UploadMediaFromUrlTool).execute(
      { url: 'https://cdn.example/x.png', profileId: 'p' },
      context({ id: 'org' }, null)
    );
    expect(transfer.fromUrl).toHaveBeenCalledWith(
      'org',
      'p',
      'https://cdn.example/x.png'
    );
  });
  it.each([
    { profileId: 'outro', url: 'https://cdn.example/x.png' },
    { path: '/etc/passwd' },
    { url: 'file:///etc/passwd' },
  ])('recusa identidade ou formato forjado', async (input) => {
    const result = await tool(UploadMediaFromUrlTool).execute(input, context());
    expect(result.errors || result.error).toBeDefined();
    expect(transfer.fromUrl).not.toHaveBeenCalled();
  });
  it('sem contexto, perfil invalido ou org malformada falha fechada', async () => {
    const upload = tool(UploadMediaFromUrlTool);
    await upload.execute({ url: 'https://cdn.example/x.png' }, context(null));
    profiles.getProfileById.mockResolvedValueOnce(null);
    await upload.execute({ url: 'https://cdn.example/x.png' }, context());
    await upload.execute(
      { url: 'https://cdn.example/x.png' },
      context({ id: 'org' }, 123)
    );
    expect(transfer.fromUrl).not.toHaveBeenCalled();
  });
  it('nao devolve excecao bruta com URL assinada ou base64', async () => {
    transfer.fromUrl.mockRejectedValueOnce(new Error('token=SECRET'));
    const result = await tool(UploadMediaFromUrlTool).execute(
      { url: 'https://cdn.example/x.png' },
      context()
    );
    expect(result.errors).toContain('TOOL_FAILED');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it.each([UploadMediaTool, UploadMediaFromUrlTool])(
    'contrato objeto estrito e anotacoes de escrita: %p',
    (Tool) => {
      const upload = tool(Tool);
      expect(upload.inputSchema._def.typeName).toBe('ZodObject');
      expect(upload.inputSchema._def.unknownKeys).toBe('strict');
      expect(upload.mcp.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      });
    }
  );
});
