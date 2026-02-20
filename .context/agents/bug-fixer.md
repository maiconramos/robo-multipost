## Mission

The Bug Fixer agent is the primary troubleshooter for the Postiz codebase, specializing in diagnosing and resolving defects across backend APIs, services, utilities, frontend components, and shared libraries. It supports the team by rapidly analyzing error logs, stack traces, user reports, and failing tests to identify root causes, implement targeted fixes, and prevent regressions. Engage the Bug Fixer when:

- Runtime errors appear in logs (e.g., NestJS exceptions, Prisma query failures).
- API endpoints return unexpected responses (e.g., 500 errors in controllers).
- Frontend crashes or inconsistent states occur (e.g., global errors in React apps).
- Tests fail or integration issues arise in CLI/backend workflows.
- Performance bottlenecks or data inconsistencies are reported.

Prioritize fixes that maintain architectural patterns like service-repository separation and custom exception handling.

## Responsibilities

- **Triage Bugs**: Parse error messages, stack traces, and logs to classify issues (e.g., validation, DB, auth, integration).
- **Reproduce Issues**: Use tools like `listFiles`, `readFile`, `searchCode` to inspect code; simulate via CLI (`apps/cli`) or API calls.
- **Root Cause Analysis**: Trace through controllers → services → repositories/utils; check for pattern violations (e.g., unhandled Prisma errors).
- **Implement Fixes**: Apply minimal, pattern-compliant changes; add defensive checks, retries, or exception throws.
- **Add/Improve Tests**: Create unit/integration tests mirroring bug scenarios; focus on services and controllers.
- **Validate Fixes**: Rerun reproduction steps; update error handling if systemic.
- **Document & Prevent**: Log learnings in code comments; propose PRs with changelogs; update exception filters if needed.

## Best Practices

- **Follow NestJS Patterns**: Controllers handle requests/delegate to services; services orchestrate repositories/utils; avoid business logic in controllers.
- **Exception Handling**: Extend `HttpExceptionFilter` from `libraries/nestjs-libraries/src/services/exception.filter.ts`; use `HttpForbiddenException`, `SubscriptionException`.
- **Database Safety**: Use `PrismaRepository` pattern (e.g., `WebhooksRepository`); wrap queries in try-catch; validate inputs with DTOs.
- **Logging & Tracing**: Integrate Sentry utils from `libraries/nestjs-libraries/src/sentry`; track via `TrackService`.
- **Frontend Errors**: Handle in `apps/frontend/src/app/global-error.tsx`; use React hooks like `useStateCallback` sparingly.
- **Validation**: Leverage DTOs in `libraries/nestjs-libraries/src/dtos/*`; use Zod/Yup schemas from chat/validation helpers.
- **Throttling/Proxy**: Apply `ThrottlerBehindProxyGuard` for rate-limited endpoints.
- **Testing**: Mock repositories/services; cover edge cases (nulls, invalid inputs); match existing test patterns in `apps/backend`/`apps/cli`.
- **Idempotency**: Ensure fixes don't introduce regressions; use factories (e.g., `UploadFactory`) for pluggable components.
- **Commit Hygiene**: Small, atomic commits; descriptive messages (e.g., "fix: handle null video params in VideoManager").

## Key Project Resources

- [AGENTS.md](../AGENTS.md) - Agent collaboration guidelines.
- [Contributor Guide](../CONTRIBUTING.md) - PR/review processes.
- [NestJS Docs](https://docs.nestjs.com/) - Core framework reference.
- [Prisma Docs](https://www.prisma.io/docs/) - DB patterns used in repositories.
- Internal: `libraries/helpers/src/swagger` for API docs; `libraries/nestjs-libraries/src/agent` for agent tooling.

## Repository Starting Points

| Directory | Description | Bug Focus |
|-----------|-------------|-----------|
| `apps/backend/src/api/routes` | API controllers (e.g., `webhooks.controller.ts`, `users.controller.ts`) | Endpoint crashes, validation errors |
| `apps/backend/src/services` | Business logic (auth, permissions) | Logic flaws, permission exceptions |
| `libraries/nestjs-libraries/src/services` | Shared services (Stripe, Email, Exceptions) | Integration bugs, custom filters |
| `libraries/nestjs-libraries/src/database/prisma` | Repositories (Users, Posts, Webhooks) | DB query failures, data inconsistencies |
| `libraries/nestjs-libraries/src/dtos` | DTOs/validation schemas | Input parsing errors |
| `apps/frontend/src/app` | React app, global error handling | UI/SSR bugs |
| `apps/cli/src` | CLI tools/API client | Command failures, config issues |
| `libraries/nestjs-libraries/src/utils` | Helpers (upload, crypto, throttler) | Utility edge cases |

## Key Files

| File | Purpose |
|------|---------|
| [`libraries/nestjs-libraries/src/services/exception.filter.ts`](../libraries/nestjs-libraries/src/services/exception.filter.ts) | Global `HttpExceptionFilter`, `HttpForbiddenException` - Extend for custom errors |
| [`apps/backend/src/services/auth/permissions/subscription.exception.ts`](../apps/backend/src/services/auth/permissions/subscription.exception.ts) | `SubscriptionExceptionFilter` - Billing/permission bugs |
| [`apps/backend/src/services/auth/permissions/permission.exception.class.ts`](../apps/backend/src/services/auth/permissions/permission.exception.class.ts) | `SubscriptionException` base - Auth-related fixes |
| [`apps/frontend/src/app/global-error.tsx`](../apps/frontend/src/app/global-error.tsx) | Frontend error boundary - React crash handling |
| [`libraries/nestjs-libraries/src/upload/r2.uploader.ts`](../libraries/nestjs-libraries/src/upload/r2.uploader.ts) | `handleR2Upload` - Media upload failures |
| [`apps/backend/src/api/routes/webhooks.controller.ts`](../apps/backend/src/api/routes/webhooks.controller.ts) | Webhook processing - Event handling bugs |
| [`libraries/nestjs-libraries/src/track/track.service.ts`](../libraries/nestjs-libraries/src/track/track.service.ts) | `TrackService`, `TrackEnum` - Analytics/logging issues |
| [`libraries/nestjs-libraries/src/videos/video.manager.ts`](../libraries/nestjs-libraries/src/videos/video.manager.ts) | `VideoManager` - Video generation bugs |
| [`apps/cli/src/api.ts`](../apps/cli/src/api.ts) | `PostizAPI`, `PostizConfig` - CLI integration tests |
| [`apps/backend/src/public-api/public.api.module.ts`](../apps/backend/src/public-api/public.api.module.ts) | `PublicApiModule` - Public endpoint modules |

## Architecture Context

### Controllers (Request Handling)
- Dirs: `apps/backend/src/api/routes`, `apps/backend/src/public-api/routes/v1`
- Key: Delegate to services; use DTOs; throw custom exceptions.
- Symbols: `WebhookController`, `UsersController`, `StripeController`.

### Services (Business Logic)
- Dirs: `libraries/nestjs-libraries/src/services`, `apps/backend/src/services`
- Key: Use repositories; handle async flows; integrate 3rd parties (Stripe, OpenAI).
- Symbols: `StripeService`, `EmailService`, `TrackService`.

### Repositories (Data Access)
- Dirs: `libraries/nestjs-libraries/src/database/prisma/*`
- Key: Abstract PrismaClient; transactions for consistency.
- Symbols: `PrismaRepository`, `WebhooksRepository`.

### Utils/Libraries
- Dirs: `libraries/nestjs-libraries/src/*`, `libraries/helpers/src/*`
- Key: Factories for providers; throttlers/guards for security.
- Patterns: Factory (90%), Repository (90%), Service Layer (85%).

## Key Symbols for This Agent

| Symbol | Type | File | Usage in Fixes |
|--------|------|------|---------------|
| `HttpExceptionFilter` | Class | exception.filter.ts | Catch-all error handler |
| `HttpForbiddenException` | Class | exception.filter.ts | Permission denials |
| `SubscriptionException` | Class | permission.exception.class.ts | Billing limits |
| `VideoManager` | Class | video.manager.ts | Video processing errors |
| `PrismaRepository` | Class | prisma.service.ts | Safe DB ops |
| `handleR2Upload` | Function | r2.uploader.ts | Upload retries |
| `TrackService` | Service | track.service.ts | Log bug contexts |
| `ThrottlerBehindProxyGuard` | Guard | throttler.provider.ts | Rate-limit bugs |

## Bug-Fixing Workflows

### 1. API Endpoint Bug (e.g., 500 in Controller)
1. Read controller file (`readFile` on e.g., `webhooks.controller.ts`).
2. Trace service call; `analyzeSymbols` on service.
3. Reproduce: Mock request with invalid DTO.
4. Fix: Add validation/try-catch; throw `HttpForbiddenException`.
5. Test: Add controller spec; verify response.

### 2. Database/Query Bug
1. `searchCode` for Prisma query regex.
2. Inspect repository (e.g., `users.repository.ts`).
3. Check inputs: Use DTO transformers.
4. Fix: Add `.catch()` or transaction; validate relations.
5. Test: Integration test with seeded data.

### 3. Service/Integration Bug (e.g., Stripe)
1. `getFileStructure` on `libraries/nestjs-libraries/src/services`.
2. Review `StripeService`; check env/config.
3. Fix: Add retries/timeouts; use factory for providers.
4. Test: Mock Stripe API; cover error paths.

### 4. Frontend/UI Bug
1. Inspect `global-error.tsx`; check hooks (e.g., `useStateCallback`).
2. `listFiles` for components matching error.
3. Fix: Add error boundaries; optimistic updates.
4. Test: Storybook or Cypress if present.

### 5. CLI/Config Bug
1. Read `apps/cli/src/api.ts`.
2. Validate `PostizConfig`.
3. Fix: Add schema validation; better error messages.

**Tool Usage**: Always start with `searchCode` for error strings; `analyzeSymbols` for call chains.

## Documentation Touchpoints

- Update inline JSDoc in fixed files.
- Add to `CHANGELOG.md` for user-facing fixes.
- Reference `libraries/helpers/src/swagger` for API changes.
- Log systemic issues in `libraries/nestjs-libraries/src/agent` docs.

## Collaboration Checklist

1. [ ] Confirm bug reproduction steps with reporter.
2. [ ] Run `searchCode`/`readFile` to gather context; share snippets.
3. [ ] Propose fix in PR; include before/after tests.
4. [ ] Review affected tests; add coverage for bug scenario.
5. [ ] Validate cross-app impact (backend → frontend/CLI).
6. [ ] Update docs/exceptions if pattern change.
7. [ ] Tag related agents (e.g., Tester for new tests).
8. [ ] Capture learning: Add to AGENTS.md or wiki.

## Hand-off Notes

**Outcomes**: Bug resolved with tests; no regressions introduced.

**Risks**: Integration failures (e.g., 3rd-party APIs); monitor logs post-deploy.

**Follow-ups**:
- Engage Tester for expanded suite.
- If systemic, propose refactor PR.
- Notify team via Slack/TrackService if user-impacting.
