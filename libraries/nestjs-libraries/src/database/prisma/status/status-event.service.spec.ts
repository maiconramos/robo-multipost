// ProfileRepository (via DI) puxa prisma.service/crypto; os mocks pesados
// seguem o padrao dos demais specs do repo.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn().mockReturnValue({}) },
}));

import { StatusEventService } from './status-event.service';

const build = (repo: any, profiles: any) =>
  new StatusEventService(repo as any, profiles as any);

describe('StatusEventService', () => {
  describe('record (fail-soft)', () => {
    it('grava o evento com a mensagem capada em 500 chars', async () => {
      const repo = { create: jest.fn().mockResolvedValue({ id: 'e1' }) };
      const service = build(repo, {});

      await service.record({
        organizationId: 'org-1',
        type: 'POST_FAILED',
        severity: 'CRITICAL',
        message: 'x'.repeat(900),
        entityId: 'post-1',
      });

      const arg = repo.create.mock.calls[0][0];
      expect(arg.message).toHaveLength(500);
      expect(arg.type).toBe('POST_FAILED');
    });

    it('NAO propaga erro quando o insert falha (nunca derruba a operacao real)', async () => {
      const repo = {
        create: jest.fn().mockRejectedValue(new Error('db down')),
      };
      const service = build(repo, {});

      await expect(
        service.record({
          organizationId: 'org-1',
          type: 'CHANNEL_DISCONNECT',
          severity: 'CRITICAL',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    const profiles = {
      getProfileNamesByIds: jest
        .fn()
        .mockResolvedValue([{ id: 'p1', name: 'Cliente A' }]),
    };

    it('mapeia o row para o DTO, resolve o nome do perfil (por ids) e converte a severidade', async () => {
      const repo = {
        list: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            type: 'POST_FAILED',
            severity: 'CRITICAL',
            message: 'HttpError: 400',
            createdAt: new Date('2026-07-08T10:00:00.000Z'),
            profileId: 'p1',
            channelName: 'IG do Cliente',
            channelPicture: null,
            providerIdentifier: 'instagram',
            entityId: 'post-9',
          },
        ]),
      };
      const service = build(repo, profiles);

      const res = await service.list('org-1', {});

      expect(res.items).toHaveLength(1);
      const item = res.items[0];
      expect(item.severity).toBe('critical'); // CRITICAL -> critical
      expect(item.createdAt).toBe('2026-07-08T10:00:00.000Z');
      expect(item.channel).toEqual({
        name: 'IG do Cliente',
        picture: null,
        identifier: 'instagram',
      });
      expect(item.profile).toEqual({ id: 'p1', name: 'Cliente A' });
      expect(item.entityId).toBe('post-9');
      expect(res.hasMore).toBe(false);
      expect(res.nextCursor).toBeNull();
      // resolve por ids (nao varre a org toda) e sem filtrar deletedAt — um
      // perfil soft-deletado ainda mostra a origem.
      expect(profiles.getProfileNamesByIds).toHaveBeenCalledWith('org-1', [
        'p1',
      ]);
    });

    it('sinaliza hasMore e nextCursor quando volta mais que o limit', async () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `e${i}`,
        type: 'AUTOMATION_FAILED',
        severity: 'WARNING',
        message: null,
        createdAt: new Date('2026-07-08T10:00:00.000Z'),
        profileId: null,
        channelName: null,
        channelPicture: null,
        providerIdentifier: null,
        entityId: null,
      }));
      const repo = { list: jest.fn().mockResolvedValue(rows) };
      const service = build(repo, profiles);

      const res = await service.list('org-1', { limit: 2 });

      expect(res.items).toHaveLength(2); // corta o excedente
      expect(res.hasMore).toBe(true);
      expect(res.nextCursor).toBe('e1'); // id do ultimo item da pagina
      // canal ausente => null; perfil ausente => null (frontend rotula Workspace)
      expect(res.items[0].channel).toBeNull();
      expect(res.items[0].profile).toBeNull();
    });

    it('mapeia a severidade do filtro (critical -> CRITICAL) e repassa cursor/limit ao repo', async () => {
      const repo = { list: jest.fn().mockResolvedValue([]) };
      const service = build(repo, profiles);

      await service.list('org-1', {
        type: 'POST_FAILED',
        severity: 'critical',
        profileId: 'p1',
        cursor: 'e42',
        limit: 25,
      });

      const arg = repo.list.mock.calls[0][0];
      expect(arg.organizationId).toBe('org-1');
      expect(arg.type).toBe('POST_FAILED');
      expect(arg.severity).toBe('CRITICAL');
      expect(arg.profileId).toBe('p1');
      expect(arg.cursorId).toBe('e42');
      expect(arg.limit).toBe(25);
    });

    it('nao consulta perfis quando a pagina nao tem profileId', async () => {
      const repo = {
        list: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            type: 'CHANNEL_DISCONNECT',
            severity: 'CRITICAL',
            message: null,
            createdAt: new Date('2026-07-08T10:00:00.000Z'),
            profileId: null,
            channelName: 'X',
            channelPicture: null,
            providerIdentifier: 'linkedin',
            entityId: null,
          },
        ]),
      };
      const localProfiles = { getProfileNamesByIds: jest.fn() };
      const service = build(repo, localProfiles);

      await service.list('org-1', {});

      expect(localProfiles.getProfileNamesByIds).not.toHaveBeenCalled();
    });
  });
});
