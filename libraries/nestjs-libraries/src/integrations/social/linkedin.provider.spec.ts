import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { LinkedinDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/linkedin.dto';
import { LinkedinProvider } from './linkedin.provider';

class TestLinkedinProvider extends LinkedinProvider {
  prepare(path: string): Promise<Buffer> {
    return (this as any).prepareMediaBuffer(path);
  }

  uploadVideo(path: string) {
    return this.uploadPicture(
      'video.mp4',
      'access-token',
      'person-1',
      { path },
      'personal'
    );
  }

  uploadImage(buffer: Buffer) {
    return this.uploadPicture(
      'image.png',
      'access-token',
      'person-1',
      buffer,
      'personal'
    );
  }
}

describe('LinkedinProvider media', () => {
  const originalFetch = global.fetch;
  let directory: string;
  let provider: TestLinkedinProvider;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'linkedin-provider-'));
    provider = new TestLinkedinProvider();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it('expõe o DTO do LinkedIn no contrato do provider', () => {
    expect(provider.dto).toBe(LinkedinDto);
  });

  it('nao converte imagens em PDF quando flag legada contem a string false', async () => {
    const postDetails: any[] = [
      {
        id: 'post-1',
        message: 'Teste',
        media: [],
        settings: { post_as_images_carousel: 'false' },
      },
    ];
    const convert = jest
      .spyOn(provider as any, 'convertImagesToPdfCarousel')
      .mockResolvedValue(postDetails);
    jest
      .spyOn(provider as any, 'processMediaForPosts')
      .mockResolvedValue({ 'post-1': [] });
    const createMain = jest
      .spyOn(provider as any, 'createMainPost')
      .mockResolvedValue('urn:li:share:1');

    await provider.post(
      'person-1',
      'token',
      postDetails as any,
      {} as any,
      'personal'
    );

    expect(convert).not.toHaveBeenCalled();
    expect(createMain).toHaveBeenCalledWith(
      'person-1',
      'token',
      postDetails[0],
      [],
      'personal',
      false
    );
  });

  it('preserva PNG com transparencia e nao amplia imagens pequenas', async () => {
    const path = join(directory, 'transparent.png');
    writeFileSync(
      path,
      await sharp({
        create: {
          width: 20,
          height: 10,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 0.25 },
        },
      })
        .png()
        .toBuffer()
    );

    const metadata = await sharp(await provider.prepare(path)).metadata();

    expect(metadata.format).toBe('png');
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.width).toBe(20);
    expect(metadata.height).toBe(10);
  });

  it('reduz imagem acima de 6000px e mantem o formato suportado', async () => {
    const path = join(directory, 'large.png');
    writeFileSync(
      path,
      await sharp({
        create: {
          width: 6101,
          height: 10,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer()
    );

    const metadata = await sharp(await provider.prepare(path)).metadata();

    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(6000);
    expect(metadata.height).toBeLessThanOrEqual(10);
  });

  it('converte formato nao suportado para JPEG', async () => {
    const path = join(directory, 'image.webp');
    writeFileSync(
      path,
      await sharp({
        create: {
          width: 30,
          height: 15,
          channels: 3,
          background: { r: 10, g: 20, b: 30 },
        },
      })
        .webp()
        .toBuffer()
    );

    expect((await sharp(await provider.prepare(path)).metadata()).format).toBe(
      'jpeg'
    );
  });

  it('envia imagens maiores que 2MB em um unico PUT', async () => {
    const image = Buffer.alloc(2 * 1024 * 1024 + 3);
    const uploadedBodies: Buffer[] = [];

    jest.spyOn(provider, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).includes('initializeUpload')) {
        return {
          json: async () => ({
            value: {
              uploadUrl: 'https://upload.linkedin.example/image',
              image: 'urn:li:image:1',
            },
          }),
        } as Response;
      }

      uploadedBodies.push(options?.body as Buffer);
      return { headers: new Headers() } as Response;
    });

    await expect(provider.uploadImage(image)).resolves.toBe('urn:li:image:1');
    expect(uploadedBodies).toEqual([image]);
  });

  it('envia video remoto em janelas de 2MB sem carregar o arquivo inteiro', async () => {
    const chunkSize = 2 * 1024 * 1024;
    const totalSize = chunkSize + 3;
    const rangedRequests: string[] = [];
    const uploadedBodies: Buffer[] = [];
    let headHeaders = new Headers();

    global.fetch = jest.fn(async (_url: string, options: RequestInit = {}) => {
      if (options.method === 'HEAD') {
        headHeaders = new Headers(options.headers);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': String(totalSize) }),
        } as Response;
      }

      const range = new Headers(options.headers).get('range')!;
      rangedRequests.push(range);
      const match = /bytes=(\d+)-(\d+)/.exec(range)!;
      const length = Number(match[2]) - Number(match[1]) + 1;
      const chunk = new Uint8Array(length);
      return {
        ok: true,
        status: 206,
        headers: new Headers({
          'content-length': String(length),
          'content-range': `${range.replace('=', ' ')}/${totalSize}`,
        }),
        arrayBuffer: async () => chunk.buffer,
      } as Response;
    }) as jest.Mock;

    jest.spyOn(provider, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).includes('initializeUpload')) {
        return {
          json: async () => ({
            value: {
              uploadInstructions: [
                { uploadUrl: 'https://upload.linkedin.example/part' },
              ],
              video: 'urn:li:video:1',
            },
          }),
        } as Response;
      }

      if (String(url).includes('finalizeUpload')) {
        return { status: 200 } as Response;
      }

      uploadedBodies.push(options?.body as Buffer);
      return {
        headers: new Headers({ etag: `etag-${uploadedBodies.length}` }),
      } as Response;
    });

    await expect(
      provider.uploadVideo('https://media.example/video.mp4')
    ).resolves.toBe('urn:li:video:1');
    expect(rangedRequests).toEqual([
      `bytes=0-${chunkSize - 1}`,
      `bytes=${chunkSize}-${totalSize - 1}`,
    ]);
    expect(headHeaders.get('accept-encoding')).toBe('identity');
    expect(uploadedBodies.map((body) => body.length)).toEqual([chunkSize, 3]);
  });

  it('le video local usando as mesmas janelas de 2MB', async () => {
    const chunkSize = 2 * 1024 * 1024;
    const path = join(directory, 'video.mp4');
    writeFileSync(path, Buffer.alloc(chunkSize + 3, 7));
    const uploadedBodies: Buffer[] = [];

    jest.spyOn(provider, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).includes('initializeUpload')) {
        return {
          json: async () => ({
            value: {
              uploadInstructions: [
                { uploadUrl: 'https://upload.linkedin.example/part' },
              ],
              video: 'urn:li:video:local',
            },
          }),
        } as Response;
      }

      if (String(url).includes('finalizeUpload')) {
        return { status: 200 } as Response;
      }

      uploadedBodies.push(options?.body as Buffer);
      return {
        headers: new Headers({ etag: `etag-${uploadedBodies.length}` }),
      } as Response;
    });

    await expect(provider.uploadVideo(path)).resolves.toBe(
      'urn:li:video:local'
    );
    expect(uploadedBodies.map((body) => body.length)).toEqual([chunkSize, 3]);
    expect(
      uploadedBodies.every((body) => body.every((byte) => byte === 7))
    ).toBe(true);
  });

  it('falha se o servidor de midia ignorar o Range', async () => {
    const ignoredRangeBody = new Uint8Array(10);
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-length': '10' }),
      arrayBuffer: async () => ignoredRangeBody.buffer,
    });

    await expect(
      (provider as any).videoChunk('https://media.example/video.mp4', 0, 9)
    ).rejects.toThrow('Range');
  });
});
