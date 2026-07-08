// ioRedis abre conexao no load; UploadFactory.createStorage roda no service;
// resend seria carregado pelo checkEmail. Mocks topo-de-modulo.
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { status: 'ready', ping: jest.fn() },
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn() },
}));
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    domains: { list: jest.fn().mockResolvedValue({ data: [], error: null }) },
  })),
}));

import { InfraHealthService } from './infra-health.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { Resend } from 'resend';

const redis = ioRedis as unknown as { status: string; ping: jest.Mock };
const createStorage = UploadFactory.createStorage as jest.Mock;
const ResendMock = Resend as unknown as jest.Mock;

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
    delete process.env.STATUS_INFRA_HEALTH_ENABLED; // default = habilitado
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.STORAGE_PROVIDER = 'local';
    // Baseline de email: SMTP com todas as variaveis => ok (com note de presenca).
    process.env.EMAIL_PROVIDER = 'nodemailer';
    process.env.EMAIL_HOST = 'smtp.example.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USER = 'user';
    process.env.EMAIL_PASS = 'pass';
    redis.status = 'ready';
    redis.ping = jest.fn().mockResolvedValue('PONG');
    createStorage.mockReturnValue({
      healthCheck: jest.fn().mockResolvedValue(undefined),
    });
    ResendMock.mockImplementation(() => ({
      domains: { list: jest.fn().mockResolvedValue({ data: [], error: null }) },
    }));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('sonda os 5 componentes e monta o summary quando tudo ok', async () => {
    const res = await build(okRepo(), temporalOk()).getHealth();

    expect(res.enabled).toBe(true);
    expect(res.components).toHaveLength(5);
    expect(res.summary).toEqual({ ok: 5, warning: 0, error: 0 });
    expect(comp(res, 'storage').message).toBe('local');
    // SMTP presente => ok, com tooltip de "so presenca"
    expect(comp(res, 'email').status).toBe('ok');
    expect(comp(res, 'email').note).toContain('presença');
    expect(res.checkedAt).toEqual(expect.any(String));
  });

  it('gate desabilitado (STATUS_INFRA_HEALTH_ENABLED=false) NAO sonda nada', async () => {
    process.env.STATUS_INFRA_HEALTH_ENABLED = 'false';
    const repo = okRepo();

    const res = await build(repo, temporalOk()).getHealth();

    expect(res.enabled).toBe(false);
    expect(res.components).toHaveLength(0);
    expect(res.summary).toEqual({ ok: 0, warning: 0, error: 0 });
    expect(repo.ping).not.toHaveBeenCalled();
  });

  it('uma sonda com erro NAO derruba o board (Promise.all nao curto-circuita)', async () => {
    const repo = { ping: jest.fn().mockRejectedValue(new Error('db down')) };

    const res = await build(repo, temporalOk()).getHealth();

    expect(res.components).toHaveLength(5);
    expect(comp(res, 'database').status).toBe('error');
    expect(comp(res, 'redis').status).toBe('ok');
    expect(res.summary).toEqual({ ok: 4, warning: 0, error: 1 });
  });

  it('redis sem REDIS_URL => warning e NAO chama ping', async () => {
    delete process.env.REDIS_URL;

    const res = await build(okRepo(), temporalOk()).getHealth();

    expect(comp(res, 'redis').status).toBe('warning');
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('redis com status != ready => error e NAO chama ping', async () => {
    redis.status = 'reconnecting';

    const res = await build(okRepo(), temporalOk()).getHealth();

    expect(comp(res, 'redis').status).toBe('error');
    expect(comp(res, 'redis').message).toContain('reconnecting');
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

    expect(comp(res, 'storage').status).toBe('error');
    expect(comp(res, 'storage').message).toContain('invalid:');
  });

  it('storage: healthCheck lancando (credencial errada) vira error', async () => {
    createStorage.mockReturnValue({
      healthCheck: jest.fn().mockRejectedValue(new Error('Access Denied')),
    });

    const res = await build(okRepo(), temporalOk()).getHealth();

    expect(comp(res, 'storage').status).toBe('error');
    expect(comp(res, 'storage').message).toContain('Access Denied');
  });

  describe('email', () => {
    it('sem EMAIL_PROVIDER => warning (nao configurado)', async () => {
      delete process.env.EMAIL_PROVIDER;

      const res = await build(okRepo(), temporalOk()).getHealth();

      expect(comp(res, 'email').status).toBe('warning');
    });

    it('resend: valida a chave ativamente (domains.list ok) => ok', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 're_valida';

      const res = await build(okRepo(), temporalOk()).getHealth();

      expect(comp(res, 'email').status).toBe('ok');
      expect(comp(res, 'email').message).toBe('Resend');
    });

    it('resend: domains.list com error => error (chave invalida)', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 're_invalida';
      ResendMock.mockImplementation(() => ({
        domains: {
          list: jest
            .fn()
            .mockResolvedValue({ data: null, error: { name: 'x', message: 'unauthorized' } }),
        },
      }));

      const res = await build(okRepo(), temporalOk()).getHealth();

      expect(comp(res, 'email').status).toBe('error');
      expect(comp(res, 'email').message).toContain('unauthorized');
    });

    it('resend sem RESEND_API_KEY => warning', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      delete process.env.RESEND_API_KEY;

      const res = await build(okRepo(), temporalOk()).getHealth();

      expect(comp(res, 'email').status).toBe('warning');
    });
  });

  it('cacheia 30s; force ignora o cache mas respeita o piso de 5s (anti-loop)', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      const repo = okRepo();
      const service = build(repo, temporalOk());

      nowSpy.mockReturnValue(1_000);
      await service.getHealth(); // sonda (ping 1)

      nowSpy.mockReturnValue(2_000);
      await service.getHealth(); // cache hit (dentro dos 30s) — nao re-sonda
      expect(repo.ping).toHaveBeenCalledTimes(1);

      // force DENTRO do piso de 5s => devolve cache (protege contra loop de refresh)
      nowSpy.mockReturnValue(3_000);
      await service.getHealth(true);
      expect(repo.ping).toHaveBeenCalledTimes(1);

      // force APOS o piso => re-sonda
      nowSpy.mockReturnValue(10_000);
      await service.getHealth(true);
      expect(repo.ping).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
