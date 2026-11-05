import {
  appendMediaUploadSchema,
  beginMediaUploadSchema,
  mediaUploadSchema,
} from './agent-media.dto';

describe('envelope MCP para arquivos grandes', () => {
  it('parte maxima de 2 MiB cabe em requisicao JSON-RPC de 4 MiB', () => {
    const args = {
      uploadId: 'a'.repeat(64),
      offset: 1024 ** 3 - 2 * 1024 ** 2,
      base64: Buffer.alloc(2 * 1024 ** 2).toString('base64'),
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
  it('aceita envio direto de 6 MiB, recusa excedente e preserva partes de 2 MiB', () => {
    const direct = {
      filename: 'foto.png',
      base64: Buffer.alloc(6 * 1024 ** 2).toString('base64'),
    };
    expect(mediaUploadSchema.safeParse(direct).success).toBe(true);
    expect(
      mediaUploadSchema.safeParse({
        ...direct,
        base64: Buffer.alloc(6 * 1024 ** 2 + 1).toString('base64'),
      }).success
    ).toBe(false);
    expect(
      appendMediaUploadSchema.safeParse({
        uploadId: 'a'.repeat(64),
        offset: 0,
        base64: Buffer.alloc(2 * 1024 ** 2).toString('base64'),
      }).success
    ).toBe(true);
    expect(
      appendMediaUploadSchema.safeParse({
        uploadId: 'a'.repeat(64),
        offset: 0,
        base64: Buffer.alloc(2 * 1024 ** 2 + 1).toString('base64'),
      }).success
    ).toBe(false);
    expect(
      Buffer.byteLength(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'uploadMediaTool',
            arguments: { ...direct, profileId: 'cliente' },
          },
        })
      )
    ).toBeLessThan(12 * 1024 ** 2);
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
