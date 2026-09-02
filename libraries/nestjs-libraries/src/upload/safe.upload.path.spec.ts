import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveSafeUploadFile } from './safe.upload.path';

describe('resolveSafeUploadFile', () => {
  const root = mkdtempSync(join(tmpdir(), 'multipost-upload-path-'));
  const uploadDirectory = join(root, 'uploads');
  const siblingDirectory = join(root, 'uploads-private');

  beforeAll(() => {
    mkdirSync(join(uploadDirectory, '2026', '09'), { recursive: true });
    mkdirSync(siblingDirectory, { recursive: true });
    writeFileSync(join(root, 'outside.txt'), 'outside');
    writeFileSync(join(uploadDirectory, '2026', '09', 'image.jpg'), 'safe');
    writeFileSync(join(siblingDirectory, 'secret.txt'), 'secret');
    symlinkSync(siblingDirectory, join(uploadDirectory, 'linked-outside'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolve um arquivo regular dentro de UPLOAD_DIRECTORY', () => {
    expect(
      resolveSafeUploadFile(uploadDirectory, ['2026', '09', 'image.jpg'])
    ).toBe(join(uploadDirectory, '2026', '09', 'image.jpg'));
  });

  it('bloqueia segmentos .. que escapariam do diretorio', () => {
    expect(
      resolveSafeUploadFile(uploadDirectory, ['..', 'outside.txt'])
    ).toBeNull();
  });

  it('bloqueia segmentos URL-encoded de traversal', () => {
    expect(
      resolveSafeUploadFile(uploadDirectory, ['%2e%2e', 'outside.txt'])
    ).toBeNull();
  });

  it('nao confunde um diretorio irmao com prefixo semelhante', () => {
    expect(
      resolveSafeUploadFile(uploadDirectory, [
        '..',
        'uploads-private',
        'secret.txt',
      ])
    ).toBeNull();
  });

  it('bloqueia symlink interno que aponta para fora do diretorio', () => {
    expect(
      resolveSafeUploadFile(uploadDirectory, ['linked-outside', 'secret.txt'])
    ).toBeNull();
  });

  it('retorna null para arquivo inexistente ou diretorio', () => {
    expect(resolveSafeUploadFile(uploadDirectory, ['missing.jpg'])).toBeNull();
    expect(resolveSafeUploadFile(uploadDirectory, ['2026'])).toBeNull();
  });
});
