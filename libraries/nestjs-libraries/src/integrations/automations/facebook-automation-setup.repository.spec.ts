import 'reflect-metadata';
import { FacebookAutomationSetupRepository } from './facebook-automation-setup.repository';
import { EncryptionService } from '../../crypto/encryption.service';
import { ioRedis } from '../../redis/redis.service';
import type { MessengerObservation } from './facebook-messenger-probe';

jest.mock('../../redis/redis.service', () => ({
  ioRedis: {
    status: 'ready',
    set: jest.fn(),
    get: jest.fn(),
    getdel: jest.fn(),
    eval: jest.fn(),
    disconnect: jest.fn(),
  },
}));

describe('FacebookAutomationSetupRepository', () => {
  const ctx = { organizationId: 'org', profileId: 'profile', userId: 'user' };
  const connection = {
    ...ctx,
    integrationId: 'integration',
    appId: '456',
    pageId: '123',
    appSecret: 'SECRET',
    pageToken: 'PAGE',
  };
  let repository: FacebookAutomationSetupRepository;
  let model: any;
  const encryption = new EncryptionService();
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-only-key';
    model = {
      integration: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      providerCredential: {
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    model.$queryRaw = jest
      .fn()
      .mockResolvedValue([{ encryptedData: 'source' }]);
    model.$transaction = jest.fn(async (fn: any) => fn(model));
    repository = new FacebookAutomationSetupRepository(
      { model } as any,
      encryption,
      ioRedis
    );
    jest.clearAllMocks();
  });
  it('serializa inscricao por app e pagina e confirma posse antes do POST', async () => {
    (ioRedis.set as jest.Mock)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null);
    (ioRedis.eval as jest.Mock).mockResolvedValue(1);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = repository.withPageSubscriptionLock(
      connection,
      async (assertLease) => {
        await assertLease();
        await pending;
        return 'ok';
      }
    );
    await expect(
      repository.withPageSubscriptionLock(connection, async () => 'bad')
    ).rejects.toThrow('SUBSCRIPTION_UPDATE_BUSY');
    release();
    expect(await first).toBe('ok');
    expect((ioRedis.set as jest.Mock).mock.calls[0][0]).toBe(
      (ioRedis.set as jest.Mock).mock.calls[1][0]
    );
    (ioRedis.set as jest.Mock).mockResolvedValueOnce('OK');
    (ioRedis.eval as jest.Mock).mockResolvedValue(0);
    await expect(
      repository.withPageSubscriptionLock(connection, async (assertLease) =>
        assertLease()
      )
    ).rejects.toThrow('SUBSCRIPTION_UPDATE_BUSY');
  });
  it('limita consultas de publicacao por aplicativo e Pagina e falha fechado sem Redis', async () => {
    (ioRedis.eval as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockRejectedValueOnce(new Error('redis secret'));
    await expect(
      repository.consumePostLookupBudget(connection)
    ).resolves.toBeUndefined();
    await expect(
      repository.consumePostLookupBudget(connection)
    ).rejects.toThrow('POST_LOOKUP_RATE_LIMITED');
    await expect(
      repository.consumePostLookupBudget(connection)
    ).rejects.toThrow('POST_LOOKUP_RETRY');
    const [, count, appKey, pageKey] = (ioRedis.eval as jest.Mock).mock
      .calls[0];
    expect(count).toBe(2);
    expect(appKey).toBe('fbauto:post-lookup:{456}:app');
    expect(pageKey).toBe('fbauto:post-lookup:{456}:page:123');
  });
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('exige armamento temporario do mesmo app pagina organizacao e perfil', async () => {
    const now = Date.now();
    const arm = {
      ...ctx,
      integrationId: 'integration',
      pageId: '123',
      appId: '456',
      nonce: 'a'.repeat(32),
      issuedAt: now - 1000,
      expiresAt: now + 3600000,
    };
    (ioRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(arm));
    expect(await repository.getMessengerProbe(connection)).toEqual(arm);
    expect(ioRedis.get).toHaveBeenCalledWith(
      'fbauto:messenger-probe:org:profile:integration:456:123'
    );
    for (const value of [
      null,
      '{bad json',
      JSON.stringify({ ...arm, expiresAt: now - 1 }),
      JSON.stringify({ ...arm, profileId: 'foreign' }),
    ]) {
      (ioRedis.get as jest.Mock).mockResolvedValue(value);
      expect(await repository.getMessengerProbe(connection)).toBeNull();
    }
  });

  it('reserva armazenamento atomico limitado sem renovar armamento nem gravar credenciais', async () => {
    const now = Date.now();
    const arm = {
      organizationId: 'org',
      profileId: 'profile',
      integrationId: 'integration',
      pageId: '123',
      appId: '456',
      nonce: 'a'.repeat(32),
      issuedAt: now - 1000,
      expiresAt: now + 3600000,
    };
    const observation: MessengerObservation = {
      receivedAt: new Date(now).toISOString(),
      occurredAt: now,
      messageHash: 'b'.repeat(64),
      hasText: true,
      isEcho: false,
      isUnsupported: false,
      attachmentTypes: [],
      fields: { text: 'string' },
      unknownFieldCount: 0,
      truncated: false,
    };
    await repository.saveMessengerObservation(connection, arm, observation);
    const args = (ioRedis.eval as jest.Mock).mock.lastCall;
    expect(args.slice(1, 4)).toEqual([
      2,
      'fbauto:messenger-probe:org:profile:integration:456:123',
      'fbauto:messenger-probe-records:org:profile:integration:456:123',
    ]);
    expect(args[0]).toContain('20');
    expect(args[0]).toContain('EXPIRE');
    expect(JSON.stringify(args)).not.toMatch(/SECRET|TOKEN|PAGE/);
    expect(ioRedis.set).not.toHaveBeenCalled();
    (ioRedis.eval as jest.Mock).mockClear();
    await repository.saveMessengerObservation(
      connection,
      { ...arm, expiresAt: now - 1 },
      observation
    );
    expect(ioRedis.eval).not.toHaveBeenCalled();
  });

  it('cifra JSON completo com escopo e sessao e falha fechado sem chave', async () => {
    const now = Date.now();
    const arm = {
      ...ctx,
      integrationId: 'integration',
      appId: '456',
      pageId: '123',
      nonce: 'b'.repeat(32),
      issuedAt: now - 1000,
      expiresAt: now + 60000,
      mode: 'full-json' as const,
      testTexts: ['Teste Story MultiPost a1b2c3', 'Teste DM MultiPost a1b2c3'],
    };
    const capture = {
      receivedAt: new Date(now).toISOString(),
      status: 'captured' as const,
      bodyHash: 'c'.repeat(64),
      testIndexes: [0],
      rawJson: '{"is_story":true,"unknown":"PRIVADO"}',
    };
    await repository.saveMessengerFullCapture(connection, arm, capture);
    const args = (ioRedis.eval as jest.Mock).mock.lastCall;
    expect(args[3]).toBe(
      'fbauto:messenger-full-records:org:profile:integration:456:123:' +
        arm.nonce
    );
    const row = JSON.parse(args[5]);
    expect(row.rawJson).toBeUndefined();
    expect(JSON.stringify(args)).not.toContain('PRIVADO');
    expect(encryption.decryptJson(row.encryptedJson)).toMatchObject({
      nonce: arm.nonce,
      organizationId: 'org',
      profileId: 'profile',
      pageId: '123',
      rawJson: capture.rawJson,
    });
    const jwt = process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;
    (ioRedis.eval as jest.Mock).mockClear();
    await repository.saveMessengerFullCapture(connection, arm, capture);
    expect(ioRedis.eval).not.toHaveBeenCalled();
    if (jwt !== undefined) process.env.JWT_SECRET = jwt;
  });

  it('retém diagnostico vinculado a credencial e confirmacao anterior sem marcar falha como pronta', async () => {
    const ready = {
      stage: 'RECEIVING_READY',
      checkedAt: '2026-10-22T18:00:00Z',
      reasons: [],
      missingPermissions: [],
      automaticRepliesAvailable: false,
    } as const;
    (ioRedis.get as jest.Mock).mockResolvedValue(null);
    await repository.saveStatus(
      ctx,
      'integration',
      ready as any,
      'fingerprint'
    );
    const saved = (ioRedis.set as jest.Mock).mock.lastCall;
    expect(saved[3]).toBe(30 * 86400);
    (ioRedis.get as jest.Mock).mockResolvedValue(saved[1]);
    expect(
      await repository.getStatus(ctx, 'integration', 'different')
    ).toBeNull();
    await repository.saveStatus(
      ctx,
      'integration',
      { ...ready, stage: 'CHECK_FAILED' } as any,
      'fingerprint'
    );
    const failed = JSON.parse(
      (ioRedis.set as jest.Mock).mock.lastCall[1]
    ).status;
    expect(failed.stage).toBe('CHECK_FAILED');
    expect(failed.lastReadyAt).toBe(ready.checkedAt);
  });
  it('consulta integracao com perfil exato, sem aceitar legado nulo', async () => {
    await repository.getPage(ctx, 'integration');
    expect(model.integration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'integration',
          organizationId: 'org',
          profileId: 'profile',
          providerIdentifier: 'facebook',
          disabled: false,
          inBetweenSteps: false,
          deletedAt: null,
          clientProfile: { deletedAt: null },
        }),
      })
    );
  });
  it('armazena somente no namespace interno cifrado, sem tocar token de publicacao', async () => {
    await repository.saveConnection(connection);
    const args = model.providerCredential.upsert.mock.calls[0][0];
    expect(args.create.provider).toBe('facebook-automation:456:123');
    expect(args.create.profileId).toBe('profile');
    expect(args.create.organizationId).toBe('org');
    expect(args.create.encryptedData).not.toContain('SECRET');
    expect(encryption.decryptJson(args.create.encryptedData)).toEqual(
      connection
    );
    expect(args.update.encryptedData).toBe(args.create.encryptedData);
  });
  it('substitui com comparacao atomica da revisao e escopo exato', async () => {
    model.integration.findFirst.mockResolvedValue({
      id: 'integration',
      internalId: '123',
    });
    await repository.replaceConnection(connection, 'old', 'source');
    const args = model.providerCredential.updateMany.mock.lastCall[0];
    expect(args.where).toEqual({
      organizationId: 'org',
      profileId: 'profile',
      provider: 'facebook-automation:456:123',
      encryptedData: 'old',
    });
    expect(encryption.decryptJson(args.data.encryptedData)).toEqual(connection);
    model.providerCredential.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      repository.replaceConnection(connection, 'old', 'source')
    ).rejects.toMatchObject({ status: 409 });
    expect(model.providerCredential.upsert).not.toHaveBeenCalled();
  });
  it('cria sem sobrescrever autorizacao concorrente quando nao havia conexao', async () => {
    model.integration.findFirst.mockResolvedValue({
      id: 'integration',
      internalId: '123',
    });
    model.providerCredential.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      repository.replaceConnection(connection, null, 'source')
    ).rejects.toMatchObject({ status: 409 });
    expect(model.providerCredential.upsert).not.toHaveBeenCalled();
  });
  it('nao grava se credencial fonte mudou antes do bloqueio transacional', async () => {
    model.$queryRaw.mockResolvedValue([{ encryptedData: 'changed' }]);
    await expect(
      repository.replaceConnection(connection, 'old', 'source')
    ).rejects.toMatchObject({ status: 409 });
    expect(model.providerCredential.updateMany).not.toHaveBeenCalled();
    expect(model.providerCredential.create).not.toHaveBeenCalled();
  });
  it('rejeita perfil removido da organizacao entre validacao e transacao', async () => {
    model.$queryRaw
      .mockResolvedValueOnce([{ encryptedData: 'source' }])
      .mockResolvedValueOnce([]);
    model.integration.findFirst.mockResolvedValue({ internalId: '123' });
    await expect(
      repository.replaceConnection(connection, 'old', 'source')
    ).rejects.toMatchObject({ status: 409 });
    expect(model.providerCredential.updateMany).not.toHaveBeenCalled();
  });
  it('nao grava se a pagina saiu do perfil ou mudou de identidade antes do bloqueio', async () => {
    model.integration.findFirst.mockResolvedValue({ internalId: '999' });
    await expect(
      repository.replaceConnection(connection, 'old', 'source')
    ).rejects.toMatchObject({ status: 409 });
    expect(model.providerCredential.updateMany).not.toHaveBeenCalled();
  });
  it('le somente a revisao do namespace da pagina no perfil', async () => {
    model.providerCredential.findFirst.mockResolvedValue({
      encryptedData: 'revision',
    });
    expect(await repository.getConnectionRevision(ctx, '456', '123')).toBe(
      'revision'
    );
    expect(model.providerCredential.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        profileId: 'profile',
        provider: 'facebook-automation:456:123',
      },
      select: { encryptedData: true },
    });
  });
  it('usa GETDEL atomico e TTL curto no OAuth', async () => {
    await repository.saveState('state', ctx as any);
    expect(ioRedis.set).toHaveBeenCalledWith(
      'fbauto:state:state',
      JSON.stringify(ctx),
      'EX',
      600
    );
    (ioRedis.getdel as jest.Mock).mockResolvedValue(JSON.stringify(ctx));
    expect(await repository.takeState('state')).toEqual(ctx);
    expect(ioRedis.getdel).toHaveBeenCalledWith('fbauto:state:state');
  });
  it('limita leitura publica ao app e paginas presentes no lote', async () => {
    await repository.findConnections('456', ['123']);
    expect(model.providerCredential.findMany).toHaveBeenCalledWith({
      where: {
        provider: { in: ['facebook-automation:456:123'] },
        profileId: { not: null },
      },
      take: 201,
    });
  });
  it('falha fechada quando Redis esta indisponivel ou o orcamento acaba', async () => {
    (ioRedis.eval as jest.Mock)
      .mockResolvedValueOnce(60)
      .mockResolvedValueOnce(61)
      .mockRejectedValueOnce(new Error('private redis details'));
    expect(await repository.allowWebhook('456')).toBe(true);
    expect(await repository.allowWebhook('456')).toBe(false);
    await expect(repository.allowWebhook('456')).rejects.toMatchObject({
      status: 503,
      message: 'SETUP_STORAGE_UNAVAILABLE',
    });
  });

  it('orcamento e separado por app (lixo num app nao trava os outros)', async () => {
    (ioRedis.eval as jest.Mock).mockResolvedValue(1);
    await repository.allowWebhook('111');
    await repository.allowWebhook('222');
    const keys = (ioRedis.eval as jest.Mock).mock.calls.slice(-2).map((c) => c[2]);
    expect(keys[0]).toMatch(/^fbauto:public-budget:111:/);
    expect(keys[1]).toMatch(/^fbauto:public-budget:222:/);
  });
});
