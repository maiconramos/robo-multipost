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
    (prismaMock.model.statusEvent as any).findFirst = jest
      .fn()
      .mockResolvedValue(null as any);
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

    it('resolve o cursor escopado a org e pagina por (createdAt,id) < ancora', async () => {
      const at = new Date('2026-07-08T10:00:00.000Z');
      (prismaMock.model.statusEvent as any).findFirst = jest
        .fn()
        .mockResolvedValue({ createdAt: at, id: 'evt-50' });

      await repo.list({ organizationId: 'org-1', cursorId: 'evt-50', limit: 50 });

      // lookup da ancora e ESCOPADO a org (fecha oracle / robusto a cursor podado)
      const ff = prismaMock.model.statusEvent.findFirst.mock.calls[0][0] as any;
      expect(ff.where).toEqual({ id: 'evt-50', organizationId: 'org-1' });

      const a = arg();
      expect(a.where.OR).toEqual([
        { createdAt: { lt: at } },
        { createdAt: at, id: { lt: 'evt-50' } },
      ]);
      // nao usa mais o cursor/skip do Prisma
      expect(a.cursor).toBeUndefined();
      expect(a.skip).toBeUndefined();
    });

    it('ignora cursor nao encontrado / de outra org (volta para a 1a pagina)', async () => {
      (prismaMock.model.statusEvent as any).findFirst = jest
        .fn()
        .mockResolvedValue(null);

      await repo.list({ organizationId: 'org-1', cursorId: 'foreign', limit: 50 });

      expect(arg().where.OR).toBeUndefined();
    });
  });
});
