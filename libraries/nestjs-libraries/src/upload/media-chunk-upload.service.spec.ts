jest.mock('./media-transfer.service', () => ({
  MediaTransferService: class {},
}));
import { createHash } from 'crypto';
import {
  mkdtemp,
  rm,
  readFile,
  readdir,
  stat,
  appendFile,
  symlink,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fsPromises from 'fs/promises';
import { MediaChunkUploadService } from './media-chunk-upload.service';

const digest = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');
describe('upload MCP em partes, efemero e isolado', () => {
  let parent: string;
  let service: MediaChunkUploadService;
  const transfer = { fromPath: jest.fn() };
  const bytes = Buffer.from('abcdefgh');
  const begin = (
    org = 'org',
    profile: string | undefined = 'p',
    data = bytes
  ) =>
    service.begin(org, profile, {
      filename: '../../video.mp4',
      size: data.length,
      sha256: digest(data),
    });
  beforeEach(async () => {
    parent = await mkdtemp(join(tmpdir(), 'mcp-chunk-spec-'));
    transfer.fromPath.mockReset().mockResolvedValue({
      id: 'media',
      name: 'video.mp4',
      path: '/uploads/video.mp4',
      originalName: null,
    });
    service = new MediaChunkUploadService(transfer as never, parent);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await service.onModuleDestroy();
    await rm(parent, { recursive: true, force: true });
  });
  it('repeticao concorrente do mesmo inicio conserva um uploadId', async () => {
    const input = {
      filename: 'video.mp4',
      size: bytes.length,
      sha256: digest(bytes),
      clientRequestId: 'b'.repeat(64),
    };
    const [a, b] = await Promise.all([
      service.begin('org', 'p', input),
      service.begin('org', 'p', input),
    ]);
    expect(a.uploadId).toBe(b.uploadId);
    await expect(
      service.begin('org', 'p', { ...input, size: bytes.length + 1 })
    ).rejects.toMatchObject({ status: 409 });
  });
  it('reverte escrita parcial antes de permitir retomada', async () => {
    const session = await begin();
    const original = fsPromises.open;
    jest
      .spyOn(require('fs/promises') as typeof fsPromises, 'open')
      .mockImplementationOnce(
        async (...args: Parameters<typeof fsPromises.open>) => {
          const handle = await original(...args);
          const write = handle.write.bind(handle);
          let first = true;
          jest
            .spyOn(handle, 'write')
            .mockImplementation(async (...params: any[]) => {
              if (!first) throw new Error('disk failed');
              first = false;
              return write(params[0], params[1], 1, params[3]);
            });
          return handle;
        }
      );
    await expect(
      service.append('org', 'p', {
        uploadId: session.uploadId,
        offset: 0,
        base64: bytes.toString('base64'),
      })
    ).rejects.toThrow('disk failed');
    expect((await service.status('org', 'p', session.uploadId)).offset).toBe(0);
    jest.restoreAllMocks();
    await expect(
      service.append('org', 'p', {
        uploadId: session.uploadId,
        offset: 0,
        base64: bytes.toString('base64'),
      })
    ).resolves.toMatchObject({ offset: bytes.length });
  });
  it('aplica quota global de reserva e protege margem de disco', async () => {
    jest
      .spyOn(require('fs/promises') as typeof fsPromises, 'statfs')
      .mockResolvedValue({ bavail: 1024 ** 3, bsize: 4096 } as never);
    for (let i = 0; i < 4; i++)
      await service.begin(`org-${i}`, 'p', {
        filename: 'video.mp4',
        size: 1024 ** 3,
        sha256: digest(bytes),
      });
    await expect(
      service.begin('org-next', 'p', {
        filename: 'x',
        size: 1,
        sha256: digest(bytes),
      })
    ).rejects.toMatchObject({ status: 429 });
    jest
      .spyOn(require('fs/promises') as typeof fsPromises, 'statfs')
      .mockResolvedValue({ bavail: 0, bsize: 4096 } as never);
    const other = new MediaChunkUploadService(transfer as never, parent);
    try {
      await expect(
        other.begin('o', 'p', { filename: 'x', size: 1, sha256: digest(bytes) })
      ).rejects.toMatchObject({ status: 507 });
    } finally {
      await other.onModuleDestroy();
    }
  });
  it('monta arquivo exato, confirma offset e conclui uma unica vez', async () => {
    const session = await begin();
    expect(session.uploadId).toMatch(/^[a-f0-9]{64}$/);
    expect(session.maxChunkBytes).toBe(2 * 1024 * 1024);
    await service.append('org', 'p', {
      uploadId: session.uploadId,
      offset: 0,
      base64: bytes.subarray(0, 3).toString('base64'),
    });
    const part = {
      uploadId: session.uploadId,
      offset: 3,
      base64: bytes.subarray(3).toString('base64'),
    };
    const result = await service.append('org', 'p', part);
    expect(result.offset).toBe(bytes.length);
    await service.append('org', 'p', part);
    expect((await service.status('org', 'p', session.uploadId)).offset).toBe(
      bytes.length
    );
    transfer.fromPath.mockImplementationOnce(
      async (_o, _p, _n, path: string) => {
        expect(await readFile(path)).toEqual(bytes);
        return {
          id: 'media',
          name: 'video.mp4',
          path: '/uploads/video.mp4',
          originalName: null,
        };
      }
    );
    const done = await service.complete('org', 'p', session.uploadId);
    expect(done.state).toBe('completed');
    expect(done.media.id).toBe('media');
    expect(await service.complete('org', 'p', session.uploadId)).toEqual(done);
    expect(transfer.fromPath).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(done)).not.toContain(parent);
  });
  it.each([
    ['other', 'p'],
    ['org', 'other'],
    ['org', undefined],
  ])(
    'sessao nao atravessa organizacao ou perfil %s %s',
    async (org, profile) => {
      const session = await begin();
      await expect(
        service.status(org, profile, session.uploadId)
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.abort(org, profile, session.uploadId)
      ).rejects.toMatchObject({ status: 404 });
      expect((await service.status('org', 'p', session.uploadId)).state).toBe(
        'receiving'
      );
    }
  );
  it('rejeita caminho, offset errado, repeticao diferente e dados alem do declarado', async () => {
    const session = await begin();
    await expect(
      service.status('org', 'p', '../etc/passwd')
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.append('org', 'p', {
        uploadId: session.uploadId,
        offset: 1,
        base64: 'YQ==',
      })
    ).rejects.toMatchObject({ status: 409 });
    await service.append('org', 'p', {
      uploadId: session.uploadId,
      offset: 0,
      base64: 'YWJj',
    });
    await expect(
      service.append('org', 'p', {
        uploadId: session.uploadId,
        offset: 0,
        base64: 'eHl6',
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.append('org', 'p', {
        uploadId: session.uploadId,
        offset: 3,
        base64: bytes.toString('base64'),
      })
    ).rejects.toMatchObject({ status: 400 });
    expect((await service.status('org', 'p', session.uploadId)).offset).toBe(3);
  });
  it('recusa conclusao incompleta e hash final incorreto sem salvar', async () => {
    const session = await begin();
    await expect(
      service.complete('org', 'p', session.uploadId)
    ).rejects.toMatchObject({ status: 409 });
    await service.append('org', 'p', {
      uploadId: session.uploadId,
      offset: 0,
      base64: Buffer.from('xxxxxxxx').toString('base64'),
    });
    await expect(
      service.complete('org', 'p', session.uploadId)
    ).rejects.toMatchObject({ status: 400 });
    expect(transfer.fromPath).not.toHaveBeenCalled();
  });
  it('nao duplica gravacao quando complete falha depois de iniciar persistencia', async () => {
    const session = await begin();
    await service.append('org', 'p', {
      uploadId: session.uploadId,
      offset: 0,
      base64: bytes.toString('base64'),
    });
    transfer.fromPath.mockRejectedValueOnce(new Error('secret=SECRET'));
    await expect(
      service.complete('org', 'p', session.uploadId)
    ).rejects.toMatchObject({ status: 409 });
    expect((await service.status('org', 'p', session.uploadId)).state).toBe(
      'unknown'
    );
    await expect(
      service.complete('org', 'p', session.uploadId)
    ).rejects.toMatchObject({ status: 409 });
    expect(transfer.fromPath).toHaveBeenCalledTimes(1);
  });
  it('limita sessoes por org, libera quota no abort e recusa mais de 1 GiB', async () => {
    await begin();
    const second = await begin();
    await expect(begin()).rejects.toMatchObject({ status: 429 });
    await service.abort('org', 'p', second.uploadId);
    await expect(begin()).resolves.toHaveProperty('uploadId');
    await expect(
      service.begin('other', 'p', {
        filename: 'x.mp4',
        size: 1024 ** 3 + 1,
        sha256: digest(bytes),
      })
    ).rejects.toMatchObject({ status: 400 });
  });
  it('expira recebimento mas nao remove arquivo durante complete', async () => {
    const session = await begin();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 3600001);
    try {
      await service.cleanup();
      await expect(
        service.status('org', 'p', session.uploadId)
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      jest.restoreAllMocks();
    }
    const active = await begin();
    await service.append('org', 'p', {
      uploadId: active.uploadId,
      offset: 0,
      base64: bytes.toString('base64'),
    });
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transfer.fromPath.mockImplementationOnce(
      async (_o, _p, _n, path: string) => {
        await gate;
        expect(await readFile(path)).toEqual(bytes);
        return { id: 'm', name: 'x', path: '/uploads/x' };
      }
    );
    const complete = service.complete('org', 'p', active.uploadId);
    while (transfer.fromPath.mock.calls.length === 0)
      await new Promise((resolve) => setImmediate(resolve));
    jest.spyOn(Date, 'now').mockReturnValue(now + 7200001);
    try {
      await service.cleanup();
      await expect(
        service.abort('org', 'p', active.uploadId)
      ).rejects.toMatchObject({ status: 409 });
      release();
      await expect(complete).resolves.toMatchObject({ state: 'completed' });
    } finally {
      release();
      jest.restoreAllMocks();
    }
  });
  it('reconcilia cauda nao confirmada e protege diretorio privado', async () => {
    const session = await begin();
    const roots = await readdir(parent);
    const root = join(
      parent,
      roots.find((name) => name.startsWith('multipost-mcp-media-'))
    );
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    const path = join(root, `${session.uploadId}.part`);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await appendFile(path, 'tail');
    await service.append('org', 'p', {
      uploadId: session.uploadId,
      offset: 0,
      base64: bytes.toString('base64'),
    });
    expect(await readFile(path)).toEqual(bytes);
    await service.abort('org', 'p', session.uploadId);
  });
  it('nao segue symlink de arquivo temporario nem limpa raiz alheia', async () => {
    const outside = join(parent, 'outside');
    await writeFile(outside, 'keep');
    const session = await begin();
    const root = join(
      parent,
      (await readdir(parent)).find((name) =>
        name.startsWith('multipost-mcp-media-')
      )
    );
    const path = join(root, `${session.uploadId}.part`);
    await rm(path);
    await symlink(outside, path);
    await expect(
      service.append('org', 'p', {
        uploadId: session.uploadId,
        offset: 0,
        base64: bytes.toString('base64'),
      })
    ).rejects.toBeDefined();
    expect(await readFile(outside, 'utf8')).toBe('keep');
  });
});
