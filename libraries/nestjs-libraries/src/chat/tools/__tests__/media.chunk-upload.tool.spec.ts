jest.mock('../../../upload/media-chunk-upload.service', () => ({
  MediaChunkUploadService: class {},
}));
jest.mock('../../../database/prisma/profiles/profile.service', () => ({
  ProfileService: class {},
}));
import { createMock } from '../../../test';
import { ProfileService } from '../../../database/prisma/profiles/profile.service';
import {
  BeginMediaUploadTool,
  AppendMediaUploadTool,
  CompleteMediaUploadTool,
  GetMediaUploadTool,
  AbortMediaUploadTool,
} from '../media.chunk-upload.tool';
const id = 'a'.repeat(64);
const context = {
  requestContext: {
    get: (key: string) =>
      ({ organization: '{"id":"org"}', profileId: 'p' }[key]),
  },
};
describe('ferramentas MCP de transferencia em partes', () => {
  const profiles = createMock<ProfileService>();
  const service = {
    begin: jest.fn(),
    append: jest.fn(),
    complete: jest.fn(),
    status: jest.fn(),
    abort: jest.fn(),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    profiles.getProfileById.mockResolvedValue({ id: 'p' } as never);
  });
  it('inicia, envia parte, consulta, conclui e cancela somente no escopo da sessao', async () => {
    const input = { filename: 'video.mp4', size: 100, sha256: id };
    await (
      new BeginMediaUploadTool(service as never, profiles).run() as any
    ).execute(input, context);
    expect(service.begin).toHaveBeenCalledWith('org', 'p', input);
    const part = { uploadId: id, offset: 0, base64: 'YQ==' };
    await (
      new AppendMediaUploadTool(service as never, profiles).run() as any
    ).execute(part, context);
    expect(service.append).toHaveBeenCalledWith('org', 'p', part);
    for (const [Tool, method] of [
      [GetMediaUploadTool, 'status'],
      [CompleteMediaUploadTool, 'complete'],
      [AbortMediaUploadTool, 'abort'],
    ] as const) {
      await (new Tool(service as never, profiles).run() as any).execute(
        { uploadId: id },
        context
      );
      expect(service[method]).toHaveBeenCalledWith('org', 'p', id);
    }
  });
  it('recusa identidade, path local e partes que excedem o envelope', async () => {
    const tool: any = new AppendMediaUploadTool(
      service as never,
      profiles
    ).run();
    for (const extra of [
      { profileId: 'other' },
      { path: '/etc/passwd' },
      { base64: 'a'.repeat(4 * 1024 * 1024) },
    ]) {
      const result = await tool.execute(
        { uploadId: id, offset: 0, base64: 'YQ==', ...extra },
        context
      );
      expect(result.errors || result.error).toBeDefined();
    }
    expect(service.append).not.toHaveBeenCalled();
  });
  it('declara consulta read-only e complete/append idempotentes', () => {
    expect(
      (new GetMediaUploadTool(service as never, profiles).run() as any).mcp
        .annotations.readOnlyHint
    ).toBe(true);
    for (const Tool of [AppendMediaUploadTool, CompleteMediaUploadTool])
      expect(
        (new Tool(service as never, profiles).run() as any).mcp.annotations
      ).toMatchObject({ readOnlyHint: false, idempotentHint: true });
  });
});
