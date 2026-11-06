import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import { constants } from 'fs';
import { chmod, mkdtemp, open, rm, statfs } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MediaService } from '../database/prisma/media/media.service';
import {
  MCP_UPLOAD_MAX_BYTES,
  MCP_UPLOAD_MAX_BASE64,
} from '../dtos/media/agent-media.dto';
import { UploadFactory } from './upload.factory';
import { detectAllowedUploadMime } from './allowed.upload.mime';
import { getMaxUploadSize } from './custom.upload.validation';
import { PublicUrlFetchError } from './public-url.fetch';
import {
  downloadPublicMedia,
  DriveDownloadError,
} from './public-media.download';

export { MCP_UPLOAD_MAX_BYTES } from '../dtos/media/agent-media.dto';

const fail = (msg: string, code: string, status = 400): never => {
  throw new HttpException({ msg, code }, status);
};

/** Shared transport-independent upload rules. Identity comes from the caller's auth. */
@Injectable()
export class MediaTransferService {
  private readonly logger = new Logger(MediaTransferService.name);
  private readonly storage = UploadFactory.createStorage();
  private readonly imports = new Map<string, number>();
  private activeImports = 0;
  constructor(private readonly media: MediaService) {}

  private assertOrganization(organizationId: string) {
    if (!organizationId)
      fail('Organization required', 'ORGANIZATION_REQUIRED', 401);
  }

  /** Internal only: private sources from chunk upload or URL import, never client paths. */
  async fromPath(
    organizationId: string,
    profileId: string | undefined,
    filename: string,
    sourcePath: string,
    expectedSize: number
  ) {
    this.assertOrganization(organizationId);
    const handle = await open(
      sourcePath,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    let mime: { mime: string; ext: string };
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.size !== expectedSize ||
        stat.size > getMaxUploadSize('video/mp4')
      )
        fail('Invalid file size.', 'INVALID_FILE_SIZE');
      const header = Buffer.alloc(Math.min(stat.size, 64 * 1024));
      await handle.read(header, 0, header.length, 0);
      mime = await detectAllowedUploadMime(header);
      if (!mime) fail('Unsupported file type.', 'UNSUPPORTED_MEDIA_TYPE');
      if (stat.size > getMaxUploadSize(mime.mime))
        fail('File is too large.', 'MEDIA_TOO_LARGE');
    } finally {
      await handle.close();
    }
    const safeBase =
      (filename || 'upload')
        .replace(/\.[^./\\]*$/, '')
        .replace(/[\\/]/g, '_')
        .slice(0, 100) || 'upload';
    const uploaded = await this.storage.uploadFromFile({
      sourcePath,
      filename: `${safeBase}.${mime.ext}`,
      mimeType: mime.mime,
      size: expectedSize,
    });
    return this.media.saveFile(
      organizationId,
      uploaded.originalname,
      uploaded.path,
      undefined,
      profileId
    );
  }

  async fromUrl(
    organizationId: string,
    profileId: string | undefined,
    url: string
  ) {
    this.assertOrganization(organizationId);
    if (this.activeImports >= 4 || (this.imports.get(organizationId) || 0) >= 2)
      fail('Aguarde as importações em andamento.', 'MEDIA_IMPORT_BUSY', 429);
    this.activeImports++;
    this.imports.set(
      organizationId,
      (this.imports.get(organizationId) || 0) + 1
    );
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'multipost-url-media-'));
      await chmod(directory, 0o700);
      const disk = await statfs(directory);
      // Reserve room for every admitted download, plus local storage's final copy.
      if (
        disk.bavail * disk.bsize <
        this.activeImports * 2 * getMaxUploadSize('video/mp4') + 64 * 1024 ** 2
      )
        fail(
          'Espaço temporário insuficiente no servidor.',
          'MEDIA_TEMP_SPACE',
          503
        );
      const path = join(directory, 'source');
      let download: { size: number; filename: string };
      try {
        download = await downloadPublicMedia(url, path);
      } catch (error) {
        if (error instanceof DriveDownloadError) {
          const messages: Record<string, string> = {
            DRIVE_LINK_UNSUPPORTED:
              'Use um link individual de foto ou vídeo público do Google Drive.',
            DRIVE_ACCESS_DENIED:
              'O Google recusou o download. Confira o acesso por link e a permissão de download.',
            DRIVE_DOWNLOAD_LIMIT:
              'O Google sinalizou um limite de requisições. Tente mais tarde.',
            DRIVE_CONFIRMATION_UNSUPPORTED:
              'Não foi possível resolver a confirmação pública do Google Drive.',
          };
          fail(messages[error.code], error.code);
        }
        if (error instanceof PublicUrlFetchError) {
          if (error.reason === 'unsafe') fail('Unsafe URL', 'UNSAFE_URL');
          if (error.reason === 'too-large')
            fail('File is too large.', 'MEDIA_TOO_LARGE');
        }
        fail('Failed to fetch URL', 'MEDIA_FETCH_FAILED');
      }
      return await this.fromPath(
        organizationId,
        profileId,
        download.filename,
        path,
        download.size
      );
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } catch {
        // Cleanup must not replace a saved receipt (or hide the original error).
        this.logger.warn('Falha ao remover temporário de importação por URL.');
      } finally {
        this.activeImports--;
        const count = (this.imports.get(organizationId) || 1) - 1;
        if (count) this.imports.set(organizationId, count);
        else this.imports.delete(organizationId);
      }
    }
  }

  async fromBase64(
    organizationId: string,
    profileId: string | undefined,
    filename: string,
    base64: string
  ) {
    this.assertOrganization(organizationId);
    if (typeof base64 !== 'string' || base64.length > MCP_UPLOAD_MAX_BASE64) {
      fail('File is too large.', 'MEDIA_TOO_LARGE');
    }
    if (
      !base64 ||
      base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
    ) {
      fail('Invalid base64 file.', 'INVALID_BASE64');
    }
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    if ((base64.length / 4) * 3 - padding > MCP_UPLOAD_MAX_BYTES) {
      fail('File is too large.', 'MEDIA_TOO_LARGE');
    }
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.toString('base64') !== base64)
      fail('Invalid base64 file.', 'INVALID_BASE64');
    return this.fromFile(organizationId, profileId, {
      buffer,
      originalname: filename,
      stream: new Readable(),
    } as Express.Multer.File);
  }

  async fromFile(
    organizationId: string,
    profileId: string | undefined,
    file?: Express.Multer.File
  ) {
    this.assertOrganization(organizationId);
    if (!file) fail('No file provided', 'FILE_REQUIRED');
    if (!Buffer.isBuffer(file.buffer))
      fail('Invalid file upload.', 'INVALID_FILE');
    const detected = await detectAllowedUploadMime(file.buffer);
    if (!detected) fail('Unsupported file type.', 'UNSUPPORTED_MEDIA_TYPE');
    if (file.buffer.length > getMaxUploadSize(detected.mime))
      fail('File is too large.', 'MEDIA_TOO_LARGE');
    const safeBase =
      (file.originalname || 'upload')
        .replace(/\.[^./\\]*$/, '')
        .replace(/[\\/]/g, '_')
        .slice(0, 100) || 'upload';
    const uploaded = await this.storage.uploadFile({
      ...file,
      size: file.buffer.length,
      mimetype: detected.mime,
      originalname: `${safeBase}.${detected.ext}`,
    });
    return this.media.saveFile(
      organizationId,
      uploaded.originalname,
      uploaded.path,
      undefined,
      profileId
    );
  }
}
