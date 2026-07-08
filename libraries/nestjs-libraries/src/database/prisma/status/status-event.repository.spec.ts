import { StatusEventRepository } from './status-event.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

describe('StatusEventRepository', () => {
  let repo: StatusEventRepository;
  let prismaMock: ReturnType<typeof createPrismaRepositoryMock<'statusEvent'>>;

  beforeEach(() => {
    prismaMock = createPrismaRepositoryMock('statusEvent');
    (prismaMock.model.statusEvent as any).create = jest
      .fn()
      .mockResolvedValue({ id: 'evt-1' } as any);
    (prismaMock.model.statusEvent as any).findMany = jest
      .fn()
      .mockResolvedValue([] as any);
    repo = new StatusEventRepository(prismaMock as any);
  });

  describe('create', () => {
    it('grava o snapshot com defaults null nos campos ausentes', async () => {
      await repo.create({
        organizationId: 'org-1',
        type: 'POST_FAILED',
        severity: 'CRITICAL',
        message: 'HttpError: 400',
        entityId: 'post-9',
      });

      const data = prismaMock.model.statusEvent.create.mock.calls[0][0].data;
      expect(data.organizationId).toBe('org-1');
      expect(data.type).toBe('POST_FAILED');
      expect(data.severity).toBe('CRITICAL');
      expect(data.message).toBe('HttpError: 400');
      expect(data.entityId).toBe('post-9');
      // ausentes viram null explicitos (nao undefined)
      expect(data.profileId).toBeNull();
      expect(data.integrationId).toBeNull();
      expect(data.channelName).toBeNull();
      expect(data.channelPicture).toBeNull();
      expect(data.providerIdentifier).toBeNull();
    });
  });

  describe('list', () => {
    const arg = () =>
      prismaMock.model.statusEvent.findMany.mock.calls[0][0] as any;

    it('escopa por org, ordena por createdAt+id desc e busca limit+1', async () => {
      await repo.list({ organizationId: 'org-1', limit: 50 });

      const a = arg();
      expect(a.where.organizationId).toBe('org-1');
      expect(a.where.type).toBeUndefined();
      expect(a.where.severity).toBeUndefined();
      expect(a.where.profileId).toBeUndefined();
      expect(a.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(a.take).toBe(51);
      expect(a.cursor).toBeUndefined();
      expect(a.skip).toBeUndefined();
    });

    it('aplica os filtros type/severity/profileId quando informados', async () => {
      await repo.list({
        organizationId: 'org-1',
        type: 'AUTOMATION_FAILED',
        severity: 'WARNING',
        profileId: 'prof-2',
        limit: 20,
      });

      const a = arg();
      expect(a.where.type).toBe('AUTOMATION_FAILED');
      expect(a.where.severity).toBe('WARNING');
      expect(a.where.profileId).toBe('prof-2');
      expect(a.take).toBe(21);
    });

    it('pagina por cursor (skip 1) quando cursorId informado', async () => {
      await repo.list({ organizationId: 'org-1', cursorId: 'evt-50', limit: 50 });

      const a = arg();
      expect(a.cursor).toEqual({ id: 'evt-50' });
      expect(a.skip).toBe(1);
    });
  });
});
