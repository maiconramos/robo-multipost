import { createMock } from '../../test';
import { ZernioAutomationsService } from './zernio-automations.service';
import { ZernioAutomationsRepository } from '../../database/prisma/zernio-automations/zernio-automations.repository';
import {
  ZernioAutomationClient,
  ZernioAutomationError,
} from './zernio-automation.client';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { OrganizationService } from '../../database/prisma/organizations/organization.service';
const scope = { organizationId: 'org', profileId: 'client' };
const aid = 'a'.repeat(24),
  pid = 'b'.repeat(24),
  rid = 'c'.repeat(24);
const config = {
  name: 'Regra',
  integrationId: 'ig',
  platform: 'instagram' as const,
  triggerType: 'comment_on_post' as const,
  postMode: 'all' as const,
  dmMessage: 'Oi',
  activate: false,
};
describe('automacao Instagram remota', () => {
  const repo = createMock<ZernioAutomationsRepository>(),
    api = createMock<ZernioAutomationClient>(),
    profiles = createMock<ProfileService>(),
    orgs = createMock<OrganizationService>();
  let svc: ZernioAutomationsService;
  let row: any;
  let remote: any;
  beforeEach(() => {
    jest.resetAllMocks();
    row = {
      id: 'local',
      ...scope,
      integrationId: 'ig',
      name: 'Regra',
      status: 'DRAFT',
      revision: 1,
      definition: {
        schemaVersion: 1,
        configuration: config,
        sync: { state: 'idle' },
      },
    };
    remote = {
      id: rid,
      accountId: aid,
      platform: 'instagram',
      name: 'Regra',
      isActive: false,
    };
    repo.integration.mockResolvedValue({
      id: 'ig',
      name: 'Conta',
      providerIdentifier: 'zernio-instagram',
      customInstanceDetails: JSON.stringify({
        zernioAccountId: aid,
        zernioProfileId: pid,
      }),
    } as any);
    repo.create.mockImplementation(async () => row);
    repo.get.mockImplementation(async () => row);
    repo.write.mockImplementation(async (_s, _id, rev, d, status) => {
      if (rev !== row.revision) throw new Error('REVISION_CONFLICT');
      row = {
        ...row,
        revision: rev + 1,
        definition: JSON.parse(JSON.stringify(d)),
        ...(status ? { status } : {}),
      };
      return row;
    });
    profiles.getProfileById.mockResolvedValue({ id: 'client' } as any);
    profiles.getDecryptedZernioApiKey.mockResolvedValue('profile-key');
    api.request.mockImplementation(async (_key, path, method, body) => {
      if (path === '/accounts')
        return {
          accounts: [
            {
              _id: aid,
              profileId: pid,
              platform: 'instagram',
              isActive: true,
              scopeAreas: ['comments', 'messaging'],
            },
          ],
        };
      if (path === '/comment-automations' && method === 'POST') {
        remote = {
          ...remote,
          ...body,
          id: rid,
          accountId: aid,
          platform: 'instagram',
        };
        return { success: true, automation: remote };
      }
      if (path === `/comment-automations/${rid}`) {
        if (method === 'PATCH') remote = { ...remote, ...body };
        return { success: true, automation: remote };
      }
      return {};
    });
    svc = new ZernioAutomationsService(repo, api, profiles, orgs);
  });
  it('salva rascunho sem criar regra remota', async () => {
    const result = await svc.create(scope, config);
    expect(result.executionVersion).toBe(3);
    expect(api.request.mock.calls.some((c) => c[2] === 'POST')).toBe(false);
  });
  it('cria pausada, persiste ID e ativa a mesma regra', async () => {
    const result = await svc.status(scope, 'local', 1, 'ACTIVE');
    expect(result.status).toBe('ACTIVE');
    const calls = api.request.mock.calls.filter(
      (c) => c[2] === 'POST' || c[2] === 'PATCH'
    );
    expect(calls[0][3]).toMatchObject({
      isActive: false,
      profileId: pid,
      accountId: aid,
    });
    expect(calls[1][1]).toBe(`/comment-automations/${rid}`);
    expect(row.definition.remote.automationId).toBe(rid);
  });
  it('nao cria novamente apos timeout', async () => {
    api.request.mockImplementation(async (_key, path, method) => {
      if (method === 'POST')
        throw new ZernioAutomationError('ZERNIO_OUTCOME_UNKNOWN', 502, true);
      return path === '/accounts'
        ? {
            accounts: [
              {
                _id: aid,
                profileId: pid,
                platform: 'instagram',
                isActive: true,
              },
            ],
          }
        : { automations: [] };
    });
    await expect(svc.status(scope, 'local', 1, 'ACTIVE')).rejects.toThrow(
      'ZERNIO_OUTCOME_UNKNOWN'
    );
    expect(row.definition.sync.state).toBe('unknown');
    await expect(
      svc.status(scope, 'local', row.revision, 'ACTIVE')
    ).rejects.toThrow();
    expect(api.request.mock.calls.filter((c) => c[2] === 'POST')).toHaveLength(
      1
    );
  });
  it('recusa conta remota de outro perfil antes de escrever', async () => {
    api.request.mockResolvedValue({
      accounts: [
        {
          _id: aid,
          profileId: 'foreign',
          platform: 'instagram',
          isActive: true,
        },
      ],
    });
    await expect(svc.status(scope, 'local', 1, 'ACTIVE')).rejects.toThrow(
      'ZERNIO_ACCOUNT_MISMATCH'
    );
    expect(repo.write).not.toHaveBeenCalled();
  });
  it('nao herda chave geral sem compartilhamento explicito', async () => {
    profiles.getDecryptedZernioApiKey.mockResolvedValue(null);
    orgs.getShareZernioWithProfiles.mockResolvedValue({
      shareZernioWithProfiles: false,
    } as any);
    await expect(svc.readiness(scope, 'ig')).resolves.toMatchObject({
      ready: false,
      reason: 'ZERNIO_KEY_REQUIRED',
    });
    expect(orgs.getDecryptedZernioApiKey).not.toHaveBeenCalled();
  });
  it('recusa revisao obsoleta antes da rede', async () => {
    await expect(svc.status(scope, 'local', 9, 'ACTIVE')).rejects.toThrow(
      'REVISION_CONFLICT'
    );
    expect(api.request).not.toHaveBeenCalled();
  });
  it('nao consulta log de binding que mudou de conta', async () => {
    row.definition.remote = {
      automationId: rid,
      accountId: 'foreign',
      profileId: pid,
    };
    await expect(svc.history(scope, 'local', {})).rejects.toThrow(
      'ZERNIO_ACCOUNT_MISMATCH'
    );
    expect(api.request.mock.calls.some((c) => c[1].includes(rid))).toBe(false);
  });
  it('nao recupera uma operacao ainda pendente mesmo depois de horas', async () => {
    row.definition.sync = {
      state: 'pending',
      operation: {
        id: 'op',
        type: 'create',
        phase: 'create_paused',
        startedAt: new Date(0).toISOString(),
        desiredStatus: 'ACTIVE',
        configuration: config,
      },
    };
    await expect(svc.status(scope, 'local', 1, 'PAUSED')).rejects.toThrow(
      'ZERNIO_OPERATION_IN_PROGRESS'
    );
    expect(api.request).not.toHaveBeenCalled();
  });
  it('nao declara pausada uma ativacao com PATCH incerto', async () => {
    row.definition.remote = {
      automationId: rid,
      accountId: aid,
      profileId: pid,
    };
    row.definition.sync = {
      state: 'unknown',
      operation: {
        id: 'op',
        type: 'create',
        phase: 'apply',
        startedAt: new Date(0).toISOString(),
        desiredStatus: 'ACTIVE',
        configuration: config,
      },
    };
    remote = {
      ...remote,
      trigger: 'comment',
      keywords: [],
      matchMode: 'contains',
      platformPostId: null,
      dmMessage: 'Oi',
      isActive: false,
    };
    await expect(svc.status(scope, 'local', 1, 'PAUSED')).rejects.toThrow(
      'ZERNIO_RECONCILIATION_REQUIRED'
    );
    expect(repo.write).not.toHaveBeenCalled();
  });
  it('recuperacao confirmada exige repetir a acao em vez de ignorar pedido de pausa', async () => {
    row.definition.remote = {
      automationId: rid,
      accountId: aid,
      profileId: pid,
    };
    row.definition.sync = {
      state: 'unknown',
      operation: {
        id: 'op',
        type: 'status',
        phase: 'apply',
        startedAt: new Date(0).toISOString(),
        desiredStatus: 'ACTIVE',
        configuration: config,
      },
    };
    remote = {
      ...remote,
      trigger: 'comment',
      keywords: [],
      matchMode: 'contains',
      platformPostId: null,
      dmMessage: 'Oi',
      isActive: true,
    };
    try {
      await svc.status(scope, 'local', 1, 'PAUSED');
      throw new Error('expected rejection');
    } catch (e) {
      expect((e as any).getResponse()).toMatchObject({
        message: 'ZERNIO_RECOVERED_RETRY_ACTION',
        actionApplied: false,
      });
    }
    expect(row.status).toBe('ACTIVE');
    expect(row.definition.sync.state).toBe('idle');
  });

  it('duas ativacoes concorrentes criam uma unica regra', async () => {
    const results = await Promise.allSettled([
      svc.status(scope, 'local', 1, 'ACTIVE'),
      svc.status(scope, 'local', 1, 'ACTIVE'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(api.request.mock.calls.filter((c) => c[2] === 'POST')).toHaveLength(
      1
    );
  });
  it('nao modifica regra remota que pertence a outra conta', async () => {
    row.definition.remote = {
      automationId: rid,
      accountId: aid,
      profileId: pid,
    };
    remote.accountId = 'foreign';
    await expect(svc.status(scope, 'local', 1, 'ACTIVE')).rejects.toThrow(
      'ZERNIO_ACCOUNT_MISMATCH'
    );
    expect(api.request.mock.calls.some((c) => c[2] === 'PATCH')).toBe(false);
  });
  it('nao ativa conta autorizada somente para publicar', async () => {
    api.request.mockResolvedValue({
      accounts: [
        {
          _id: aid,
          profileId: pid,
          platform: 'instagram',
          isActive: true,
          scopeAreas: ['posting'],
        },
      ],
    });
    await expect(svc.status(scope, 'local', 1, 'ACTIVE')).rejects.toThrow(
      'ZERNIO_AUTHORIZATION_REQUIRED'
    );
    expect(repo.write).not.toHaveBeenCalled();
  });
  it('herda chave somente da organizacao autorizada', async () => {
    profiles.getDecryptedZernioApiKey.mockResolvedValue(null);
    orgs.getShareZernioWithProfiles.mockResolvedValue({
      shareZernioWithProfiles: true,
    } as any);
    orgs.getDecryptedZernioApiKey.mockResolvedValue('org-key');
    await expect(svc.readiness(scope, 'ig')).resolves.toMatchObject({
      ready: true,
    });
    expect(orgs.getDecryptedZernioApiKey).toHaveBeenCalledWith('org');
    expect(api.request.mock.calls[0][0]).toBe('org-key');
  });
  it('perfil padrao usa sua chave de organizacao sem liberar outros clientes', async () => {
    profiles.getProfileById.mockResolvedValue({
      id: 'client',
      isDefault: true,
    } as any);
    profiles.getDecryptedZernioApiKey.mockResolvedValue(null);
    orgs.getDecryptedZernioApiKey.mockResolvedValue('default-org-key');
    await expect(svc.readiness(scope, 'ig')).resolves.toMatchObject({
      ready: true,
    });
    expect(orgs.getShareZernioWithProfiles).not.toHaveBeenCalled();
  });
  it('arquiva somente depois de confirmar pausa remota', async () => {
    row.status = 'ACTIVE';
    row.definition.remote = {
      automationId: rid,
      accountId: aid,
      profileId: pid,
    };
    remote.isActive = true;
    const result = await svc.status(scope, 'local', 1, 'ARCHIVED');
    expect(remote.isActive).toBe(false);
    expect(result.status).toBe('ARCHIVED');
  });
  it('edita e reativa alvo ja confirmado mesmo fora dos posts recentes', async () => {
    row.definition.configuration = {
      ...config,
      postMode: 'specific',
      postIds: ['123'],
    };
    row.status = 'ACTIVE';
    row.definition.sync = { state: 'idle' };
    row.definition.remote = {
      automationId: rid,
      accountId: aid,
      profileId: pid,
    };
    remote.platformPostId = '123';
    remote.isActive = true;
    api.request.mockClear();
    const updated = await svc.update(scope, 'local', {
      configuration: { dmMessage: 'Novo' },
      expectedRevision: row.revision,
    });
    expect(updated.status).toBe('ACTIVE');
    await svc.status(scope, 'local', row.revision, 'PAUSED');
    await svc.status(scope, 'local', row.revision, 'ACTIVE');
    expect(api.request.mock.calls.some((c) => c[1].endsWith('/posts'))).toBe(
      false
    );
  });
});
