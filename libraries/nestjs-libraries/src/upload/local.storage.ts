import { IUploadProvider } from './upload.interface';
import { constants, mkdirSync, writeFileSync } from 'fs';
import { access, mkdir, unlink } from 'fs/promises';
import { extname } from 'path';
import { loadFromUrlOrDataUrl } from './storage.helpers';
import {
  extractUploadPathSegments,
  resolveSafeUploadFile,
} from './safe.upload.path';
export class LocalStorage implements IUploadProvider {
  constructor(private uploadDirectory: string) {}

  async healthCheck(): Promise<void> {
    if (!this.uploadDirectory) {
      throw new Error('UPLOAD_DIRECTORY nao configurado');
    }
    // fs assíncrono: a sonda roda numa rota de rede — não pode bloquear o event
    // loop num UPLOAD_DIRECTORY lento/NFS. Garante o diretório e confirma que é
    // gravável, sem escrever arquivo.
    await mkdir(this.uploadDirectory, { recursive: true });
    await access(this.uploadDirectory, constants.W_OK);
  }

  async uploadSimple(path: string) {
    const { buffer, extension } = await loadFromUrlOrDataUrl(path);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('');

    const filePath = `${dir}/${randomName}.${extension}`;
    const publicPath = `${innerPath}/${randomName}.${extension}`;
    writeFileSync(filePath, buffer);

    return process.env.FRONTEND_URL + '/uploads' + publicPath;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');

      const innerPath = `/${year}/${month}/${day}`;
      const dir = `${this.uploadDirectory}${innerPath}`;
      mkdirSync(dir, { recursive: true });

      const randomName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');

      const filePath = `${dir}/${randomName}${extname(file.originalname)}`;
      const publicPath = `${innerPath}/${randomName}${extname(
        file.originalname
      )}`;

      // Logic to save the file to the filesystem goes here
      writeFileSync(filePath, file.buffer);

      return {
        filename: `${randomName}${extname(file.originalname)}`,
        path: process.env.FRONTEND_URL + '/uploads' + publicPath,
        mimetype: file.mimetype,
        originalname: file.originalname,
      };
    } catch (err) {
      console.error('Error uploading file to Local Storage:', err);
      throw err;
    }
  }

  async removeFile(publicPath: string): Promise<void> {
    // `publicPath` e o valor gravado em Media.path/Media.thumbnail — URL
    // publica da rota /uploads, nao caminho de disco. Reusamos o mesmo
    // resolvedor da rota de leitura para nao aceitar `..`/symlink saindo de
    // UPLOAD_DIRECTORY: um id de midia forjado nunca vira `unlink` arbitrario.
    const segments = extractUploadPathSegments(publicPath);
    if (!segments.length) {
      return;
    }

    const filePath = resolveSafeUploadFile(this.uploadDirectory, segments);
    if (!filePath) {
      // Arquivo ja removido (ou fora do diretorio): nada a fazer.
      return;
    }

    try {
      await unlink(filePath);
    } catch (err) {
      // Idempotente: corrida entre duas remocoes nao e falha.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
