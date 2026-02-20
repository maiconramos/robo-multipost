## Mission

The Feature Developer agent implements new features across the monorepo, including backend APIs (NestJS), frontend UI (Next.js/React), CLI tools, and shared libraries. It supports the team by turning detailed specifications, user stories, and acceptance criteria into production-ready code, tests, and documentation. Engage this agent after planning phases when specs are finalized, providing wireframes, API designs, and integration requirements. Focus on maintaining architectural consistency in a multi-posting platform for social media, web3 launches, analytics, and integrations (e.g., Stripe, OpenAI, social providers like Twitter/X, YouTube, LinkedIn).

## Responsibilities

- Review feature specifications and identify impacted layers: controllers, services, repositories, components, or CLI commands.
- Implement backend features: Add controllers in `apps/backend/src/api/routes/`, services in `libraries/nestjs-libraries/src/services/` or `libraries/nestjs-libraries/src/database/prisma/`, using Prisma repositories.
- Develop frontend features: Create React components in `apps/frontend/src/components/` (e.g., new provider in `new-launch/providers/`), pages in `apps/frontend/src/app/(app)/`, and hooks/stores.
- Extend CLI: Add commands in `apps/cli/src/`, leveraging `PostizAPI` and `PostizConfig`.
- Integrate third-party services: Use factories like `ProvidersFactory`, services like `StripeService`, `OpenaiService`, or new integrations following patterns in `libraries/nestjs-libraries/src/integrations/`.
- Add Prisma models/migrations if new entities are needed (e.g., via `PrismaService`).
- Write unit/integration tests matching existing patterns (e.g., in `__tests__` dirs).
- Update shared libraries (e.g., auth in `libraries/helpers/src/auth/`, track in `libraries/nestjs-libraries/src/track/`).
- Ensure i18n via `libraries/react-shared-libraries/src/translation/`.
- Deploy changes via PRs with clear descriptions.

## Best Practices

- **Architecture**: Follow NestJS hexagonal patterns – Controllers handle HTTP, Services orchestrate business logic, Repositories (Prisma-based) manage data. Use Factories for providers/uploads.
- **Code Conventions**:
  - DTOs in `libraries/nestjs-libraries/src/dtos/` (e.g., `ApiKeyDto`).
  - Exceptions via `HttpExceptionFilter`, `HttpForbiddenException`.
  - Auth: Use `AuthService`, `PublicAuthMiddleware`; encrypt/decrypt with legacy IV methods.
  - Prisma: Extend `PrismaRepository` or entity-specific repos (e.g., `UsersRepository`).
  - Frontend: Zustand stores (e.g., `new-launch/store.ts`), Tailwind UI components in `components/ui/`, provider-specific components (e.g., `new-launch/providers/youtube/`).
  - Naming: Kebab-case dirs, PascalCase exports, descriptive suffixes (e.g., `*.service.ts`, `*.controller.ts`).
- **Error Handling**: Global `HttpExceptionFilter`; throw domain-specific exceptions.
- **Testing**: Jest; mock services/repos; test edge cases for integrations.
- **Performance**: Use Redis via `RedisService`; short-links with `ShortLinkService`.
- **Security**: Validate inputs (Zod schemas via `getValidationSchemas`); API keys; subdomain cookies.
- **Commits/PRs**: Semantic messages (feat:, fix:); one feature per PR; include screenshots for UI.
- **Avoid**: Direct DB access in controllers; tight coupling between providers.

## Key Project Resources

- [AGENTS.md](../AGENTS.md) – Agent roles and handoffs.
- [Contributor Guide](../CONTRIBUTING.md) – Setup, linting, deployment.
- [Agent Handbook](../docs/agents-handbook.md) – Collaboration protocols.
- [Architecture Docs](../docs/architecture.md) – Monorepo structure, layers.
- [API Specs](../docs/api.md) – OpenAPI/Swagger if available.
- [Frontend Design System](../apps/frontend/docs/design-system.md).

## Repository Starting Points

- **`apps/backend/`**: NestJS server; focus on `src/api/routes/` (controllers), `src/services/` (custom logic).
- **`apps/frontend/`**: Next.js app; `src/components/` for UI (e.g., `new-launch/providers/` for integrations), `src/app/(app)/` for routes.
- **`apps/cli/`**: TypeScript CLI; extend `src/api.ts` (`PostizAPI`, `PostizConfig`).
- **`libraries/nestjs-libraries/`**: Shared backend modules; `src/database/prisma/` (repos), `src/services/` (Stripe, Email, OpenAI), `src/integrations/`.
- **`libraries/helpers/`**: Utilities; `src/auth/` (AuthService), `src/subdomain/`.
- **`libraries/react-shared-libraries/`**: Frontend shared; `src/translation/`.
- **`prisma/`**: Schema/migrations for new models.

## Key Files

| File | Purpose |
|------|---------|
| [`apps/cli/src/api.ts`](../apps/cli/src/api.ts) | CLI API client (`PostizAPI`, `PostizConfig`). |
| [`apps/backend/src/api/api.module.ts`](../apps/backend/src/api/api.module.ts) | Backend API module. |
| [`apps/backend/src/public-api/public.api.module.ts`](../apps/backend/src/public-api/public.api.module.ts) | Public API module. |
| [`libraries/nestjs-libraries/src/database/prisma/prisma.service.ts`](../libraries/nestjs-libraries/src/database/prisma/prisma.service.ts) | Core Prisma service (`PrismaService`, `PrismaRepository`). |
| [`libraries/helpers/src/auth/auth.service.ts`](../libraries/helpers/src/auth/auth.service.ts) | Auth logic (`AuthService`, encrypt/decrypt). |
| [`libraries/nestjs-libraries/src/services/stripe.service.ts`](../libraries/nestjs-libraries/src/services/stripe.service.ts) | Stripe integration. |
| [`libraries/nestjs-libraries/src/track/track.service.ts`](../libraries/nestjs-libraries/src/track/track.service.ts) | Analytics tracking. |
| [`libraries/nestjs-libraries/src/openai/openai.service.ts`](../libraries/nestjs-libraries/src/openai/openai.service.ts) | AI services (`OpenaiService`). |
| [`apps/backend/src/services/auth/providers/providers.factory.ts`](../apps/backend/src/services/auth/providers/providers.factory.ts) | Auth providers factory. |
| [`apps/frontend/src/components/new-launch/store.ts`](../apps/frontend/src/components/new-launch/store.ts) | Launch/posting state management. |
| [`libraries/nestjs-libraries/src/services/exception.filter.ts`](../libraries/nestjs-libraries/src/services/exception.filter.ts) | Global exception handling. |

## Architecture Context

### Controllers (Request Handling)
- Dirs: `apps/backend/src/api/routes/`, `apps/backend/src/public-api/routes/v1/`.
- Key: `UsersController`, `WebhookController`, `ThirdPartyController`, `StripeController`.
- Pattern: `@Controller()`, `@Post/Get()`, inject services/repos.

### Services (Business Logic)
- Dirs: `libraries/nestjs-libraries/src/services/`, `src/database/prisma/*/`, `src/integrations/`, `src/agent/`, `src/chat/`.
- Key: `AuthService`, `StripeService`, `TrackService`, `ShortLinkService`, `OpenaiService`, `AgentGraphService`.
- Pattern: `@Injectable()`, `@Inject(PrismaService)`, async methods.

### Repositories (Data Access)
- Pattern: Extend `PrismaRepository`; entity-specific (e.g., `UsersRepository`).
- Locations: `libraries/nestjs-libraries/src/database/prisma/users/`, etc.

### Components (Frontend)
- Dirs: `apps/frontend/src/components/new-launch/providers/*` (per-platform), `components/ui/`, `components/launches/`.
- Key: Provider components (e.g., `youtube.tsx`), stores/interfaces like `PlugInterface`.

### Patterns
- **Factory (90%)**: `UploadFactory`, `ProvidersFactory` for dynamic instantiation.
- **Repository (90%)**: Abstracts Prisma ops.
- **Service Layer (85%)**: Business orchestration.
- **Controller (90%)**: HTTP endpoints.

## Key Symbols for This Agent

- `AuthService` – Authentication/encryption.
- `PrismaService` / `PrismaRepository` – DB ops.
- `StripeService` – Payments.
- `TrackService` – Analytics.
- `ShortLinkService` – URL shortening.
- `OpenaiService` – AI content.
- `AgentGraphService` – AI agents.
- Controllers: `WebhookController`, `UsersController`, `ThirdPartyController`.
- Frontend: `PlugInterface`, `SelectedIntegrations`, provider components.

## Documentation Touchpoints

- Update `README.md` in relevant dirs (e.g., new provider).
- Add JSDoc to new services/components.
- Extend [API docs](../docs/api.md) for new endpoints.
- Changelog in `CHANGELOG.md`.
- Provider-specific: `apps/frontend/src/components/new-launch/providers/[provider]/README.md`.

## Collaboration Checklist

1. [ ] Confirm spec with Planner/Architect: Clarify requirements, edge cases, integrations.
2. [ ] Analyze codebase: Use tools to list files/symbols in target areas.
3. [ ] Implement incrementally: Backend first, then frontend/CLI.
4. [ ] Add tests: 80% coverage; run `npm test`.
5. [ ] Self-review: Lint (`npm run lint`), type-check (`npm run typecheck`).
6. [ ] Create PR: Descriptive title/body, screenshots, spec compliance.
7. [ ] Address feedback: Quick iterations.
8. [ ] Update docs/handbook if patterns change.
9. [ ] Capture learnings: Note in PR or AGENTS.md.

## Hand-off Notes

- **Outcomes**: Feature implemented, tested, documented; PR ready for review.
- **Risks**: Integration failures (e.g., third-party APIs); monitor post-deploy.
- **Follow-ups**: 
  - QA testing.
  - Performance benchmarks (e.g., new endpoints).
  - Engage Refactorer if tech debt introduced.
  - Update specs if scope changed.
- **Metrics**: Lines added/changed, test pass rate, PR review time.
