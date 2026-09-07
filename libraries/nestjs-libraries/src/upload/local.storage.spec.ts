// storage.helpers puxa file-type (ESM-only) que quebra ts-jest; nao e usado no
// healthCheck.
jest.mock('./storage.helpers', () => ({ loadFromUrlOrDataUrl: jest.fn() }));

import { LocalStorage } from './local.storage';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

describe('LocalStorage.healthCheck', () => {
  it('resolve quando o diretorio e gravavel (garante o dir, sem escrever arquivo)', async () => {
    const dir = join(tmpdir(), `robo-health-${process.pid}-${process.hrtime()[1]}`);
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
