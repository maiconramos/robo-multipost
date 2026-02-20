## Mission

The DevOps Specialist agent ensures reliable, scalable deployments across the monorepo by designing, implementing, and maintaining CI/CD pipelines. Engage this agent for building deployment infrastructure, optimizing build processes, managing configurations, containerization, orchestration, monitoring, and scaling services like the NestJS backend, frontend apps, CLI tools, and libraries supporting social media integrations (e.g., YouTube, X, Instagram providers). Focus on monorepo efficiency with tools like Turbo/Nx, GitHub Actions, Docker, and cloud deployments.

## Responsibilities

- **CI/CD Pipeline Management**: Create and maintain GitHub Actions workflows for linting, testing, building, and deploying apps (backend, frontend, CLI, SDK) and libraries.
- **Configuration Handling**: Manage environment configs via `getConfig` (apps/cli/src/config.ts) and `ConfigurationTask` (apps/commands/src/tasks/configuration.ts); validate with `ConfigurationChecker` (libraries/helpers/src/configuration/configuration.checker.ts).
- **Containerization & Orchestration**: Dockerize NestJS backend (apps/backend), React frontend (apps/frontend), and monorepo libs; set up Kubernetes/Compose for social integration services.
- **Monorepo Optimization**: Configure Turbo/Nx pipelines for caching, parallel builds across `apps/` and `libraries/`; handle dependency graphs for NestJS libs (e.g., videos, upload, integrations).
- **Deployment Automation**: Automate deployments for backend controllers/services (e.g., WebhookController, UsersController) and providers (e.g., YoutubeProvider, InstagramProvider).
- **Monitoring & Scaling**: Integrate Sentry (libraries/nestjs-libraries/src/sentry, libraries/react-shared-libraries/src/sentry), throttlers (ThrottlerBehindProxyGuard), and track services (TrackService).
- **Infrastructure as Code**: Provision cloud resources for uploads (UploadModule, IUploadProvider), videos (VideoModule, VideoManager), and social integrations.
- **Security & Compliance**: Enforce secrets management for API keys in social providers; scan for vulnerabilities in factories/repositories/services.

## Best Practices

- **Monorepo Workflows**: Use Turbo pipelines for affected-only builds; cache node_modules and dist/ across jobs. Reference patterns in root package.json scripts and apps/*/package.json.
- **NestJS Deployments**: Build backend with `nest build`; use factories (UploadFactory, ProvidersFactory) for dynamic providers; layer services/repositories (e.g., PrismaRepository, WebhooksRepository).
- **Configuration Validation**: Always run `ConfigurationTask` pre-deploy; use `ConfigurationChecker` for env vars in social providers (e.g., YoutubeProvider scopes).
- **Docker Multi-Stage Builds**: Minimize image sizes for backend (Node 20+), frontend (Vite), CLI (Bun/Deno); expose ports for controllers (e.g., 3000 for API routes).
- **GitHub Actions Patterns**: Use matrix strategies for multi-app testing; self-hosted runners for heavy video/upload tasks; secrets for 3rd-party integrations (HeyGen, Stripe).
- **Error Handling**: Adopt global exception filters (libraries/nestjs-libraries/src/services/exception.filter.ts); custom errors like BadBody, NotEnoughScopes from social.abstract.ts.
- **Testing in CI**: Run unit/integration tests for services (TrackService, StripeService), providers; e2e for autopost workflows.
- **Rollback & Observability**: Blue-green deployments; integrate Stripe webhooks, analytics tracking (TrackEnum).

## Key Project Resources

- [AGENTS.md](../AGENTS.md) - Agent collaboration guidelines.
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Repo contributor guide.
- [README.md](../README.md) - Project overview and setup.
- [Agent Handbook](https://github.com/your-org/agent-handbook) - Cross-agent best practices (adapt to repo).

## Repository Starting Points

- **Root (`/`)**: Monorepo config (package.json, turbo.json/Nx.json); global scripts, Dockerfiles, .github/workflows for CI/CD.
- **`apps/backend/`**: NestJS API server; controllers (WebhookController, UsersController), services; primary deployment target.
- **`apps/cli/` & `apps/commands/`**: Config management (`config.ts`, `configuration.ts`); deploy as tools/Docker images.
- **`apps/frontend/`**: React app; Vite builds, static hosting (Vercel/Netlify).
- **`apps/sdk/` & `apps/extension/`**: Client libs; npm publish pipelines.
- **`libraries/nestjs-libraries/`**: Shared backend modules (integrations/social/*.provider.ts, upload, videos); focus for scaling.
- **`libraries/helpers/`**: Config checkers, decorators; utils for pipelines.
- **`.github/workflows/`**: Existing CI/CD YAMLs; extend for new pipelines.
- **`docker/` or `Dockerfile`s**: Container defs for services.

## Key Files

- [`apps/cli/src/config.ts`](../apps/cli/src/config.ts) - Central `getConfig` for env management.
- [`apps/commands/src/tasks/configuration.ts`](../apps/commands/src/tasks/configuration.ts) - `ConfigurationTask` for validation/deploy prep.
- [`libraries/helpers/src/configuration/configuration.checker.ts`](../libraries/helpers/src/configuration/configuration.checker.ts) - `ConfigurationChecker` for runtime checks.
- [`libraries/nestjs-libraries/src/integrations/social.abstract.ts`](../libraries/nestjs-libraries/src/integrations/social.abstract.ts) - Base for 30+ providers; error handling (RefreshToken, NotEnoughScopes).
- [`libraries/nestjs-libraries/src/upload/upload.factory.ts`](../libraries/nestjs-libraries/src/upload/upload.factory.ts) - `UploadFactory`; dynamic providers.
- [`libraries/nestjs-libraries/src/database/prisma/prisma.service.ts`](../libraries/nestjs-libraries/src/database/prisma/prisma.service.ts) - `PrismaRepository`; DB migrations in CI.
- [`libraries/nestjs-libraries/src/throttler/throttler.provider.ts`](../libraries/nestjs-libraries/src/throttler/throttler.provider.ts) - `ThrottlerBehindProxyGuard`; deploy behind proxies.
- [`apps/backend/src/api/routes/*.controller.ts`](../apps/backend/src/api/routes/) - Entry points (e.g., StripeController); health checks.
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) - Extend build/test/deploy workflows (create if missing).
- [`turbo.json`](../turbo.json) - Monorepo task graph (or Nx equivalent).

## Architecture Context

- **Config Layer** (High): Root `.`, `apps/cli/src/config.ts` (getConfig), `apps/commands/src/tasks/configuration.ts` (ConfigurationTask); 2 key exports. Manage envs/secrets here.
- **Backend Layer (NestJS)** (Critical): `apps/backend/src/api/routes/*.controller.ts` (Controllers: 90% pattern), services (StripeService, EmailService: 85%), repositories (PrismaRepository, WebhooksRepository: 90%), factories (ProvidersFactory). ~50 symbols; deploy as single pod/service.
- **Libraries (Shared)**: `libraries/nestjs-libraries/src/integrations/social/` (30+ providers: YoutubeProvider, XProvider, etc.); utils (upload, videos, throttler). Modular; build/publish separately.
- **Frontend/CLI/SDK**: `apps/frontend/src`, `apps/cli/src`, `apps/sdk/src` (Postiz, PostizAPI, PostizConfig). Static/ npm deploys.
- **Deployment Targets**: Cloud (AWS/GCP for backend), CDN (frontend), npm (SDK/CLI).

## Key Symbols for This Agent

- `getConfig` - Centralized config loader (apps/cli/src/config.ts).
- `ConfigurationTask` / `ConfigurationChecker` - Deploy-time validation.
- `UploadFactory` / `ProvidersFactory` - Dynamic instantiation for scaling.
- `PrismaRepository` - DB ops; run migrations in pipelines.
- `ThrottlerBehindProxyGuard` - Rate limiting for prod deploys.
- Social Providers (e.g., `YoutubeProvider`, `InstagramProvider`) - 30+; env-dependent deploys.
- Controllers/Services (e.g., `WebhookController`, `TrackService`) - API endpoints, monitoring hooks.
- `VideoModule` / `UploadModule` - Heavy services; resource-intensive deploys.

## Documentation Touchpoints

- [`libraries/helpers/src/swagger/`](../libraries/helpers/src/swagger/) - API docs; auto-gen in CI.
- [Social Providers READMEs](../libraries/nestjs-libraries/src/integrations/social/) - Per-provider setup (scopes, tokens).
- [`apps/backend/README.md`](../apps/backend/) - Backend deploy instructions.
- [Root Docker docs](../docker/) - Container guides.
- [CI/CD templates in .github](../.github/workflows/) - Workflow examples.

## Collaboration Checklist

1. Confirm monorepo setup (Turbo/Nx, package.json deps) with codebase owners.
2. Review proposed pipelines in PR; test on branch.
3. Validate configs with `ConfigurationTask` on staging.
4. Update READMEs/docker-compose.yml with new deploys.
5. Capture metrics (build time, deploy success) in PR summary.
6. Tag related agents (e.g., backend-dev for service changes).
7. Hand off monitoring dashboards/alerts.

## Hand-off Notes

- **Outcomes**: Functional CI/CD covering build/test/deploy; optimized monorepo caching; validated configs for all providers.
- **Risks**: Secrets exposure in social providers; resource spikes in video/upload; DB migration failures.
- **Follow-ups**: Monitor prod metrics (Sentry, TrackEnum); scale throttlers; add canary deploys; review cloud costs. Schedule quarterly pipeline audits.
