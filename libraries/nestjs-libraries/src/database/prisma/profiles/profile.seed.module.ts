import {
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class ProfileSeedService implements OnModuleInit {
  private readonly logger = new Logger(ProfileSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedProfiles();
    } catch (error) {
      this.logger.error('Profile seed migration failed', error);
    }
  }

  private async seedProfiles(): Promise<void> {
    // Check if Profile table exists (prisma db push may not have run yet)
    try {
      await this.prisma.$executeRawUnsafe(
        `SELECT 1 FROM "Profile" LIMIT 1`
      );
    } catch {
      this.logger.warn(
        'Profile table does not exist yet — skipping seed (will run on next restart after prisma db push)'
      );
      return;
    }

    // 1. Create a default Profile for each Organization that does not yet have one
    const defaultsCreated = await this.prisma.$executeRawUnsafe(`
      INSERT INTO "Profile" ("id", "name", "slug", "organizationId", "isDefault", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid(),
        'Default',
        'default',
        o."id",
        true,
        NOW(),
        NOW()
      FROM "Organization" o
      WHERE NOT EXISTS (
        SELECT 1 FROM "Profile" p
        WHERE p."organizationId" = o."id" AND p."isDefault" = true AND p."deletedAt" IS NULL
      )
    `);

    if (defaultsCreated > 0) {
      this.logger.log(
        `Created ${defaultsCreated} default profile(s) for organizations`
      );
    }

    // 2. Create a Profile for each Customer (maps to client profiles)
    const customerProfilesCreated = await this.prisma.$executeRawUnsafe(`
      INSERT INTO "Profile" ("id", "name", "slug", "organizationId", "isDefault", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid(),
        c."name",
        LOWER(REGEXP_REPLACE(REGEXP_REPLACE(c."name", '[^a-zA-Z0-9]+', '-', 'g'), '^-|-$', '', 'g')),
        c."orgId",
        false,
        NOW(),
        NOW()
      FROM "Customer" c
      WHERE c."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Profile" p
        WHERE p."organizationId" = c."orgId" AND p."name" = c."name" AND p."deletedAt" IS NULL
      )
    `);

    if (customerProfilesCreated > 0) {
      this.logger.log(
        `Created ${customerProfilesCreated} customer profile(s)`
      );
    }

    // 3. Add SUPERADMIN and ADMIN users as OWNER members in all profiles of their org
    const ownersAdded = await this.prisma.$executeRawUnsafe(`
      INSERT INTO "ProfileMember" ("id", "profileId", "userId", "role", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid(),
        p."id",
        uo."userId",
        'OWNER'::"ProfileRole",
        NOW(),
        NOW()
      FROM "UserOrganization" uo
      JOIN "Profile" p ON p."organizationId" = uo."organizationId" AND p."deletedAt" IS NULL
      WHERE uo."role" IN ('SUPERADMIN', 'ADMIN')
      AND NOT EXISTS (
        SELECT 1 FROM "ProfileMember" pm
        WHERE pm."profileId" = p."id" AND pm."userId" = uo."userId"
      )
    `);

    if (ownersAdded > 0) {
      this.logger.log(
        `Added ${ownersAdded} OWNER profile member(s)`
      );
    }

    // 4. Add USER role users as EDITOR members in all profiles of their org
    const editorsAdded = await this.prisma.$executeRawUnsafe(`
      INSERT INTO "ProfileMember" ("id", "profileId", "userId", "role", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid(),
        p."id",
        uo."userId",
        'EDITOR'::"ProfileRole",
        NOW(),
        NOW()
      FROM "UserOrganization" uo
      JOIN "Profile" p ON p."organizationId" = uo."organizationId" AND p."deletedAt" IS NULL
      WHERE uo."role" = 'USER'
      AND NOT EXISTS (
        SELECT 1 FROM "ProfileMember" pm
        WHERE pm."profileId" = p."id" AND pm."userId" = uo."userId"
      )
    `);

    if (editorsAdded > 0) {
      this.logger.log(
        `Added ${editorsAdded} EDITOR profile member(s)`
      );
    }

    // 5. Link Integrations with customerId to corresponding Profile (by Customer name)
    const integrationsLinkedByCustomer = await this.prisma.$executeRawUnsafe(`
      UPDATE "Integration" i
      SET "profileId" = p."id"
      FROM "Customer" c
      JOIN "Profile" p ON p."organizationId" = c."orgId" AND p."name" = c."name" AND p."deletedAt" IS NULL
      WHERE i."customerId" = c."id"
      AND i."profileId" IS NULL
      AND i."deletedAt" IS NULL
    `);

    // 6. Link Integrations without customerId to the default Profile
    const integrationsLinkedToDefault = await this.prisma.$executeRawUnsafe(`
      UPDATE "Integration" i
      SET "profileId" = p."id"
      FROM "Profile" p
      WHERE p."organizationId" = i."organizationId"
      AND p."isDefault" = true
      AND p."deletedAt" IS NULL
      AND i."customerId" IS NULL
      AND i."profileId" IS NULL
      AND i."deletedAt" IS NULL
    `);

    const totalIntegrations =
      integrationsLinkedByCustomer + integrationsLinkedToDefault;
    if (totalIntegrations > 0) {
      this.logger.log(
        `Linked ${totalIntegrations} integration(s) to profiles`
      );
    }

    // 7. Link Posts to Profile via their Integration's profileId
    const postsLinked = await this.prisma.$executeRawUnsafe(`
      UPDATE "Post" po
      SET "profileId" = i."profileId"
      FROM "Integration" i
      WHERE po."integrationId" = i."id"
      AND i."profileId" IS NOT NULL
      AND po."profileId" IS NULL
      AND po."deletedAt" IS NULL
    `);

    if (postsLinked > 0) {
      this.logger.log(`Linked ${postsLinked} post(s) to profiles`);
    }

    // 8. Link Media to the default Profile of its organization
    const mediaLinked = await this.prisma.$executeRawUnsafe(`
      UPDATE "Media" m
      SET "profileId" = p."id"
      FROM "Profile" p
      WHERE p."organizationId" = m."organizationId"
      AND p."isDefault" = true
      AND p."deletedAt" IS NULL
      AND m."profileId" IS NULL
    `);

    if (mediaLinked > 0) {
      this.logger.log(`Linked ${mediaLinked} media item(s) to profiles`);
    }

    // 9. Link Tags to the default Profile of its organization
    const tagsLinked = await this.prisma.$executeRawUnsafe(`
      UPDATE "Tags" t
      SET "profileId" = p."id"
      FROM "Profile" p
      WHERE p."organizationId" = t."orgId"
      AND p."isDefault" = true
      AND p."deletedAt" IS NULL
      AND t."profileId" IS NULL
    `);

    if (tagsLinked > 0) {
      this.logger.log(`Linked ${tagsLinked} tag(s) to profiles`);
    }

    // 10. Link Signatures to the default Profile of its organization
    const signaturesLinked = await this.prisma.$executeRawUnsafe(`
      UPDATE "Signatures" s
      SET "profileId" = p."id"
      FROM "Profile" p
      WHERE p."organizationId" = s."organizationId"
      AND p."isDefault" = true
      AND p."deletedAt" IS NULL
      AND s."profileId" IS NULL
    `);

    if (signaturesLinked > 0) {
      this.logger.log(
        `Linked ${signaturesLinked} signature(s) to profiles`
      );
    }

    this.logger.log('Profile seed migration completed');
  }
}

@Global()
@Module({
  providers: [ProfileSeedService],
  get exports() {
    return this.providers;
  },
})
export class ProfileSeedModule {}
