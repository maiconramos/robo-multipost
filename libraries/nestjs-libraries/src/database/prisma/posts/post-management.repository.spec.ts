import { createMock } from '../../../test';
import { PrismaService } from '../prisma.service';
import {
  managedPostVersion,
  PostManagementRepository,
} from './post-management.repository';
describe('repositorio de posts gerenciados', () => {
  const db = createMock<PrismaService>();
  const scope = { organizationId: 'org', profileId: 'perfil' };
  const repo = new PostManagementRepository(db);
  it('tempo de espera da trava conta no prazo antes de qualquer mutacao ou RPC', async () => {
    let now = 0;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const transaction = jest.fn(async (operation) =>
      operation({
        $queryRaw: jest.fn(async () => {
          now += 30000;
          return [];
        }),
      })
    );
    Object.assign(db, { $transaction: transaction });
    await expect(
      repo.lock(scope, 'p', async (assertLease) => assertLease())
    ).rejects.toThrow('POST_OPERATION_LEASE_EXPIRED');
    clock.mockRestore();
  });
  it('lista apenas raizes do perfil com canal e paginacao limitados', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    Object.assign(db, { post: { findMany } });
    await repo.list(scope, { state: 'QUEUE', limit: 3 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          parentPostId: null,
          deletedAt: null,
          state: 'QUEUE',
          integration: { profileId: 'perfil' },
        }),
        take: 4,
      })
    );
  });
  it('nao traz tags excluidas nos posts listados', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    Object.assign(db, { post: { findMany } });
    await repo.list(scope, { limit: 3 });
    expect(findMany.mock.calls[0][0].include.tags.where).toEqual({
      tag: { deletedAt: null },
    });
  });
  it('versao ignora o batchId (coluna nova nao invalida a versao dos agentes)', () => {
    const row = (batchId: string | null) =>
      ({
        id: 'p',
        content: 'a',
        integration: { id: 'i' },
        tags: [],
        batchId,
      } as any);
    expect(managedPostVersion([row(null)])).toBe(
      managedPostVersion([row('b-1')])
    );
  });
  it('listagem geral preserva organizacao e canal sem herdar Default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    Object.assign(db, { post: { findMany } });
    await repo.listOrganization('org', { integrationId: 'amz', limit: 2 });
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: {
        organizationId: 'org',
        integrationId: 'amz',
        deletedAt: null,
        parentPostId: null,
      },
      take: 3,
    });
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('profileId');
    expect(findMany.mock.calls[0][0].include.profile.select).toEqual({
      id: true,
      name: true,
    });
  });
  it('consulta de cursor geral exige raiz existente na mesma organizacao', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    Object.assign(db, { post: { findFirst } });
    await expect(
      repo.assertOrganizationCursor('org', 'foreign', { state: 'QUEUE' })
    ).rejects.toThrow('POST_CURSOR_NOT_FOUND');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          id: 'foreign',
          state: 'QUEUE',
          parentPostId: null,
          deletedAt: null,
        }),
      })
    );
  });
  it('midia registrada de outro cliente ou org e recusada antes de gravar', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'm',
        path: 'https://cdn/x.jpg',
        profileId: 'other',
        organizationId: 'org',
        deletedAt: null,
      },
    ]);
    Object.assign(db, { media: { findMany } });
    await expect(
      repo.assertMediaScope(scope, [{ id: 'm', path: 'https://cdn/x.jpg' }])
    ).rejects.toThrow('POST_MEDIA_PROFILE_MISMATCH');
    findMany.mockResolvedValue([
      {
        id: 'm',
        path: 'https://cdn/x.jpg',
        profileId: null,
        organizationId: 'org',
        deletedAt: null,
      },
    ]);
    await expect(
      repo.assertMediaScope(scope, [{ id: 'm', path: 'https://cdn/x.jpg' }])
    ).resolves.toBeUndefined();
    await expect(
      repo.assertMediaScope(scope, [
        { id: 'm', path: 'https://cdn/different.jpg' },
      ])
    ).rejects.toThrow('POST_MEDIA_REFERENCE_MISMATCH');
  });
});
