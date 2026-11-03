jest.mock('../database/prisma/media/media.service', () => ({
  MediaService: class {},
}));
jest.mock('./upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn() },
}));
jest.mock('./allowed.upload.mime', () => ({
  detectAllowedUploadMime: jest.fn(),
}));
jest.mock('./public-url.fetch', () => {
  const actual = jest.requireActual('./public-url.fetch');
  return { ...actual, fetchPublicUrl: jest.fn() };
});
import { createMock } from '../test';
import { MediaService } from '../database/prisma/media/media.service';
import { IUploadProvider } from './upload.interface';
import { UploadFactory } from './upload.factory';
import { detectAllowedUploadMime } from './allowed.upload.mime';
import { fetchPublicUrl, PublicUrlFetchError } from './public-url.fetch';
import {
  MediaTransferService,
  MCP_UPLOAD_MAX_BYTES,
} from './media-transfer.service';

describe('transferencia de midia compartilhada REST e MCP', () => {
  const bytes = Buffer.from('conteudo de imagem');
  const media = createMock<MediaService>();
  const storage = createMock<IUploadProvider>();
  let service: MediaTransferService;
  beforeEach(() => {
    jest.clearAllMocks();
    (UploadFactory.createStorage as jest.Mock).mockReturnValue(storage);
    (detectAllowedUploadMime as jest.Mock).mockResolvedValue({
      mime: 'image/png',
      ext: 'png',
    });
    (fetchPublicUrl as jest.Mock).mockResolvedValue({ buffer: bytes });
    storage.uploadFile.mockResolvedValue({
      originalname: 'foto.png',
      path: '/uploads/foto.png',
    });
    media.saveFile.mockResolvedValue({
      id: 'm',
      path: '/uploads/foto.png',
    } as never);
    service = new MediaTransferService(media);
  });
  it.each(['perfil', undefined])(
    'grava arquivo no escopo %s e normaliza nome e MIME',
    async (profileId) => {
      await service.fromBase64(
        'org',
        profileId,
        '../../foto.svg',
        bytes.toString('base64')
      );
      expect(storage.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalname: '.._.._foto.png',
          mimetype: 'image/png',
          size: bytes.length,
          buffer: bytes,
        })
      );
      expect(media.saveFile).toHaveBeenCalledWith(
        'org',
        'foto.png',
        '/uploads/foto.png',
        undefined,
        profileId
      );
    }
  );
  it.each(['', 'data:image/png;base64,YQ==', '!!!!', 'YR==', 'YQ', 'YQ==\n'])(
    'rejeita base64 invalido antes de gravar: %s',
    async (value) => {
      await expect(
        service.fromBase64('org', 'p', 'foto.png', value)
      ).rejects.toMatchObject({ status: 400 });
      expect(storage.uploadFile).not.toHaveBeenCalled();
    }
  );
  it('recusa arquivo base64 acima do limite antes de detectar o MIME', async () => {
    const base64 = Buffer.alloc(MCP_UPLOAD_MAX_BYTES + 1).toString('base64');
    await expect(
      service.fromBase64('org', 'p', 'video.mp4', base64)
    ).rejects.toMatchObject({ status: 400 });
    expect(detectAllowedUploadMime).not.toHaveBeenCalled();
  });
  it('aceita exatamente 2 MiB de base64 canonico sem perder bytes', async () => {
    const buffer = Buffer.alloc(MCP_UPLOAD_MAX_BYTES, 1);
    await service.fromBase64('org', 'p', 'foto.png', buffer.toString('base64'));
    const file = storage.uploadFile.mock.calls[0][0];
    expect(file.size).toBe(MCP_UPLOAD_MAX_BYTES);
    expect(file.buffer.equals(buffer)).toBe(true);
  });
  it('recusa SVG e HTML disfarçados e usa tamanho real do buffer', async () => {
    (detectAllowedUploadMime as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      service.fromFile('org', 'p', { buffer: bytes, size: 1 } as never)
    ).rejects.toMatchObject({ status: 400 });
    (fetchPublicUrl as jest.Mock).mockResolvedValueOnce({
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    await expect(
      service.fromUrl('org', 'p', 'https://cdn.example/a.png')
    ).rejects.toMatchObject({ status: 400 });
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it('URL usa guard compartilhado com limite e sem opt-out SSRF', async () => {
    await service.fromUrl('org', 'p', 'https://cdn.example/a.png');
    expect(fetchPublicUrl).toHaveBeenCalledWith('https://cdn.example/a.png', {
      maxBytes: 1024 * 1024 * 1024,
      timeoutMs: 30000,
      allowHttp: false,
      honorSsrfOptOut: false,
    });
    expect(media.saveFile).toHaveBeenCalledWith(
      'org',
      'foto.png',
      '/uploads/foto.png',
      undefined,
      'p'
    );
  });
  it.each(['unsafe', 'http', 'too-large', 'network'] as const)(
    'normaliza falha de URL %s sem vazar segredos',
    async (reason) => {
      (fetchPublicUrl as jest.Mock).mockRejectedValueOnce(
        new PublicUrlFetchError(reason, 'https://secret.example/?token=SECRET')
      );
      const error = await service
        .fromUrl('org', 'p', 'https://cdn.example/a.png')
        .catch((e) => e);
      expect(error.status).toBe(400);
      expect(JSON.stringify(error.getResponse())).not.toContain('SECRET');
      expect(storage.uploadFile).not.toHaveBeenCalled();
    }
  );
  it('sem organizacao ou arquivo falha antes de qualquer efeito', async () => {
    await expect(
      service.fromUrl('', 'p', 'https://cdn.example/a.png')
    ).rejects.toMatchObject({ status: 401 });
    await expect(service.fromFile('org', 'p', undefined)).rejects.toMatchObject(
      { status: 400 }
    );
    expect(fetchPublicUrl).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it('valida tamanho e cabecalho de arquivo temporario, entao usa streaming', async () => {
    const { mkdtemp, writeFile, rm } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const dir = await mkdtemp(join(tmpdir(), 'media-transfer-path-'));
    const path = join(dir, 'source');
    await writeFile(path, bytes);
    storage.uploadFromFile.mockResolvedValue({
      filename: 'video.mp4',
      mimetype: 'video/mp4',
      originalname: 'video.mp4',
      path: '/uploads/video.mp4',
    });
    try {
      await service.fromPath(
        'org',
        'p',
        '../../video.fake',
        path,
        bytes.length
      );
      expect(storage.uploadFromFile).toHaveBeenCalledWith({
        sourcePath: path,
        filename: '.._.._video.png',
        mimeType: 'image/png',
        size: bytes.length,
      });
      expect(storage.uploadFile).not.toHaveBeenCalled();
      await expect(
        service.fromPath('org', 'p', 'x', path, bytes.length + 1)
      ).rejects.toMatchObject({ status: 400 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('arquivo esparso de 1 GiB e validado por cabecalho limitado e enviado por streaming', async () => {
    const { mkdtemp, open, rm } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const dir = await mkdtemp(join(tmpdir(), 'media-stream-limit-'));
    const path = join(dir, 'sparse.mp4');
    const file = await open(path, 'wx');
    await file.truncate(1024 ** 3);
    await file.close();
    (detectAllowedUploadMime as jest.Mock).mockResolvedValueOnce({
      mime: 'video/mp4',
      ext: 'mp4',
    });
    storage.uploadFromFile.mockResolvedValue({
      filename: 'video.mp4',
      mimetype: 'video/mp4',
      originalname: 'video.mp4',
      path: '/uploads/video.mp4',
    });
    try {
      await service.fromPath('org', 'p', 'video.mp4', path, 1024 ** 3);
      expect(
        (detectAllowedUploadMime as jest.Mock).mock.calls[0][0].length
      ).toBe(64 * 1024);
      expect(storage.uploadFromFile).toHaveBeenCalledWith(
        expect.objectContaining({ size: 1024 ** 3, mimeType: 'video/mp4' })
      );
      expect(storage.uploadFile).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
