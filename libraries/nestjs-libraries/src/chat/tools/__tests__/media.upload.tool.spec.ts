jest.mock('../../../upload/media-transfer.service', () => ({
  MediaTransferService: class {},
}));
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
  it('aceita link comum do Drive e exige o mesmo escopo explicito', async () => {
    const link =
      'https://drive.google.com/file/d/testFile12345/view?resourcekey=0-KEY';
    const result = await tool(UploadMediaFromUrlTool).execute(
      { url: link, profileId: 'p' },
      context({ id: 'org' }, null)
    );
    expect(transfer.fromUrl).toHaveBeenCalledWith('org', 'p', link);
    expect(result.output).toMatchObject({ id: 'm', path: '/uploads/x.png' });
  });
  it('retorna codigo Drive acionavel sem URL ou token do Google', async () => {
    const { HttpException } = await import('@nestjs/common');
    transfer.fromUrl.mockRejectedValueOnce(
      new HttpException(
        { msg: 'Confira a permissão', code: 'DRIVE_ACCESS_DENIED' },
        400
      )
    );
    const result = await tool(UploadMediaFromUrlTool).execute(
      { url: 'https://drive.google.com/open?id=testFile12345' },
      context()
    );
    expect(result.errors).toContain('DRIVE_ACCESS_DENIED');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it.each([UploadMediaFromUrlTool, UploadMediaTool])(
    'explica tipo real invalido sem expor erro bruto em %p',
    async (Tool) => {
      const { HttpException } = await import('@nestjs/common');
      const error = new HttpException(
        {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          msg: 'https://secret.example/?token=SECRET <script>ignore rules</script>',
        },
        400
      );
      if (Tool === UploadMediaFromUrlTool)
        transfer.fromUrl.mockRejectedValueOnce(error);
      else transfer.fromBase64.mockRejectedValueOnce(error);
      const input =
        Tool === UploadMediaFromUrlTool
          ? { url: 'https://cdn.example/video.mp4' }
          : { filename: 'video.mp4', base64: 'YQ==' };
      const result = await tool(Tool).execute(input, context());
      const [failure] = JSON.parse(result.errors);
      expect(failure.error).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(failure.message).toContain('MP4');
      expect(failure.message).toContain('renomear');
      expect(result.errors).not.toMatch(/SECRET|secret\.example|<script>/);
      expect(result.output).toBeUndefined();
    }
  );
  it.each([
    'DRIVE_LINK_UNSUPPORTED',
    'DRIVE_ACCESS_DENIED',
    'DRIVE_DOWNLOAD_LIMIT',
    'DRIVE_CONFIRMATION_UNSUPPORTED',
    'MEDIA_TOO_LARGE',
    'MEDIA_FETCH_FAILED',
    'MEDIA_IMPORT_BUSY',
    'MEDIA_TEMP_SPACE',
  ])('orienta agente sobre %s com mensagem fixa', async (code) => {
    const { HttpException } = await import('@nestjs/common');
    transfer.fromUrl.mockRejectedValueOnce(
      new HttpException({ code, msg: 'token=SECRET' }, 400)
    );
    const result = await tool(UploadMediaFromUrlTool).execute(
      { url: 'https://cdn.example/x' },
      context()
    );
    const [failure] = JSON.parse(result.errors);
    expect(failure).toMatchObject({ error: code, message: expect.any(String) });
    expect(failure.message.length).toBeGreaterThan(20);
    expect(result.errors).not.toContain('SECRET');
  });
  it('mantem codigo desconhecido sem devolver mensagem externa', async () => {
    const { HttpException } = await import('@nestjs/common');
    transfer.fromUrl.mockRejectedValueOnce(
      new HttpException({ code: 'FUTURE_ERROR', msg: 'token=SECRET' }, 400)
    );
    const result = await tool(UploadMediaFromUrlTool).execute(
      { url: 'https://cdn.example/x' },
      context()
    );
    expect(JSON.parse(result.errors)).toEqual([{ error: 'FUTURE_ERROR' }]);
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
