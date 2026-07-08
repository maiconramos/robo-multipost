// storage.helpers puxa file-type (ESM-only) que quebra ts-jest; nao e usado no
// healthCheck.
jest.mock('./storage.helpers', () => ({ loadFromUrlOrDataUrl: jest.fn() }));

import { LocalStorage } from './local.storage';
import { tmpdir } from 'os';
import { join } from 'path';

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
