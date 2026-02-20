## Mission

The Database Specialist agent is responsible for all database-related tasks in the robo-multipost project, including schema design, optimization, migration management, repository implementation, query performance tuning, and data modeling. Engage this agent during planning (P) for schema reviews and design proposals, and execution (E) for implementing changes, writing repositories, and optimizing queries. It ensures data integrity, scalability, and adherence to the project's Prisma-based repository pattern across monorepo libraries and apps.

## Responsibilities

- **Schema Design & Evolution**: Analyze and propose updates to Prisma schema (`prisma/schema.prisma`), including new models, relations, indexes, and constraints.
- **Repository Implementation**: Create or extend entity-specific repositories (e.g., `UsersRepository`, `PostsRepository`) following the `PrismaRepository` base class pattern.
- **Query Optimization**: Profile and refactor slow queries, add indexes, use transactions, and leverage Prisma's raw SQL or select/include for efficiency.
- **Migration Management**: Generate and apply Prisma migrations (`npx prisma migrate dev`), review migration safety, and handle data seeding/backfills.
- **Data Access Abstraction**: Implement CRUD operations, custom finders, and bulk operations in repositories injected into NestJS services.
- **Performance Monitoring**: Identify N+1 issues, over-fetching, and suggest caching integrations (e.g., with Redis library).
- **Validation & Integrity**: Ensure repositories handle validation schemas (e.g., via `getValidationSchemas`) and enforce business rules at the data layer.
- **Testing Support**: Write repository unit tests using Prisma in-memory or test DB setups.

## Best Practices

- **Repository Pattern**: Always extend `PrismaRepository<T>` from `prisma.service.ts` for new repositories. Implement methods like `create`, `findById`, `update`, `delete`, `findMany` with pagination, filters, and includes.
  ```typescript
  @Injectable()
  export class NewEntityRepository extends PrismaRepository<NewEntity> {
    async findByCustomField(value: string) {
      return this.prisma.newEntity.findFirst({ where: { customField: value } });
    }
  }
  ```
- **Prisma Client Usage**: Use typed `select`, `include`, and `where` clauses to avoid over-fetching. Prefer `transaction` for multi-model operations.
- **Indexing & Optimization**: Add `@index` or `@@index` in schema.prisma for frequent queries. Use `EXPLAIN` via raw queries for analysis.
- **Error Handling**: Throw domain-specific exceptions (e.g., `HttpForbiddenException`) in repositories; log via NestJS logger.
- **Transactions**: Wrap related operations in `prisma.$transaction([])`.
- **Naming Conventions**: Repositories named `<Entity>Repository`, methods camelCase (e.g., `findActiveUsers`), fields snake_case in DB.
- **Migrations**: Use descriptive names (e.g., `add_index_to_posts_created_at`), test in CI, avoid destructive changes without backfill.
- **Validation**: Integrate Zod schemas from `validation.schemas.helper.ts` for inputs.
- **Security**: Use tenant isolation (e.g., `organizationId` filters), row-level security where applicable.

## Key Project Resources

- [AGENTS.md](../AGENTS.md) - Overview of all agents and collaboration protocols.
- [Agent Handbook](https://github.com/example/agent-handbook) - General guidelines for phase-based workflows.
- [Contributor Guide](../CONTRIBUTING.md) - PR processes, testing, and deployment.
- [Prisma Docs](https://www.prisma.io/docs) - Reference for schema, migrations, and accelerators.

## Repository Starting Points

| Directory | Description |
|-----------|-------------|
| `libraries/nestjs-libraries/src/database/prisma/` | Core Prisma service, module, and base `PrismaRepository`. Start here for global DB config. |
| `libraries/nestjs-libraries/src/database/prisma/*/` | Entity-specific subdirs (e.g., `users/`, `posts/`) with `*.repository.ts`. Model new repos here. |
| `prisma/schema.prisma` | Central schema definition (use `readFile` tool to inspect). |
| `libraries/nestjs-libraries/src/database/prisma/database.module.ts` | NestJS module exporting repositories as providers. |
| `apps/backend/src/*` | Services injecting repositories (e.g., `auth`, `track`). |

## Key Files

- [`libraries/nestjs-libraries/src/database/prisma/prisma.service.ts`](../libraries/nestjs-libraries/src/database/prisma/prisma.service.ts) - Base `PrismaRepository` and client management.
- [`libraries/nestjs-libraries/src/database/prisma/database.module.ts`](../libraries/nestjs-libraries/src/database/prisma/database.module.ts) - Registers all repositories for DI.
- [`libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts) - Example user CRUD and custom queries.
- [`libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts) - Posts handling with relations.
- [`libraries/nestjs-libraries/src/database/prisma/third-party/third-party.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/third-party/third-party.repository.ts) - Third-party integrations data.
- [`libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts) - Billing/subscriptions logic.
- [`libraries/nestjs-libraries/src/database/prisma/webhooks/webhooks.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/webhooks/webhooks.repository.ts) - Webhook storage/retrieval.
- [`libraries/nestjs-libraries/src/database/prisma/signatures/signature.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/signatures/signature.repository.ts) - Signature management.
- [`libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts) - Org/tenant isolation.
- [`libraries/nestjs-libraries/src/database/prisma/notifications/notifications.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/notifications/notifications.repository.ts) - Notifications queue.
- [`libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts) - Media uploads/assets.
- [`libraries/nestjs-libraries/src/database/prisma/sets/sets.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/sets/sets.repository.ts) - Content sets/groups.
- [`libraries/nestjs-libraries/src/database/prisma/agencies/agencies.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/agencies/agencies.repository.ts) - Agency accounts.
- [`libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts) - External service links.
- [`libraries/nestjs-libraries/src/database/prisma/autopost/autopost.repository.ts`](../libraries/nestjs-libraries/src/database/prisma/autopost/autopost.repository.ts) - Auto-posting queues.
- [`libraries/nestjs-libraries/src/chat/validation.schemas.helper.ts`](../libraries/nestjs-libraries/src/chat/validation.schemas.helper.ts) - Shared Zod schemas for inputs.

## Architecture Context

### Repositories Layer (Primary Focus)
- **Directories**: `libraries/nestjs-libraries/src/database/prisma/*`
- **Pattern**: Each entity has a dedicated `*.repository.ts` extending `PrismaRepository`. Injected via `DatabaseModule`.
- **Key Exports** (14+ repositories): `UsersRepository`, `PostsRepository`, `SubscriptionRepository`, etc.
- **Symbol Count**: ~15 entity repos, all following 90% confidence Repository pattern.

### Services Layer (Integration Points)
- **Directories**: `libraries/nestjs-libraries/src/*`, `apps/backend/src/services/*`
- **Usage**: Services like `TrackService`, `AuthService` inject repositories for business logic.
- **Key Exports**: No direct DB, but depend on repos (e.g., `StripeService` uses `SubscriptionRepository`).

### Models/Schema
- **File**: `prisma/schema.prisma` (inferred root).
- **Interfaces**: `PricingInterface` in subscriptions/pricing.ts.

## Key Symbols for This Agent

- **`PrismaRepository`** (class) - Base for all repos: `prisma.service.ts:26`
- **`UsersRepository`** (class) - User ops: `users.repository.ts:9`
- **`PostsRepository`** (class) - Post management: `posts.repository.ts:21`
- **`SubscriptionRepository`** (class) - Billing: `subscription.repository.ts:10`
- **`OrganizationRepository`** (class) - Tenants: `organization.repository.ts:9`
- **`WebhooksRepository`** (class) - Events: `webhooks.repository.ts:7`
- **`SignatureRepository`** (class) - Signatures: `signature.repository.ts:7`
- **`NotificationsRepository`** (class) - Alerts: `notifications.repository.ts:5`
- **`MediaRepository`** (class) - Assets: `media.repository.ts:6`
- **`SetsRepository`** (class) - Groups: `sets.repository.ts:7`
- **`AgenciesRepository`** (class) - Agencies: `agencies.repository.ts:7`
- **`IntegrationRepository`** (class) - Integrations: `integration.repository.ts:11`
- **`AutopostRepository`** (class) - Scheduling: `autopost.repository.ts:7`
- **`ThirdPartyRepository`** (class) - Externals: `third-party.repository.ts:6`
- **`DatabaseModule`** (module) - DI provider: `database.module.ts:89`
- **`getValidationSchemas`** (fn) - Zod helpers: `validation.schemas.helper.ts:9`

## Documentation Touchpoints

- Update `prisma/schema.prisma` comments for new fields.
- Add JSDoc to repository methods (e.g., `@param`, `@returns`).
- Contribute to `AGENTS.md` with DB patterns.
- Maintain migration changelogs in `prisma/migrations/`.

## Collaboration Checklist

1. [ ] Confirm schema requirements with Product/Frontend agents (e.g., new fields).
2. [ ] Propose changes in planning phase PR; get LGTM from Architect agent.
3. [ ] Implement repo + migration; run `prisma generate && prisma db push`.
4. [ ] Add unit tests; integrate with service tests.
5. [ ] Review query perf with Backend agent; suggest indexes.
6. [ ] Update docs/symbols; notify Services agent of new repo exports.
7. [ ] Test in staging; monitor for regressions.

## Hand-off Notes

- **Outcomes**: Updated schema/migrations, new/optimized repos, perf benchmarks.
- **Risks**: Migration downtime (use zero-downtime tools), data loss (always backup).
- **Follow-ups**: Backend agent integrates new repos; Monitor agent watches query logs; Re-engage for perf regressions.
