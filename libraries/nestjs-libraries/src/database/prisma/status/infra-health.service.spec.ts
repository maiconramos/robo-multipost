// ioRedis abre conexao no load; UploadFactory.createStorage roda no service.
// Mocks topo-de-modulo seguem o padrao dos demais specs.
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { status: 'ready', ping: jest.fn() },
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn() },
}));

import { InfraHealthService } from './infra-health.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';

const redis = ioRedis as unknown as { status: string; ping: jest.Mock };
const createStorage = UploadFactory.createStorage as jest.Mock;

const temporalOk = () => ({
  client: {
    getRawClient: () => ({
      connection: {
        workflowService: { getSystemInfo: jest.fn().mockResolvedValue({}) },
      },
    }),
  },
});

const okRepo = () => ({ ping: jest.fn().mockResolvedValue([{ x: 1 }]) });

const build = (repo: any, temporal: any) =>
  new InfraHealthService(repo as any, temporal as any);

const comp = (res: any, key: string) =>
  res.components.find((c: any) => c.key === key);

const ORIGINAL_ENV = { ...process.env };

describe('InfraHealthService', () => {
  beforeEach(() => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.STORAGE_PROVIDER = 'local';
    redis.status = 'ready';
    redis.ping = jest.fn().mockResolvedValue('PONG');
    createStorage.mockReturnValue({
      healthCheck: jest.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('sonda os 4 componentes e monta o summary quando tudo ok', async () => {
    const res = await build(okRepo(), temporalOk()).getHealth();

    expect(res.components).toHaveLength(4);
    expect(res.summary).toEqual({ ok: 4, warning: 0, error: 0 });
    expect(comp(res, 'storage').message).toBe('local'); // provider na mensagem
    expect(res.checkedAt).toEqual(expect.any(String));
  });

  it('uma sonda com erro NAO derruba o board (Promise.all nao curto-circuita)', async () => {
    const repo = { ping: jest.fn().mockRejectedValue(new Error('db down')) };

    const res = await build(repo, temporalOk()).getHealth();

    expect(res.components).toHaveLength(4); // os 4 presentes
    expect(comp(res, 'database').status).toBe('error');
    expect(comp(res, 'redis').status).toBe('ok');
    expect(res.summary).toEqual({ ok: 3, warning: 0, error: 1 });
  });

  it('redis sem REDIS_URL => warning e NAO chama ping (evita mock/queue)', async () => {
    delete process.env.REDIS_URL;

    const res = await build(okRepo(), temporalOk()).getHealth();

    expect(comp(res, 'redis').status).toBe('warning');
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('redis com status != ready => error e NAO chama ping (evita fila offline)', async () => {
    redis.status = 'reconnecting';

    const res = await build(okRepo(), temporalOk()).getHealth();

    const r = comp(res, 'redis');
    expect(r.status).toBe('error');
    expect(r.message).toContain('reconnecting');
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('temporal sem conexao => error', async () => {
    const temporalDown = { client: { getRawClient: () => ({}) } };

    const res = await build(okRepo(), temporalDown).getHealth();

    expect(comp(res, 'temporal').status).toBe('error');
    expect(comp(res, 'temporal').message).toContain('não conectado');
  });

  it('storage: createStorage lancando (provider invalido) vira error com o provider', async () => {
    process.env.STORAGE_PROVIDER = 'invalid';
    createStorage.mockImplementation(() => {
      throw new Error('Invalid storage type invalid');
    });

    const res = await build(okRepo(), temporalOk()).getHealth();

    const s = comp(res, 'storage');
    expect(s.status).toBe('error');
    expect(s.message).toContain('invalid:');
  });

  it('storage: healthCheck lancando (credencial errada) vira error', async () => {
    createStorage.mockReturnValue({
      healthCheck: jest.fn().mockRejectedValue(new Error('Access Denied')),
    });

    const res = await build(okRepo(), temporalOk()).getHealth();

    expect(comp(res, 'storage').status).toBe('error');
    expect(comp(res, 'storage').message).toContain('Access Denied');
  });

  it('cacheia por 30s; force ignora o cache e re-sonda', async () => {
    const repo = okRepo();
    const service = build(repo, temporalOk());

    await service.getHealth(); // sonda
    await service.getHealth(); // cache hit — nao re-sonda
    expect(repo.ping).toHaveBeenCalledTimes(1);

    await service.getHealth(true); // force — re-sonda
    expect(repo.ping).toHaveBeenCalledTimes(2);
  });
});
