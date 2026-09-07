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
