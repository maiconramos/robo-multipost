import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class StartupMigrationService implements OnModuleInit {
  private readonly logger = new Logger(StartupMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.migrateProfileScope();
    await this.migrateLateToZernio();
  }

  /**
   * Migrates existing data to be scoped by profile (Fase 3).
   * Idempotent — only updates records where profileId IS NULL.
   * Runs automatically on every startup; no-op if already migrated.
   */
  private async migrateProfileScope() {
    try {
      const needsMigration = await this.prisma.providerCredential.count({
        where: { profileId: null },
      });

      if (needsMigration === 0) {
        return;
      }

      this.logger.log(
        `Found ${needsMigration} credentials without profile. Running profile scope migration...`
      );

      await this.prisma.$transaction(async (tx) => {
        // 1. ProviderCredential → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "ProviderCredential" pc
          SET "profileId" = p.id
          FROM "Profile" p
          WHERE p."organizationId" = pc."organizationId"
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND pc."profileId" IS NULL
        `);

        // 2. Webhooks → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "Webhooks" w
          SET "profileId" = p.id
          FROM "Profile" p
          WHERE p."organizationId" = w."organizationId"
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND w."profileId" IS NULL
        `);

        // 3. AutoPost → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "AutoPost" ap
          SET "profileId" = p.id
          FROM "Profile" p
          WHERE p."organizationId" = ap."organizationId"
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND ap."profileId" IS NULL
        `);

        // 4. Sets → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "Sets" s
          SET "profileId" = p.id
          FROM "Profile" p
          WHERE p."organizationId" = s."organizationId"
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND s."profileId" IS NULL
        `);

        // 5. Late API key: org → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "Profile" p
          SET "lateApiKey" = o."lateApiKey"
          FROM "Organization" o
          WHERE p."organizationId" = o.id
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND o."lateApiKey" IS NOT NULL
          AND p."lateApiKey" IS NULL
        `);

        // 6. Shortlink preference: org → default profile
        await tx.$executeRawUnsafe(`
          UPDATE "Profile" p
          SET "shortlink" = o."shortlink"
          FROM "Organization" o
          WHERE p."organizationId" = o.id
          AND p."isDefault" = true AND p."deletedAt" IS NULL
          AND p."shortlink" = 'ASK'
        `);
      });

      this.logger.log('Profile scope migration completed successfully.');
    } catch (error) {
      this.logger.error('Profile scope migration failed:', error);
    }
  }

  /**
   * Copia chaves de API Late para as colunas Zernio e reescreve
   * providerIdentifier de integrations existentes (late-X -> zernio-X).
   * Idempotente: cada UPDATE filtra linhas ja migradas.
   */
  private async migrateLateToZernio() {
    try {
      const pendingIntegrations = await this.prisma.integration.count({
        where: { providerIdentifier: { startsWith: 'late-' } },
      });

      const pendingOrgKeys = await this.prisma.organization.count({
        where: {
          lateApiKey: { not: null },
          zernioApiKey: null,
        },
      });

      const pendingProfileKeys = await this.prisma.profile.count({
        where: {
          lateApiKey: { not: null },
          zernioApiKey: null,
        },
      });

      if (
        pendingIntegrations === 0 &&
        pendingOrgKeys === 0 &&
        pendingProfileKeys === 0
      ) {
        return;
      }

      this.logger.log(
        `Late->Zernio migration pending: ${pendingIntegrations} integrations, ${pendingOrgKeys} org keys, ${pendingProfileKeys} profile keys.`
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`
          UPDATE "Organization"
          SET "zernioApiKey" = "lateApiKey"
          WHERE "lateApiKey" IS NOT NULL AND "zernioApiKey" IS NULL
        `);

        await tx.$executeRawUnsafe(`
          UPDATE "Organization"
          SET "shareZernioWithProfiles" = "shareLateWithProfiles"
          WHERE "shareLateWithProfiles" = true AND "shareZernioWithProfiles" = false
        `);

        await tx.$executeRawUnsafe(`
          UPDATE "Profile"
          SET "zernioApiKey" = "lateApiKey"
          WHERE "lateApiKey" IS NOT NULL AND "zernioApiKey" IS NULL
        `);

        await tx.$executeRawUnsafe(`
          UPDATE "Integration"
          SET "providerIdentifier" = 'zernio-' || SUBSTRING("providerIdentifier" FROM 6)
          WHERE "providerIdentifier" LIKE 'late-%'
        `);
      });

      this.logger.log('Late->Zernio migration completed successfully.');
    } catch (error) {
      this.logger.error('Late->Zernio migration failed:', error);
    }
  }
}
