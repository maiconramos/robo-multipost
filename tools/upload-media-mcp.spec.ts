import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { transferLocalMedia } from './upload-media-mcp';

describe('cliente programatico de videos por MCP', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcp-upload-client-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  function fakeClient(lost: 'none' | 'begin' | 'append' | 'complete' = 'none') {
    let offset = 0;
    let complete = false;
    let lostOnce = false;
    const collected: Buffer[] = [];
    const progress = () => ({
      uploadId: 'a'.repeat(64),
      state: complete ? 'completed' : 'receiving',
      offset,
      maxChunkBytes: 3,
      media: complete ? { id: 'm', path: '/uploads/video.mp4' } : undefined,
    });
    const callTool = jest.fn(async ({ name, arguments: args }: any) => {
      const operation = name.replace('MediaUploadTool', '');
      if (operation === 'append') {
        expect(args.offset).toBe(offset);
        const data = Buffer.from(args.base64, 'base64');
        collected.push(data);
        offset += data.length;
      }
      if (operation === 'complete') complete = true;
      if (operation === lost && !lostOnce) {
        lostOnce = true;
        throw new Error('connection lost');
      }
      return {
        content: [
          { type: 'text', text: JSON.stringify({ output: progress() }) },
        ],
      };
    });
    return { callTool, collected };
  }
  it.each(['none', 'begin', 'append', 'complete'] as const)(
    'envia bytes exatos e recupera resposta perdida %s',
    async (lost) => {
      const file = join(dir, 'video.mp4');
      const bytes = Buffer.from('abcdefgh');
      await writeFile(file, bytes);
      const client = fakeClient(lost);
      const result = await transferLocalMedia(
        client,
        file,
        join(dir, 'state.json'),
        'private-endpoint-fingerprint',
        async (): Promise<void> => undefined
      );
      expect(result.id).toBe('m');
      expect(Buffer.concat(client.collected)).toEqual(bytes);
      expect(
        client.callTool.mock.calls.filter(
          ([call]) => call.name === 'completeMediaUploadTool'
        )
      ).toHaveLength(1);
    }
  );
  it('preserva estado privado para retomar e nao grava URL/token', async () => {
    const file = join(dir, 'video.mp4');
    await writeFile(file, 'abcdefgh');
    const state = join(dir, 'state.json');
    await expect(
      transferLocalMedia(
        { callTool: jest.fn().mockRejectedValue(new Error('token=SECRET')) },
        file,
        state,
        'hashed-endpoint',
        async (): Promise<void> => undefined
      )
    ).rejects.toThrow();
    const data = await readFile(state, 'utf8');
    expect(data).not.toContain('SECRET');
    expect(JSON.parse(data).clientRequestId).toMatch(/^[a-f0-9]{64}$/);
  });
  it('sessao perdida depois de complete incerto exige consultar biblioteca, sem criar outra', async () => {
    const file = join(dir, 'video.mp4');
    await writeFile(file, 'abcdefgh');
    const state = join(dir, 'state.json');
    const client = fakeClient();
    client.callTool.mockImplementationOnce(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            output: {
              uploadId: 'a'.repeat(64),
              state: 'receiving',
              offset: 0,
              maxChunkBytes: 3,
            },
          }),
        },
      ],
    }));
    client.callTool.mockImplementation(async () => {
      throw new Error('unavailable');
    });
    await expect(
      transferLocalMedia(
        client,
        file,
        state,
        'endpoint',
        async (): Promise<void> => undefined
      )
    ).rejects.toThrow();
    const next = {
      callTool: jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              errors: '[{"error":"UPLOAD_NOT_FOUND"}]',
            }),
          },
        ],
      }),
    };
    await expect(
      transferLocalMedia(
        next,
        file,
        state,
        'endpoint',
        async (): Promise<void> => undefined
      )
    ).rejects.toThrow(/biblioteca/);
    expect(
      next.callTool.mock.calls.every(
        ([call]) => call.name !== 'beginMediaUploadTool'
      )
    ).toBe(true);
  });
});
