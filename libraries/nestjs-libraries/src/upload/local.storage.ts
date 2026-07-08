import { IUploadProvider } from './upload.interface';
import { constants, mkdirSync, unlink, writeFileSync } from 'fs';
import { access, mkdir } from 'fs/promises';
import { extname } from 'path';
import { loadFromUrlOrDataUrl } from './storage.helpers';
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

  async removeFile(filePath: string): Promise<void> {
    // Logic to remove the file from the filesystem goes here
    return new Promise((resolve, reject) => {
      unlink(filePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
