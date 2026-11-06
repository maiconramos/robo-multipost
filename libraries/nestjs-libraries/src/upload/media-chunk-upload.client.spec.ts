jest.mock('../database/prisma/media/media.service', () => ({
  MediaService: class {},
}));
jest.mock('../database/prisma/profiles/profile.service', () => ({
  ProfileService: class {},
}));
jest.mock('./upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn() },
}));
jest.mock('./allowed.upload.mime', () => ({
  detectAllowedUploadMime: jest
    .fn()
    .mockResolvedValue({ mime: 'video/mp4', ext: 'mp4' }),
}));
jest.mock('./storage.helpers', () => ({ loadFromUrlOrDataUrl: jest.fn() }));
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { createMock } from '../test';
import { MediaService } from '../database/prisma/media/media.service';
import { ProfileService } from '../database/prisma/profiles/profile.service';
import { UploadFactory } from './upload.factory';
import { LocalStorage } from './local.storage';
import { MediaTransferService } from './media-transfer.service';
import { MediaChunkUploadService } from './media-chunk-upload.service';
import {
  BeginMediaUploadTool,
  AppendMediaUploadTool,
  CompleteMediaUploadTool,
  GetMediaUploadTool,
} from '../chat/tools/media.chunk-upload.tool';
import { transferLocalMedia } from '../../../../tools/upload-media-mcp';

describe('cliente, ferramentas e storage local em conjunto', () => {
  it('transfere mais de 4 MiB, recupera resposta final perdida e grava uma unica midia', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'mcp-client-library-'));
    const previousUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example';
    const destination = join(parent, 'library');
    (UploadFactory.createStorage as jest.Mock).mockImplementation(
      () => new LocalStorage(destination)
    );
    const media = createMock<MediaService>();
    media.saveFile.mockImplementation(
      (_org, name, path) =>
        Promise.resolve({
          id: 'one-media',
          name,
          path,
          originalName: null,
        }) as never
    );
    const profiles = createMock<ProfileService>();
    profiles.getProfileById.mockResolvedValue({ id: 'p' } as never);
    const uploads = new MediaChunkUploadService(
      new MediaTransferService(media),
      parent
    );
    const tools = [
      new BeginMediaUploadTool(uploads, profiles),
      new AppendMediaUploadTool(uploads, profiles),
      new CompleteMediaUploadTool(uploads, profiles),
      new GetMediaUploadTool(uploads, profiles),
    ];
    const byName = Object.fromEntries(
      tools.map((tool) => [tool.name, tool.run() as any])
    );
    const context = {
      requestContext: {
        get: (key: string) =>
          ({ organization: '{"id":"org"}', profileId: 'p' }[key]),
      },
    };
    let lost = false;
    const packets: number[] = [];
    const client = {
      callTool: async (input: {
        name: string;
        arguments: Record<string, unknown>;
      }) => {
        const packet = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: input,
        });
        packets.push(Buffer.byteLength(packet));
        const result = await byName[input.name].execute(
          input.arguments,
          context
        );
        if (input.name === 'completeMediaUploadTool' && !lost) {
          lost = true;
          throw new Error('lost acknowledgement');
        }
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      },
    };
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 7, 5);
    const source = join(parent, 'video.mp4');
    await writeFile(source, bytes);
    try {
      const receipt = await transferLocalMedia(
        client,
        source,
        join(parent, 'resume.json'),
        'fingerprint',
        async (): Promise<void> => undefined
      );
      expect(receipt.id).toBe('one-media');
      expect(media.saveFile).toHaveBeenCalledTimes(1);
      expect(media.saveFile).toHaveBeenCalledWith(
        'org',
        'video.mp4',
        expect.any(String),
        undefined,
        'p'
      );
      const written = await readFile(
        receipt.path.replace('https://app.example/uploads', destination)
      );
      expect(createHash('sha256').update(written).digest('hex')).toBe(
        createHash('sha256').update(bytes).digest('hex')
      );
      expect(Math.max(...packets)).toBeLessThan(4 * 1024 * 1024);
      expect(packets.length).toBeGreaterThan(4);
    } finally {
      await uploads.onModuleDestroy();
      await rm(parent, { recursive: true, force: true });
      if (previousUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousUrl;
    }
  });
});
