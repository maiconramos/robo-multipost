import { CloudflareStorage } from './cloudflare.storage';

describe('CloudflareStorage.removeFile', () => {
  it('deve enviar DeleteObjectCommand com a key extraida do path', async () => {
    const storage = Object.create(
      CloudflareStorage.prototype
    ) as CloudflareStorage;
    const send = jest.fn().mockResolvedValue({});
    (storage as any)._client = { send };
    (storage as any)._bucketName = 'bucket';

    await storage.removeFile('https://cdn.example.com/abc123.png');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input).toEqual({ Bucket: 'bucket', Key: 'abc123.png' });
  });
});
