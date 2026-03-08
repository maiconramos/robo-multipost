-- Profile Multi-Tenancy Data Migration
-- Run AFTER prisma db push creates the new tables/columns
-- This script is idempotent (safe to re-run)

-- 1. Create a default Profile for each Organization that does not yet have one
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
);

-- 2. Create a Profile for each Customer (maps to client profiles)
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
);

-- 3. Add SUPERADMIN and ADMIN users as OWNER members in all profiles of their org
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
);

-- 4. Add USER role users as EDITOR members in all profiles of their org
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
);

-- 5. Link Integrations with customerId to corresponding Profile (by Customer name)
UPDATE "Integration" i
SET "profileId" = p."id"
FROM "Customer" c
JOIN "Profile" p ON p."organizationId" = c."orgId" AND p."name" = c."name" AND p."deletedAt" IS NULL
WHERE i."customerId" = c."id"
AND i."profileId" IS NULL
AND i."deletedAt" IS NULL;

-- 6. Link Integrations without customerId to the default Profile
UPDATE "Integration" i
SET "profileId" = p."id"
FROM "Profile" p
WHERE p."organizationId" = i."organizationId"
AND p."isDefault" = true
AND p."deletedAt" IS NULL
AND i."customerId" IS NULL
AND i."profileId" IS NULL
AND i."deletedAt" IS NULL;

-- 7. Link Posts to Profile via their Integration's profileId
UPDATE "Post" po
SET "profileId" = i."profileId"
FROM "Integration" i
WHERE po."integrationId" = i."id"
AND i."profileId" IS NOT NULL
AND po."profileId" IS NULL
AND po."deletedAt" IS NULL;

-- 8. Link Media to the default Profile of its organization
UPDATE "Media" m
SET "profileId" = p."id"
FROM "Profile" p
WHERE p."organizationId" = m."organizationId"
AND p."isDefault" = true
AND p."deletedAt" IS NULL
AND m."profileId" IS NULL;

-- 9. Link Tags to the default Profile of its organization
UPDATE "Tags" t
SET "profileId" = p."id"
FROM "Profile" p
WHERE p."organizationId" = t."orgId"
AND p."isDefault" = true
AND p."deletedAt" IS NULL
AND t."profileId" IS NULL;

-- 10. Link Signatures to the default Profile of its organization
UPDATE "Signatures" s
SET "profileId" = p."id"
FROM "Profile" p
WHERE p."organizationId" = s."organizationId"
AND p."isDefault" = true
AND p."deletedAt" IS NULL
AND s."profileId" IS NULL;
