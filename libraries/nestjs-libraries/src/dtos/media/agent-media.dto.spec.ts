import {
  appendMediaUploadSchema,
  beginMediaUploadSchema,
  MCP_UPLOAD_MAX_BYTES,
} from './agent-media.dto';

describe('envelope MCP para arquivos grandes', () => {
  it('parte maxima de 2 MiB cabe em requisicao JSON-RPC de 4 MiB', () => {
    const args = {
      uploadId: 'a'.repeat(64),
      offset: 1024 ** 3 - MCP_UPLOAD_MAX_BYTES,
      base64: Buffer.alloc(MCP_UPLOAD_MAX_BYTES).toString('base64'),
    };
    expect(appendMediaUploadSchema.safeParse(args).success).toBe(true);
    const packet = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'appendMediaUploadTool', arguments: args },
    });
    expect(Buffer.byteLength(packet)).toBeLessThan(4 * 1024 * 1024);
  });
  it('limita arquivo completo a 1 GiB e nao permite path ou identidade', () => {
    const args = {
      filename: 'video.mp4',
      size: 1024 ** 3,
      sha256: 'a'.repeat(64),
    };
    expect(beginMediaUploadSchema.safeParse(args).success).toBe(true);
    expect(
      beginMediaUploadSchema.safeParse({ ...args, size: args.size + 1 }).success
    ).toBe(false);
    expect(
      beginMediaUploadSchema.safeParse({ ...args, profileId: 'other' }).success
    ).toBe(false);
    expect(
      beginMediaUploadSchema.safeParse({ ...args, path: '/etc/passwd' }).success
    ).toBe(false);
  });
});
