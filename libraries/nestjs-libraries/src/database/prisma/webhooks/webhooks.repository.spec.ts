import { createPrismaRepositoryMock } from '../../../test';
import type { Prisma } from '@prisma/client';
import { WebhooksRepository } from './webhooks.repository';

describe('WebhooksRepository - exclusao de organizacao', () => {
  it('leitura do worker nao resolve webhook de organizacao excluida', async () => {
    const hooks = createPrismaRepositoryMock('webhooks');
    const repo = new WebhooksRepository(hooks as any, createPrismaRepositoryMock('integration') as any);
    await repo.getWebhooks('org');
    expect(hooks.model.webhooks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          deletedAt: null,
          organization: { deletedAt: null },
        },
      })
    );
  });
  it('nao vincula canal de outro perfil ou de outra org ao webhook', async () => {
    const hooks = createPrismaRepositoryMock('webhooks');
    const integration = createPrismaRepositoryMock('integration');
    integration.model.integration.count.mockResolvedValue(1);
    const repo = new WebhooksRepository(hooks as any, integration as any);
    await expect(
      repo.createWebhook(
        'org',
        {
          name: 'x',
          url: 'https://hooks.example/x',
          integrations: [{ id: 'int-A' }, { id: 'int-B' }],
        } as any,
        'profile-A'
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(integration.model.integration.count).toHaveBeenCalledWith({
      where: {
        id: { in: ['int-A', 'int-B'] },
        organizationId: 'org',
        deletedAt: null,
        OR: [{ profileId: 'profile-A' }, { profileId: null }],
      },
    });
    expect(hooks.model.webhooks.upsert).not.toHaveBeenCalled();
  });

  it('nao edita webhook de outro perfil pelo id', async () => {
    const hooks = createPrismaRepositoryMock('webhooks');
    const integration = createPrismaRepositoryMock('integration');
    hooks.model.webhooks.findFirst.mockResolvedValue(null);
    const repo = new WebhooksRepository(hooks as any, integration as any);
    await expect(
      repo.createWebhook(
        'org',
        { id: 'wh-B', name: 'x', url: 'https://hooks.example/x', integrations: [] } as any,
        'profile-A'
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(hooks.model.webhooks.findFirst).toHaveBeenCalledWith({
      where: { id: 'wh-B', organizationId: 'org', deletedAt: null, profileId: 'profile-A' },
      select: { id: true },
    });
    expect(hooks.model.webhooks.upsert).not.toHaveBeenCalled();
  });

  it('editar o proprio webhook nao move o perfil dele', async () => {
    const hooks = createPrismaRepositoryMock('webhooks');
    const integration = createPrismaRepositoryMock('integration');
    hooks.model.webhooks.findFirst.mockResolvedValue({ id: 'wh-A' });
    hooks.model.webhooks.upsert.mockResolvedValue({ id: 'wh-A' });
    const repo = new WebhooksRepository(hooks as any, integration as any);
    await repo.createWebhook(
      'org',
      { id: 'wh-A', name: 'novo', url: 'https://hooks.example/novo', integrations: [] } as any,
      'profile-A'
    );
    expect(hooks.model.webhooks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { url: 'https://hooks.example/novo', name: 'novo' },
      })
    );
  });

  it('leitura e contagem do painel preservam perfil e exclusao logica', async () => {
    const hooks = createPrismaRepositoryMock('webhooks');
    const repo = new WebhooksRepository(hooks as any, createPrismaRepositoryMock('integration') as any);
    await repo.getWebhooks('org', 'profile');
    await repo.getTotal('org', 'profile');
    const where: Prisma.WebhooksWhereInput = {
      organizationId: 'org',
      profileId: 'profile',
      deletedAt: null,
      organization: { deletedAt: null },
    };
    expect(hooks.model.webhooks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where })
    );
    expect(hooks.model.webhooks.count).toHaveBeenCalledWith({ where });
  });
});
