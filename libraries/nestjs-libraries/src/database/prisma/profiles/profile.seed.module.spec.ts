import { ProfileSeedService } from './profile.seed.module';

describe('ProfileSeedService', () => {
  let service: ProfileSeedService;
  let executeRawUnsafe: jest.Mock;

  beforeEach(() => {
    executeRawUnsafe = jest.fn().mockResolvedValue(0);
    service = new ProfileSeedService({
      $executeRawUnsafe: executeRawUnsafe,
    } as any);
  });

  const allSql = () =>
    executeRawUnsafe.mock.calls.map((c) => c[0] as string);

  describe('onModuleInit', () => {
    it('nao insere mais memberships OWNER para admins (acesso implicito)', async () => {
      await service.onModuleInit();

      const ownerInserts = allSql().filter((sql) =>
        sql.includes(`'OWNER'::"ProfileRole"`)
      );
      expect(ownerInserts).toEqual([]);
    });

    it('so faz backfill EDITOR em orgs nao bootstrapadas e sem nenhuma membership', async () => {
      await service.onModuleInit();

      const editorInsert = allSql().find((sql) =>
        sql.includes(`'EDITOR'::"ProfileRole"`)
      );
      expect(editorInsert).toBeDefined();
      expect(editorInsert).toContain('"profilesBootstrappedAt" IS NULL');
      expect(editorInsert).toContain('NOT EXISTS');
      // guard por org: nenhuma linha de ProfileMember em toda a organizacao
      expect(editorInsert).toMatch(
        /NOT EXISTS \(\s*SELECT 1 FROM "ProfileMember" pm2/
      );
    });

    it('marca todas as orgs como bootstrapadas apos o backfill', async () => {
      await service.onModuleInit();

      const sqls = allSql();
      const markerIndex = sqls.findIndex(
        (sql) =>
          sql.includes('UPDATE "Organization"') &&
          sql.includes('"profilesBootstrappedAt" = NOW()') &&
          sql.includes('"profilesBootstrappedAt" IS NULL')
      );
      const editorIndex = sqls.findIndex((sql) =>
        sql.includes(`'EDITOR'::"ProfileRole"`)
      );
      expect(markerIndex).toBeGreaterThan(editorIndex);
    });

    it('continua criando o perfil default para orgs sem perfil', async () => {
      await service.onModuleInit();

      const defaultInsert = allSql().find(
        (sql) =>
          sql.includes('INSERT INTO "Profile"') && sql.includes(`'Default'`)
      );
      expect(defaultInsert).toBeDefined();
    });

    it('nao propaga erro quando a tabela Profile ainda nao existe', async () => {
      executeRawUnsafe.mockRejectedValueOnce(new Error('no table'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      // apenas o probe rodou
      expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });
});
