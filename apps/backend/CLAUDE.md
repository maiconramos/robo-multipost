# Backend (NestJS) — Claude Code Instructions

## Position in Hierarchy

- **Parent:** [`/CLAUDE.md`](../../CLAUDE.md)
- **Relevant siblings:**
  - [`apps/frontend/CLAUDE.md`](../frontend/CLAUDE.md) — UI that consumes this API
  - [`apps/orchestrator/CLAUDE.md`](../orchestrator/CLAUDE.md) — Temporal workflows triggered by these controllers
  - [`libraries/nestjs-libraries/CLAUDE.md`](../../libraries/nestjs-libraries/CLAUDE.md) — where the business logic these controllers call lives

## What lives here

NestJS REST API. **Thin controllers** that validate HTTP, extract params/user, and delegate to services in `libraries/nestjs-libraries/src/`. Only the HTTP module (`api.module.ts` + `app.module.ts`), `main.ts`, and the controller collection in `src/api/routes/` and `src/public-api/`. Business logic **never** lives here — always in libraries.

## Mandatory Architectural Pattern

```
Controller >> Service >> Repository
```

When orchestrating multiple services:

```
Controller >> Manager >> Service >> Repository
```

### Rules

- **Never skip a layer.** Controllers call Services (or Managers), never Repositories directly. Services call Repositories, never Prisma directly.
- Controllers **only import from libraries** (`@gitroom/nestjs-libraries/*`, `@gitroom/helpers/*`). Do not write new services in `apps/backend/src/services/` — use `libraries/nestjs-libraries/src/`.
- DTOs live in `libraries/nestjs-libraries/src/dtos/` (not in `apps/backend`).
- Use the `@CurrentUser()` and `@CurrentOrg()` decorators (from `libraries/nestjs-libraries/src/services/auth/permissions/`) to extract the authenticated user/org.
- HTTP errors are `HttpException` with semantic status — **do not** use 402 for "credential not configured" (intercepted by Postiz's global billing modal layout context). Use **412 Precondition Failed**. Details in [`libraries/nestjs-libraries/src/ai/CLAUDE.md`](../../libraries/nestjs-libraries/src/ai/CLAUDE.md).

## Key File Map

| File | Purpose |
|---|---|
| `src/main.ts` | NestJS bootstrap, `initializeSentry()`, port listen |
| `src/app.module.ts` | Root module — registers `SentryModule`, global `FILTER`, api/public-api modules, and the global `APP_GUARD` chain: `ThrottlerBehindProxyGuard` → `PoliciesGuard` (billing/role policies) → `ProfileAccessGuard` (per-profile isolation, closed-by-default) |
| `src/api/api.module.ts` | HTTP module for the private API (controllers requiring auth) |
| `src/api/routes/` | 30+ REST controllers (auth, posts, integrations, ai-*, copilot, flows, ig-webhook, automations-inbox, etc.) |
| `src/public-api/` | Versioned public API (`/v1/`) — authenticated by API key (org or per-profile). Controllers register in `public.api.module.ts` `authenticatedController` array (middleware auto-applies). Per-profile scoping: reject `?profileId` ≠ key's profile with `403` (pattern in `public.integrations.controller.ts`); `FlowsService` is `@Global` (DatabaseModule) so no provider wiring needed. Example: `public.flows.controller.ts` (IG comment automations CRUD) |
| `src/services/` | Small utility layer for the HTTP app (do not confuse with domain services in libraries) |

## Common Workflows

### Add a new REST route

1. **Define the contract** (API-First): endpoint, payload (DTO in `libraries/nestjs-libraries/src/dtos/`), response.
2. **Spec first** (TDD): `foo.service.spec.ts` in `libraries/nestjs-libraries/src/.../foo.service.ts` with the expected behavior. Use `createMock`/`createTestModule` (see [`libraries/nestjs-libraries/CLAUDE.md`](../../libraries/nestjs-libraries/CLAUDE.md)).
3. **Implement Service and Repository** in `libraries/nestjs-libraries/`.
4. **Create the Controller** at `src/api/routes/foo.controller.ts`. Import the service from the library. Apply guards/decorators (`@UseGuards(AuthService)`, `@CurrentUser()`).
5. **Register** the controller in `src/api/api.module.ts` (`controllers:` array).
6. **Frontend translation** (if there is UI): keys in `pt/translation.json` and `en/translation.json` (see [`apps/frontend/CLAUDE.md`](../frontend/CLAUDE.md)).
7. **CHANGELOG.md** under `[Unreleased]`.

### Add a guard or interceptor

Never create one in `apps/backend` — write it in `libraries/nestjs-libraries/src/services/auth/` (guards) or `libraries/nestjs-libraries/src/services/` (interceptors) and import.

New routes touching profile-scoped data are checked automatically by the global `ProfileAccessGuard` (`libraries/nestjs-libraries/src/services/auth/profile-access/`): org `USER` without a resolved profile → `403 NO_PROFILE_ASSIGNED`; `VIEWER` role → `403 PROFILE_READ_ONLY` on non-`GET`. Use `@ProfileManage({ param: 'profileId' })` to require `OWNER`/`MANAGER` on the target profile, or `@SkipProfileAccess()` to exempt identity/session/public/billing routes (see `users.controller.ts`, `billing.controller.ts`, `stripe.controller.ts`, `notifications.controller.ts`, `public.controller.ts`). Org `ADMIN`/`SUPERADMIN` always pass — resolved via `getOrgRole` (see [`libraries/nestjs-libraries/CLAUDE.md`](../../libraries/nestjs-libraries/CLAUDE.md)).

### External webhooks (e.g., Instagram, Stripe)

Webhooks live in `src/api/routes/*.webhook.controller.ts`. **Always validate HMAC** before processing. For IG, see [`libraries/nestjs-libraries/src/chat/CLAUDE.md`](../../libraries/nestjs-libraries/src/chat/CLAUDE.md) (validation with `FACEBOOK_APP_SECRET` AND `INSTAGRAM_APP_SECRET`).

## Sentry (backend)

Backend uses `@sentry/nestjs` (not `@sentry/nextjs`):

```typescript
import * as Sentry from '@sentry/nestjs';
import { SentryModule } from '@sentry/nestjs/setup';
import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
import { FILTER } from '@gitroom/nestjs-libraries/sentry/sentry.exception';
```

- Initialization: `initializeSentry()` in `main.ts` (internal helper wrapping `Sentry.init`).
- Global exception filter: `FILTER` from `sentry.exception` registered in `app.module.ts` as `APP_FILTER`.
- For manual capture in a controller/service, use `Sentry.captureException(error)` or `Sentry.captureMessage(...)`.
- **Frontend** Sentry setup (`@sentry/nextjs`, console logging integration, `logger.fmt`) is in [`apps/frontend/CLAUDE.md`](../frontend/CLAUDE.md).

## Known Pitfalls

1. **Symptom:** `Cannot inject ... PrismaService` in a new service → **Cause:** service trying to access Prisma directly. **Fix:** create a `*.repository.ts` extending `PrismaRepository<T>` and inject the repository into the service.
2. **Symptom:** billing modal opens when it should be a configuration error → **Cause:** controller returning `HTTP 402`. **Fix:** use `HTTP 412 Precondition Failed`.
3. **Symptom:** `RequestContext` or `@CurrentUser()` returning `undefined` → **Cause:** route is not behind the `AuthService` guard. **Fix:** apply `@UseGuards(AuthService)` to the controller or route.
4. **Symptom:** imported from `@gitroom/backend/...` inside a library → **Cause:** circular dependency. **Fix:** libraries **never** import from the backend; only the backend imports from libraries.
5. **Symptom:** new endpoint does not appear in Swagger → **Cause:** controller not registered in `api.module.ts`. **Fix:** add it to the `controllers:` array.
6. **Symptom:** TS error `'createTestModule' does not exist` in a new spec → **Cause:** wrong import path. **Fix:** `import { createTestModule } from '@gitroom/nestjs-libraries/test'`.
7. **Symptom:** `GET /automations/aliases/lookup` returns flows from other orgs → **Cause:** `lookupAliasFlows` (and any new service method that searches by external ID like `aliasMediaId`) was called without passing `orgId`. **Fix:** all service methods that accept an externally-supplied identifier (media ID, comment ID, etc.) MUST also accept and enforce `orgId` — closes cross-tenant info leak. See `FlowsService.lookupAliasFlows`.
8. **Symptom:** a route that should return a plain 403 instead force-logs-out the user (401 + cookie cleared) → **Cause:** it threw/extended `HttpForbiddenException` (`libraries/nestjs-libraries/src/services/exception.filter.ts`), which the global `HttpExceptionFilter` always converts to a session-kill. **Fix:** use `new HttpException(body, 403)` or a dedicated class (`AdminRoleRequiredException`, `NoProfileAssignedException`, `ProfileReadOnlyException`, `ProfileManageDeniedException`) — never extend `HttpForbiddenException` for anything other than "force logout".
9. **Symptom:** in a self-hosted install (no `STRIPE_PUBLISHABLE_KEY`), an org `USER` reaches an admin-only endpoint → **Cause:** looks like the billing bypass in `PermissionsService.check` (`!STRIPE_PUBLISHABLE_KEY` ⇒ allow everything) also covers `Sections.ADMIN`, but that's a role check, not a plan check. **Fix:** `Sections.ADMIN` requests are filtered out of the billing bypass and evaluated against role unconditionally; denial throws `AdminRoleRequiredException` (403), never `SubscriptionException` (402).

## Commands

```bash
pnpm dev-backend          # Run backend + frontend
pnpm build:backend        # Build backend in isolation
pnpm test:backend         # Specs in the backend only
pnpm test:libs            # Spec in the libraries (where most backend tests live)
```

## References

- [`libraries/nestjs-libraries/CLAUDE.md`](../../libraries/nestjs-libraries/CLAUDE.md) — where most of the logic tested by these routes lives
- [`docs/architecture/ai-provider-system.md`](../../docs/architecture/ai-provider-system.md) — AI endpoints (REST + 412 error)
- [`docs/architecture/instagram-automations.md`](../../docs/architecture/instagram-automations.md) — IG webhook and follow-gate flow
- [`docs/planning/agents.md`](../../docs/planning/agents.md) — product context
