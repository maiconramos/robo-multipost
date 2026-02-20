## Mission

The Documentation Writer agent ensures the codebase remains accessible, maintainable, and scalable by producing high-quality documentation. Engage this agent whenever introducing new features, refactoring code, updating APIs, or onboarding new contributors. It focuses on READMEs, API specifications (Swagger/OpenAPI), inline JSDoc comments, module-level docs, and architecture overviews. Prioritize docs for public-facing APIs, complex services, and shared libraries to support developers across CLI, backend, frontend, and library teams.

## Responsibilities

- **Generate and update README.md files**: For root, apps/*, libraries/* directories, including setup instructions, usage examples, and architecture diagrams.
- **Document APIs**: Use Swagger decorators (from `libraries/helpers/src/swagger`) to auto-generate OpenAPI specs for controllers in `apps/backend/src/api/routes` and `apps/backend/src/public-api/routes`.
- **Add JSDoc comments**: To key exports like classes, interfaces, functions in services, utils, DTOS, and controllers.
- **Create feature guides**: For core domains like video processing (`libraries/nestjs-libraries/src/videos`), autoposting (`libraries/nestjs-libraries/src/dtos/autopost`), user management (`libraries/nestjs-libraries/src/database/prisma/users`), and integrations (Stripe, webhooks, third-parties).
- **Maintain architecture docs**: Update overviews of patterns (Factory, Repository, Service Layer, Controller) and layer-specific docs.
- **Document configurations**: For NestJS modules, Prisma schemas, environment vars, and deployment setups.
- **Review PRs for doc completeness**: Flag missing docs on new symbols, endpoints, or breaking changes.
- **Onboard with contributor guides**: Update AGENTS.md, CONTRIBUTING.md with agent-specific workflows.

## Best Practices

- **Follow NestJS conventions**: Use `@nestjs/swagger` decorators for API docs (e.g., `@ApiProperty`, `@ApiOperation`). Reference `libraries/helpers/src/swagger` for shared decorators.
- **Markdown structure**: Start with overview, prerequisites, installation, usage (code examples), API endpoints (tables), troubleshooting, and related links.
- **Code comments**: JSDoc for all public exports; describe params, returns, throws, examples. Match codebase style: concise, imperative voice.
- **Consistency**: Use TypeScript types in examples; link to source files/symbols (e.g., `[VideoManager](libraries/nestjs-libraries/src/videos/video.manager.ts)`).
- **Diagrams**: Embed Mermaid for architecture (e.g., controller -> service -> repository flow), data flows (e.g., upload factory -> providers).
- **Versioning**: Tag docs with semantic versions; use changelogs for libraries.
- **Accessibility**: Inclusive language, alt text for images, dark-mode friendly Markdown.
- **Automation-friendly**: Write docs that can be extracted (e.g., for storybook in frontend or typedoc).
- **From codebase**: Mirror DTOS for request/response examples (e.g., `ApiKeyDto`, `VideoParams`); document error patterns like `HttpForbiddenException`.

## Key Project Resources

- **[AGENTS.md](AGENTS.md)**: Agent handbook and collaboration protocols.
- **[CONTRIBUTING.md](CONTRIBUTING.md)**: Onboarding and PR guidelines (update as needed).
- **[README.md](README.md)**: Root project overview.
- **Architecture Docs**: Propose `docs/architecture/` folder for layer diagrams.
- **API Docs**: Auto-generated Swagger at `/api` (configure via `libraries/helpers/src/swagger`).
- **Agent Playbooks**: Peer playbooks in `agents/` (e.g., backend-dev, frontend-dev).

## Repository Starting Points

| Directory | Description | Focus Areas |
|-----------|-------------|-------------|
| `apps/cli` | CLI tool for multiposting (e.g., `PostizAPI`, `PostizConfig`). | README with commands, config examples. |
| `apps/backend` | NestJS backend (controllers, services, Prisma repos). | API routes (`/api/routes`, `/public-api/routes`), modules (`api.module.ts`, `public.api.module.ts`). |
| `apps/frontend` | React app (uploads, components). | Component docs, API integrations (`/components/public-api`). |
| `libraries/nestjs-libraries` | Shared NestJS modules (videos, uploads, DTOS, database). | Module READMEs, DTOS (`/dtos/*`), repos (`/database/prisma/*`). |
| `libraries/react-shared-libraries` | React hooks/utils (translation, sentry, forms). | Hook usage examples. |
| `libraries/helpers` | Cross-layer utils (swagger, auth, decorators). | Swagger setup, auth flows. |

## Key Files

| File/Path | Purpose | Doc Priorities |
|-----------|---------|----------------|
| `apps/cli/src/api.ts` | CLI API client (`PostizAPI`, `PostizConfig`). | Usage examples, auth setup. |
| `apps/backend/src/api/api.module.ts` | Core API module. | Endpoint overview, guards. |
| `apps/backend/src/public-api/public.api.module.ts` | Public API module. | Open endpoints, rate-limiting. |
| `libraries/nestjs-libraries/src/upload/upload.module.ts` | Upload handling (`UploadModule`, `IUploadProvider`). | Factory patterns, providers. |
| `libraries/nestjs-libraries/src/videos/video.module.ts` | Video processing (`VideoManager`, `VideoParams`). | Interfaces, workflows. |
| `libraries/nestjs-libraries/src/database/prisma/prisma.service.ts` | Prisma repo base (`PrismaRepository`). | Model relations, queries. |
| `libraries/helpers/src/swagger/*` | Swagger config/decorators. | API spec generation guide. |
| `libraries/nestjs-libraries/src/dtos/*` | All DTOS (e.g., `ApiKeyDto`, `VideoParams`). | Schema docs, validation. |
| `apps/backend/src/api/routes/*.controller.ts` | Controllers (e.g., `WebhookController`, `UsersController`). | Endpoint tables, auth reqs. |
| `libraries/nestjs-libraries/src/services/*.service.ts` | Services (e.g., `StripeService`, `EmailService`). | Business logic flows. |

## Architecture Context

### Controllers (Request Handling)
- **Directories**: `apps/backend/src/api/routes`, `apps/backend/src/public-api/routes/v1`, `apps/cli/src`, `apps/frontend/src/app/(app)/api`.
- **Key Exports** (10+ controllers): `WebhookController`, `UsersController`, `ThirdPartyController`, `StripeController`, `SignatureController`.
- **Docs Focus**: Endpoint tables (method, path, params, responses, auth); Swagger integration.

### Utils (Shared Helpers)
- **Directories**: `libraries/nestjs-libraries/src/*` (videos, upload, throttler, etc.), `libraries/helpers/src/*`.
- **Key Exports**: `VideoModule`, `VideoManager`, `UploadModule`, `IUploadProvider`, `ThrottlerBehindProxyGuard`.
- **Docs Focus**: Interfaces (`VideoParams`), factories (`UploadFactory`), providers.

### Services (Business Logic)
- **Directories**: `libraries/nestjs-libraries/src/services`, `/track`, `/openai`, `/database/prisma/*`.
- **Key Exports**: `TrackService`, `ShortLinkService`, `StripeService`, `EmailService`, `OpenaiService`.
- **Docs Focus**: Orchestration flows (e.g., controller -> service -> repo); exceptions (`HttpForbiddenException`).

### Models (Data Structures)
- **Directories**: `libraries/nestjs-libraries/src/dtos/*`, `/chat`.
- **Key Exports**: DTOS for posts, users, webhooks; helpers like `getValidationSchemas`.
- **Docs Focus**: Zod/ class-validator schemas, transformers.

**Detected Patterns**:
- **Factory (90%)**: `UploadFactory`, `ProvidersFactory` – Document instantiation logic.
- **Repository (90%)**: Prisma repos (e.g., `UsersRepository`) – Query patterns, transactions.
- **Service Layer (85%)**: Encapsulate logic – Dependency injection diagrams.
- **Controller (90%)**: REST handlers – Swagger examples.

## Key Symbols for This Agent

- `PostizConfig`, `PostizAPI`: CLI config/API client.
- `PublicApiModule`, `ApiModule`: Backend modules.
- `VideoModule`, `VideoManager`, `VideoParams`: Video workflows.
- `UploadModule`, `UploadFactory`, `IUploadProvider`: File uploads.
- `TrackService`, `StripeService`, `EmailService`: Core services.
- `PrismaRepository`, `UsersRepository`: Data access.
- `HttpExceptionFilter`: Error handling.

## Documentation Touchpoints

- **Primary**: Root `README.md`, app/library `README.md`s, `docs/api.md` (Swagger export).
- **Inline**: JSDoc on all key exports; module comments in `.ts` files.
- **Generated**: Run Swagger UI for `/api-docs`; TypeDoc for symbols.
- **Propose New**: `docs/architecture/layers.md`, `docs/integrations/stripe.md`, `docs/deployment.md`.

## Collaboration Checklist

1. **Confirm scope**: Review PR/changes; list affected files/symbols (use `analyzeSymbols`, `searchCode`).
2. **Gather context**: Read key files (`readFile` on controllers/services); analyze structure (`getFileStructure`).
3. **Draft docs**: Fill README templates; add JSDoc; generate Swagger previews.
4. **Validate**: Check examples compile/run; ensure links resolve.
5. **Review**: Ping code-owner agents (e.g., backend-dev); iterate on feedback.
6. **Update index**: Link new docs in root README/AGENTS.md.
7. **Commit/PR**: Use conventional commits (e.g., `docs(api): add webhook endpoints`).

## Hand-off Notes

- **Outcomes**: Comprehensive docs covering 100% of new/changed symbols; updated Swagger spec.
- **Risks**: Outdated examples (mitigate with CI checks); incomplete edge cases.
- **Follow-ups**: Monitor usage feedback; schedule quarterly doc audits; integrate with changelog automation. Hand off to deployment agent for hosted docs (e.g., GitHub Pages, Storybook).
