-- Migration: Scope Credentials, Webhooks, AutoPost, Sets, Late, Shortlink by Profile
-- Run AFTER prisma-db-push (schema changes applied first)

-- 1. ProviderCredential: set profileId to org's default profile
UPDATE "ProviderCredential" pc
SET "profileId" = p.id
FROM "Profile" p
WHERE p."organizationId" = pc."organizationId"
AND p."isDefault" = true AND p."deletedAt" IS NULL
AND pc."profileId" IS NULL;

-- 2. Webhooks: set profileId to org's default profile
UPDATE "Webhooks" w
SET "profileId" = p.id
FROM "Profile" p
WHERE p."organizationId" = w."organizationId"
AND p."isDefault" = true AND p."deletedAt" IS NULL
AND w."profileId" IS NULL;

-- 3. AutoPost: set profileId to org's default profile
UPDATE "AutoPost" ap
SET "profileId" = p.id
FROM "Profile" p
WHERE p."organizationId" = ap."organizationId"
AND p."isDefault" = true AND p."deletedAt" IS NULL
AND ap."profileId" IS NULL;

-- 4. Sets: set profileId to org's default profile
UPDATE "Sets" s
SET "profileId" = p.id
FROM "Profile" p
WHERE p."organizationId" = s."organizationId"
AND p."isDefault" = true AND p."deletedAt" IS NULL
AND s."profileId" IS NULL;

-- 5. Late API key: copy from Organization to default profile
UPDATE "Profile" p
SET "lateApiKey" = o."lateApiKey"
FROM "Organization" o
WHERE p."organizationId" = o.id
AND p."isDefault" = true AND p."deletedAt" IS NULL
AND o."lateApiKey" IS NOT NULL
AND p."lateApiKey" IS NULL;

-- 6. Shortlink: copy from Organization to default profile
UPDATE "Profile" p
SET "shortlink" = o."shortlink"
FROM "Organization" o
WHERE p."organizationId" = o.id
AND p."isDefault" = true AND p."deletedAt" IS NULL
AND p."shortlink" = 'ASK';
