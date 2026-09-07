import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import 'multer';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import mime from 'mime-types';
import { IUploadProvider } from './upload.interface';
import axios from 'axios';
import { loadFromUrlOrDataUrl } from './storage.helpers';

class CloudflareStorage implements IUploadProvider {
  private _client: S3Client;

  constructor(
    accountID: string,
    accessKey: string,
    secretKey: string,
    private region: string,
    private _bucketName: string,
    private _uploadUrl: string
  ) {
    this._client = new S3Client({
      endpoint: `https://${accountID}.r2.cloudflarestorage.com`,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    this._client.middlewareStack.add(
      (next) =>
        async (args): Promise<any> => {
          const request = args.request as RequestInit;

          // Remove checksum headers
          const headers = request.headers as Record<string, string>;
          delete headers['x-amz-checksum-crc32'];
          delete headers['x-amz-checksum-crc32c'];
          delete headers['x-amz-checksum-sha1'];
          delete headers['x-amz-checksum-sha256'];
          request.headers = headers;

          Object.entries(request.headers).forEach(
            // @ts-ignore
            ([key, value]: [string, string]): void => {
              if (!request.headers) {
                request.headers = {};
              }
              (request.headers as Record<string, string>)[key] = value;
            }
          );

          return next(args);
        },
      { step: 'build', name: 'customHeaders' }
    );
  }

  async healthCheck(): Promise<void> {
    // HeadBucket valida credencial R2 + acesso ao bucket SEM escrever nada.
    await this._client.send(
      new HeadBucketCommand({ Bucket: this._bucketName })
    );
  }

  async uploadSimple(path: string) {
    const { buffer, contentType, extension } = await loadFromUrlOrDataUrl(
      path
    );
    const id = makeId(10);

    const params = {
      Bucket: this._bucketName,
      Key: `${id}.${extension}`,
      Body: buffer,
      ContentType: contentType,
      ChecksumMode: 'DISABLED',
    };

    const command = new PutObjectCommand({ ...params });
    await this._client.send(command);

    return `${this._uploadUrl}/${id}.${extension}`;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    try {
      const id = makeId(10);
      const extension = mime.extension(file.mimetype) || '';

      // Create the PutObjectCommand to upload the file to Cloudflare R2
      const command = new PutObjectCommand({
        Bucket: this._bucketName,
        ACL: 'public-read',
        Key: `${id}.${extension}`,
        Body: file.buffer,
      });

      await this._client.send(command);

      return {
        filename: `${id}.${extension}`,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
        originalname: `${id}.${extension}`,
        fieldname: 'file',
        path: `${this._uploadUrl}/${id}.${extension}`,
        destination: `${this._uploadUrl}/${id}.${extension}`,
        encoding: '7bit',
        stream: file.buffer as any,
      };
    } catch (err) {
      console.error('Error uploading file to Cloudflare R2:', err);
      throw err;
    }
  }

  /**
   * Deriva a Key do objeto no bucket a partir da URL publica gravada em
   * `Media.path`/`Media.thumbnail`. Exige o prefixo `CLOUDFLARE_BUCKET_URL`:
   * uma URL de terceiro (import externo, CDN de rede social) nao pertence ao
   * nosso bucket e nao pode virar `DeleteObject` — deletariamos por engano um
   * objeto homonimo. Retorna '' quando a URL nao e nossa.
   */
  private resolveObjectKey(publicPath: string): string {
    if (!publicPath || !this._uploadUrl) {
      return '';
    }

    const clean = publicPath.split('?')[0].split('#')[0];
    const prefix = this._uploadUrl.endsWith('/')
      ? this._uploadUrl
      : `${this._uploadUrl}/`;

    if (!clean.startsWith(prefix)) {
      return '';
    }

    try {
      return decodeURIComponent(clean.slice(prefix.length));
    } catch {
      return clean.slice(prefix.length);
    }
  }

  // Implement the removeFile method from IUploadProvider
  async removeFile(publicPath: string): Promise<void> {
    const key = this.resolveObjectKey(publicPath);
    if (!key) {
      return;
    }

    // DeleteObject no R2/S3 e idempotente: apagar chave inexistente devolve
    // 204, entao nao ha caso de "not found" para tratar aqui.
    await this._client.send(
      new DeleteObjectCommand({
        Bucket: this._bucketName,
        Key: key,
      })
    );
  }
}

export { CloudflareStorage };
export default CloudflareStorage;
