// storage.helpers puxa file-type (ESM-only) que quebra ts-jest; nao e usado no
// removeFile.
jest.mock('./storage.helpers', () => ({ loadFromUrlOrDataUrl: jest.fn() }));

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class S3ClientMock {
    middlewareStack = { add: jest.fn() };
    send = mockSend;
  },
  PutObjectCommand: class PutObjectCommandMock {
    constructor(public input: any) {}
  },
  HeadBucketCommand: class HeadBucketCommandMock {
    constructor(public input: any) {}
  },
  DeleteObjectCommand: class DeleteObjectCommandMock {
    readonly type = 'DeleteObject';
    constructor(public input: any) {}
  },
}));

import { CloudflareStorage } from './cloudflare.storage';
import { Readable } from 'stream';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('CloudflareStorage.uploadFromFile', () => {
  it.each([false, true])(
    'envia stream tipada e fecha inclusive em falha %s',
    async (fail) => {
      const dir = await mkdtemp(join(tmpdir(), 'r2-stream-spec-'));
      const source = join(dir, 'source');
      await writeFile(source, 'bytes');
      let body: Readable;
      mockSend.mockImplementationOnce(async (command) => {
        body = command.input.Body;
        expect(body).toBeInstanceOf(Readable);
        expect(command.input).toMatchObject({
          ContentLength: 5,
          ContentType: 'video/mp4',
        });
        if (fail) throw new Error('provider failed');
        let contents = '';
        for await (const chunk of body) contents += chunk.toString();
        expect(contents).toBe('bytes');
        return {};
      });
      try {
        const operation = buildStorage().uploadFromFile({
          sourcePath: source,
          filename: 'video.mp4',
          mimeType: 'video/mp4',
          size: 5,
        });
        if (fail) await expect(operation).rejects.toThrow('provider failed');
        else
          expect(await operation).toMatchObject({ originalname: 'video.mp4' });
        expect(body.destroyed).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  );
});

const buildStorage = () =>
  new CloudflareStorage(
    'account',
    'key',
    'secret',
    'auto',
    'meu-bucket',
    'https://cdn.exemplo.com'
  );

describe('CloudflareStorage.removeFile', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  it('apaga o objeto derivando a Key da URL publica do bucket', async () => {
    await buildStorage().removeFile('https://cdn.exemplo.com/abc123.png');

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual({
      Bucket: 'meu-bucket',
      Key: 'abc123.png',
    });
  });

  it('ignora query string ao derivar a Key', async () => {
    await buildStorage().removeFile('https://cdn.exemplo.com/abc123.png?v=2');

    expect(mockSend.mock.calls[0][0].input.Key).toBe('abc123.png');
  });

  it('nao apaga nada quando a URL nao pertence ao bucket', async () => {
    await buildStorage().removeFile('https://cdn.terceiro.com/abc123.png');

    expect(mockSend).not.toHaveBeenCalled();
  });
});
