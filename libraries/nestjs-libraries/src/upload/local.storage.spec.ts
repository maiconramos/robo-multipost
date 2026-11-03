// storage.helpers puxa file-type (ESM-only) que quebra ts-jest; nao e usado no
// healthCheck.
jest.mock('./storage.helpers', () => ({ loadFromUrlOrDataUrl: jest.fn() }));

import { LocalStorage } from './local.storage';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

describe('LocalStorage.healthCheck', () => {
  it('resolve quando o diretorio e gravavel (garante o dir, sem escrever arquivo)', async () => {
    const dir = join(
      tmpdir(),
      `robo-health-${process.pid}-${process.hrtime()[1]}`
    );
    const storage = new LocalStorage(dir);

    await expect(storage.healthCheck()).resolves.toBeUndefined();
  });

  it('lanca quando UPLOAD_DIRECTORY nao esta configurado', async () => {
    const storage = new LocalStorage(undefined as unknown as string);

    await expect(storage.healthCheck()).rejects.toThrow('UPLOAD_DIRECTORY');
  });
});

describe('LocalStorage.removeFile', () => {
  const makeDir = () =>
    join(tmpdir(), `robo-remove-${process.pid}-${process.hrtime()[1]}`);

  it('apaga o arquivo a partir da URL publica gravada em Media.path', async () => {
    const dir = makeDir();
    mkdirSync(join(dir, '2026', '09'), { recursive: true });
    const file = join(dir, '2026', '09', 'foto.png');
    writeFileSync(file, 'x');
    const storage = new LocalStorage(dir);

    await storage.removeFile('https://app.local/uploads/2026/09/foto.png');

    expect(existsSync(file)).toBe(false);
  });

  it('e idempotente quando o arquivo ja nao existe', async () => {
    const storage = new LocalStorage(makeDir());

    await expect(
      storage.removeFile('https://app.local/uploads/2026/09/sumiu.png')
    ).resolves.toBeUndefined();
  });

  it('nao apaga nada fora do UPLOAD_DIRECTORY', async () => {
    const dir = makeDir();
    mkdirSync(dir, { recursive: true });
    const outside = join(dir, '..', `robo-outside-${process.pid}.txt`);
    writeFileSync(outside, 'x');
    const storage = new LocalStorage(dir);

    await storage.removeFile(
      `https://app.local/uploads/../${basename(outside)}`
    );

    expect(existsSync(outside)).toBe(true);
    unlinkSync(outside);
  });

  it('ignora URL que nao pertence a rota /uploads', async () => {
    const dir = makeDir();
    mkdirSync(dir, { recursive: true });
    const storage = new LocalStorage(dir);

    await expect(
      storage.removeFile('https://cdn.terceiro.com/imagem.png')
    ).resolves.toBeUndefined();
  });
});

describe('LocalStorage.uploadFile', () => {
  it('uploadFromFile rejeita symlink de origem', async () => {
    const { mkdtemp, symlink, rm } = await import('fs/promises');
    const dir = await mkdtemp(join(tmpdir(), 'robo-stream-link-'));
    const source = join(dir, 'real');
    writeFileSync(source, 'keep');
    const link = join(dir, 'link');
    await symlink(source, link);
    try {
      await expect(
        new LocalStorage(join(dir, 'out')).uploadFromFile({
          sourcePath: link,
          filename: 'x.mp4',
          mimeType: 'video/mp4',
          size: 4,
        })
      ).rejects.toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('copia arquivo grande de caminho interno sem buffer e preserva bytes', async () => {
    const source = join(tmpdir(), `robo-stream-source-${process.pid}.mp4`);
    const target = join(tmpdir(), `robo-stream-target-${process.pid}`);
    const bytes = Buffer.from('video content');
    const { readFile, rm } = await import('fs/promises');
    writeFileSync(source, bytes);
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.local';
    try {
      const output = await new LocalStorage(target).uploadFromFile({
        sourcePath: source,
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size: bytes.length,
      });
      const path = output.path.replace('https://app.local/uploads', target);
      expect(await readFile(path)).toEqual(bytes);
      expect(output.originalname).toBe('video.mp4');
      expect(JSON.stringify(output)).not.toContain(source);
    } finally {
      await rm(source, { force: true });
      await rm(target, { recursive: true, force: true });
      if (original === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = original;
    }
  });
  it('nomeia o arquivo com 32 hex de CSPRNG (unico controle de acesso em /uploads)', async () => {
    const ORIGINAL = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.local';
    const dir = join(
      tmpdir(),
      `robo-upload-${process.pid}-${process.hrtime()[1]}`
    );
    const storage = new LocalStorage(dir);
    const file = {
      originalname: 'foto.png',
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
    } as any;

    try {
      const first = await storage.uploadFile(file);
      const second = await storage.uploadFile(file);

      expect(first.filename).toMatch(/^[0-9a-f]{32}\.png$/);
      expect(first.path).toMatch(
        /^https:\/\/app\.local\/uploads\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{32}\.png$/
      );
      expect(second.filename).not.toBe(first.filename);
    } finally {
      if (ORIGINAL === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = ORIGINAL;
    }
  });
});
