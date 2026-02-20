## Mission

The Backend Specialist agent designs, implements, and maintains the server-side architecture of the Postiz application, a multi-posting platform with integrations for social media, payments (Stripe), AI (OpenAI), newsletters, and more. Engage this agent for:

- Building new API endpoints, services, and database operations.
- Refactoring business logic, optimizing performance, or fixing backend bugs.
- Integrating third-party services (e.g., Stripe, OpenAI, email providers).
- Ensuring scalability, security, and adherence to NestJS/Prisma patterns.
- Handling data persistence, authentication, webhooks, and real-time features.

Prioritize changes in `apps/backend` and `libraries/nestjs-libraries` during Planning (P) and Execution (E) phases.

## Responsibilities

- **API Development**: Create controllers for routes in `apps/backend/src/api/routes/` and `apps/backend/src/public-api/routes/`.
- **Business Logic**: Implement services in `libraries/nestjs-libraries/src/*` (e.g., payments, AI, integrations).
- **Data Access**: Extend repositories in `libraries/nestjs-libraries/src/database/prisma/*` using `PrismaRepository` base.
- **Integrations**: Manage Stripe, OpenAI, Redis, email, and third-party auth in dedicated services.
- **Authentication & Security**: Use `AuthService`, middleware like `AuthMiddleware` and `PublicAuthMiddleware`.
- **Error Handling**: Apply `HttpExceptionFilter` and custom exceptions like `HttpForbiddenException`.
- **Testing**: Add unit/integration tests mirroring patterns in existing services/repos.
- **Migrations**: Update Prisma schema and generate migrations for new models.
- **Performance**: Optimize queries with Prisma transactions (`PrismaTransaction`) and Redis caching.

## Best Practices

Derived from codebase analysis:

1. **NestJS Structure**:
   - Controllers: `@Controller('routes')`, inject services/repos, use DTOs for validation (e.g., `ApiKeyDto`).
   - Services: `@Injectable()`, constructor-inject dependencies (e.g., `PrismaService`, other services).
   - Modules: Export providers in feature modules (e.g., `ApiModule`, `PublicApiModule`).

2. **Repository Pattern** (90% confidence):
   - Extend `PrismaRepository<T>` for CRUD (e.g., `PostsRepository`, `UsersRepository`).
   - Use `prisma` instance from `PrismaService` for raw queries.
   - Wrap multi-model ops in `PrismaTransaction`.

3. **Service Layer** (85% confidence):
   - Single responsibility: e.g., `StripeService` for payments, `OpenaiService` for AI.
   - Error handling: Throw NestJS exceptions; use global `HttpExceptionFilter`.
   - Logging/Tracking: Inject `TrackService` for events.

4. **Data & Security**:
   - Encrypt/decrypt with `AuthService` legacy methods.
   - Validate inputs with Zod schemas (e.g., `getValidationSchemas`).
   - Use Redis via `RedisService` for caching/short-links.

5. **Code Conventions**:
   - Naming: Kebab-case files (e.g., `short.link.service.ts`), PascalCase classes.
   - Exports: Always export classes/services for DI.
   - Async/Await: Consistent in all services/controllers.
   - Env Vars: Use `@nestjs/config` for secrets (Stripe keys, OpenAI API).

6. **Performance & Scalability**:
   - Paginate queries with `take/skip`.
   - Use indexes in Prisma schema for frequent lookups.
   - Queue heavy tasks (e.g., autopost via agents/newsletters).

7. **Testing**:
   - Mock `PrismaService` and external services (e.g., `MockRedis`).
   - E2E tests for controllers with Supertest.

## Key Project Resources

- [Agent Handbook](../AGENTS.md) - Core agent guidelines.
- [Contributor Guide](../CONTRIBUTING.md) - PR process, linting, CI/CD.
- [Documentation Index](../docs/) - API specs, deployment.
- [Prisma Schema](../libraries/nestjs-libraries/prisma/schema.prisma) - Database models.

## Repository Starting Points

| Directory | Description |
|-----------|-------------|
| `apps/backend/src/api` | Core API controllers, routes, modules (`ApiModule`). |
| `apps/backend/src/public-api` | Public-facing API (`PublicApiModule`). |
| `apps/backend/src/services/auth` | Authentication middleware/services. |
| `libraries/nestjs-libraries/src/database/prisma` | Repositories and `PrismaService` for all entities. |
| `libraries/nestjs-libraries/src/services` | Shared services (Stripe, Email, Exceptions). |
| `libraries/nestjs-libraries/src/integrations` | Third-party sync (e.g., `RefreshIntegrationService`). |
| `libraries/nestjs-libraries/src/agent` | AI agent graphs (`AgentGraphService`). |
| `libraries/nestjs-libraries/src/openai` | AI services (`OpenaiService`, `FalService`). |
| `libraries/helpers/src/auth` | Legacy auth utils. |

## Key Files

- [`apps/cli/src/api.ts`](../apps/cli/src/api.ts) - CLI API client (`PostizAPI`).
- [`apps/backend/src/api/api.module.ts`](../apps/backend/src/api/api.module.ts) - Main API module.
- [`apps/backend/src/public-api/public.api.module.ts`](../apps/backend/src/public-api/public.api.module.ts) - Public API module.
- [`libraries/nestjs-libraries/src/database/prisma/database.module.ts`](../libraries/nestjs-libraries/src/database/prisma/database.module.ts) - Prisma setup (`DatabaseModule`).
- [`libraries/nestjs-libraries/src/database/prisma/prisma.service.ts`](../libraries/nestjs-libraries/src/database/prisma/prisma.service.ts) - Base `PrismaService`, `PrismaRepository`.
- [`libraries/helpers/src/auth/auth.service.ts`](../libraries/helpers/src/auth/auth.service.ts) - Core `AuthService` (encrypt/decrypt).
- [`libraries/nestjs-libraries/src/services/stripe.service.ts`](../libraries/nestjs-libraries/src/services/stripe.service.ts) - `StripeService`.
- [`libraries/nestjs-libraries/src/services/email.service.ts`](../libraries/nestjs-libraries/src/services/email.service.ts) - `EmailService`.
- [`libraries/nestjs-libraries/src/services/exception.filter.ts`](../libraries/nestjs-libraries/src/services/exception.filter.ts) - Global filters (`HttpExceptionFilter`).
- [`libraries/nestjs-libraries/src/track/track.service.ts`](../libraries/nestjs-libraries/src/track/track.service.ts) - `TrackService`.
- [`libraries/nestjs-libraries/src/openai/openai.service.ts`](../libraries/nestjs-libraries/src/openai/openai.service.ts) - `OpenaiService`.
- [`apps/backend/src/api/routes/users.controller.ts`](../apps/backend/src/api/routes/users.controller.ts) - Example `UsersController`.
- [`apps/backend/src/api/routes/webhooks.controller.ts`](../apps/backend/src/api/routes/webhooks.controller.ts) - `WebhookController`.

## Architecture Context

### Controllers (Request Handling)
**Directories**: `apps/backend/src/api/routes/`, `apps/backend/src/public-api/routes/v1/`.
**Key Exports**: `UsersController`, `WebhookController`, `StripeController`, `ThirdPartyController`.
- Handle HTTP requests, validate DTOs, delegate to services.

### Services (Business Logic)
**Directories**: `libraries/nestjs-libraries/src/services/`, `src/track/`, `src/openai/`, `src/integrations/`.
**Key Exports**: `StripeService`, `OpenaiService`, `EmailService`, `TrackService`, `AgentGraphService`.
- Orchestrate repos, external APIs, transactions.

### Repositories (Data Access)
**Directories**: `libraries/nestjs-libraries/src/database/prisma/*/` (e.g., `posts/`, `users/`).
**Key Exports**: `PostsRepository`, `UsersRepository`, `PrismaRepository`.
- Extend base class for type-safe Prisma ops.

### Models & DTOs
**Directories**: `libraries/nestjs-libraries/src/dtos/`, Prisma schema.
**Key Exports**: `ApiKeyDto`.

## Key Symbols for This Agent

- `PrismaService` (service) - prisma.service.ts:5 - Core DB client.
- `PrismaRepository` (base class) - prisma.service.ts:26 - CRUD abstraction.
- `AuthService` (service) - auth.service.ts:35 - Encryption/auth.
- `StripeService` (service) - stripe.service.ts:20 - Payments.
- `TrackService` (service) - track.service.ts:21 - Analytics.
- `OpenaiService` (service) - openai.service.ts:20 - AI completions.
- `EmailService` (service) - email.service.ts:10 - Mail sending.
- `AgentGraphService` (service) - agent.graph.service.ts:105 - AI workflows.
- `WebhookController` (controller) - webhooks.controller.ts:24 - Event handling.
- `UsersController` (controller) - users.controller.ts:36 - User endpoints.

## Documentation Touchpoints

- [Prisma Schema](../libraries/nestjs-libraries/prisma/schema.prisma) - Update for new models.
- [API Docs](../docs/api.md) - Swagger/OpenAPI specs.
- [Integration Guide](../docs/integrations.md) - Third-party setup.
- [Deployment](../docker-compose.yml) - Env vars, scaling.

## Collaboration Checklist

1. [ ] Confirm requirements with Frontend/Fullstack agents (e.g., API contract).
2. [ ] Analyze existing patterns via `analyzeSymbols` or `searchCode` for similar features.
3. [ ] Implement in isolation: controller → service → repo.
4. [ ] Add tests and run `npm test`.
5. [ ] Lint/format: `npm run lint`.
6. [ ] Update docs/PR description with changes.
7. [ ] Review PR with team; address feedback.
8. [ ] Capture learnings in AGENTS.md or issue.

## Hand-off Notes

After completion:
- **Outcomes**: New/updated endpoints/services live; tests pass; docs updated.
- **Risks**: DB migrations applied? External deps (Stripe keys) configured? Load tested?
- **Follow-ups**: 
  - Frontend integration testing.
  - Monitor logs for errors (e.g., via TrackService).
  - Performance benchmarks on new queries.
  - PR link: [TBD].
