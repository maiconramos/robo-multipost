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
- Use `@GetUserFromRequest()`, `@GetOrgFromRequest()` and `@GetProfileFromRequest()` (from `libraries/nestjs-libraries/src/user/`) to extract the authenticated user/org/active profile. They are populated by `AuthMiddleware` (`src/services/auth/auth.middleware.ts`), which `src/api/api.module.ts` applies only to controllers listed in `authenticatedController`.
- HTTP errors are `HttpException` with semantic status — **do not** use 402 for "credential not configured" (intercepted by Postiz's global billing modal layout context). Use **412 Precondition Failed**. Details in [`libraries/nestjs-libraries/src/ai/CLAUDE.md`](../../libraries/nestjs-libraries/src/ai/CLAUDE.md).

## Key File Map

| File | Purpose |
|---|---|
| `src/main.ts` | NestJS bootstrap, `initializeSentry()`, port listen |
| `src/app.module.ts` | Root module — registers `SentryModule`, global `FILTER`, api/public-api modules, and the global `APP_GUARD` chain: `ThrottlerBehindProxyGuard` → `PoliciesGuard` (billing/role policies) → `ProfileAccessGuard` (per-profile isolation, closed-by-default) |
| `libraries/nestjs-libraries/src/throttler/throttler.provider.ts` | Besides the global `ThrottlerBehindProxyGuard` (allowlisted routes only): route-level guards for routes that cost money outside — `ThrottlerRealIpGuard` (public routes; client = first `x-forwarded-for` validated with `net.isIP`, else `req.ip`; plus a per-handler global ceiling of `REAL_IP_GLOBAL_CEILING_FACTOR`× the limit that keeps the client's `X-RateLimit-*`), `ThrottlerOrgUserGuard` (authenticated; keyed by org + user) and `ThrottlerFarcasterLoginGuard` (login code exchange; throttles only provider `FARCASTER`). Apply with `@UseGuards(...)` + `@Throttle(...)`. The per-IP key relies on the front proxy overwriting XFF (production: Traefik → container nginx `$proxy_add_x_forwarded_for`) |
| `src/api/api.module.ts` | HTTP module for the private API (controllers requiring auth) |
| `src/api/routes/` | 30+ REST controllers (auth, posts, integrations, ai-*, copilot, flows, ig-webhook, automations-inbox, etc.) |
| `src/public-api/` | Versioned public API (`/v1/`) — authenticated by API key (org or per-profile). Controllers register in `public.api.module.ts` `authenticatedController` array (middleware auto-applies). Per-profile scoping: reject `?profileId` ≠ key's profile with `403` (pattern in `public.integrations.controller.ts`); `FlowsService` is `@Global` (DatabaseModule) so no provider wiring needed. Example: `public.flows.controller.ts` (IG comment automations CRUD) |
| `src/services/` | Small utility layer for the HTTP app (do not confuse with domain services in libraries) |

## Common Workflows

### Add a new REST route

1. **Define the contract** (API-First): endpoint, payload (DTO in `libraries/nestjs-libraries/src/dtos/`), response.
2. **Spec first** (TDD): `foo.service.spec.ts` in `libraries/nestjs-libraries/src/.../foo.service.ts` with the expected behavior. Use `createMock`/`createTestModule` (see [`libraries/nestjs-libraries/CLAUDE.md`](../../libraries/nestjs-libraries/CLAUDE.md)).
3. **Implement Service and Repository** in `libraries/nestjs-libraries/`.
4. **Create the Controller** at `src/api/routes/foo.controller.ts`. Import the service from the library. Read identity with `@GetOrgFromRequest()` / `@GetUserFromRequest()` / `@GetProfileFromRequest()`.
5. **Register** the controller in `src/api/api.module.ts` by adding it to the `authenticatedController` array (it is spread into `controllers:` and `AuthMiddleware` is applied to it). A controller listed only in `controllers:` is **unauthenticated** — reserve that for routes that verify their own credential (HMAC webhooks, signed-JWT params such as `EnterpriseController`; see pitfall 12).
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
3. **Symptom:** `@GetOrgFromRequest()` / `@GetUserFromRequest()` returning `undefined`, or a new route answering without a login → **Cause:** the controller is in `controllers:` but not in `authenticatedController` (`src/api/api.module.ts`), so `AuthMiddleware` never runs. **Fix:** add it to `authenticatedController`.
4. **Symptom:** imported from `@gitroom/backend/...` inside a library → **Cause:** circular dependency. **Fix:** libraries **never** import from the backend; only the backend imports from libraries.
5. **Symptom:** new endpoint does not appear in Swagger → **Cause:** controller not registered in `api.module.ts`. **Fix:** add it to `authenticatedController` (or to `controllers:` only for a deliberately unauthenticated route).
6. **Symptom:** TS error `'createTestModule' does not exist` in a new spec → **Cause:** wrong import path. **Fix:** `import { createTestModule } from '@gitroom/nestjs-libraries/test'`.
7. **Symptom:** `GET /automations/aliases/lookup` returns flows from other orgs → **Cause:** `lookupAliasFlows` (and any new service method that searches by external ID like `aliasMediaId`) was called without passing `orgId`. **Fix:** all service methods that accept an externally-supplied identifier (media ID, comment ID, etc.) MUST also accept and enforce `orgId` — closes cross-tenant info leak. See `FlowsService.lookupAliasFlows`.
8. **Symptom:** a route that should return a plain 403 instead force-logs-out the user (401 + cookie cleared) → **Cause:** it threw/extended `HttpForbiddenException` (`libraries/nestjs-libraries/src/services/exception.filter.ts`), which the global `HttpExceptionFilter` always converts to a session-kill. **Fix:** use `new HttpException(body, 403)` or a dedicated class (`AdminRoleRequiredException`, `NoProfileAssignedException`, `ProfileReadOnlyException`, `ProfileManageDeniedException`) — never extend `HttpForbiddenException` for anything other than "force logout".
9. **Symptom:** in a self-hosted install (no `STRIPE_PUBLISHABLE_KEY`), an org `USER` reaches an admin-only endpoint → **Cause:** looks like the billing bypass in `PermissionsService.check` (`!STRIPE_PUBLISHABLE_KEY` ⇒ allow everything) also covers `Sections.ADMIN`, but that's a role check, not a plan check. **Fix:** `Sections.ADMIN` requests are filtered out of the billing bypass and evaluated against role unconditionally; denial throws `AdminRoleRequiredException` (403), never `SubscriptionException` (402).
10. **Symptom:** a legacy local account can log in only with the exact capitalization originally used in its email → **Cause:** an exact Prisma email lookup, combined with historical registrations stored before normalization. **Fix:** keep `UsersRepository.getUserByEmail` case-insensitive and normalize only new `CreateOrgUserDto` local registrations before duplicate/invite checks and persistence. Never loosen the invitation email-lock or substitute an unverified OAuth email.
11. **Symptom:** `/posts/generator` stops mid-stream and the frontend remains loading → **Cause:** an exception escaped after NDJSON headers/events were already sent, or a JSON line was split between network chunks. **Fix:** emit a final controlled `{ error: true }` NDJSON event after stream start, buffer partial lines on the client, sanitize unexpected exceptions, and always clear UI state in `finally`.

12. **Symptom:** a route "authenticated" only by `AuthService.verifyJWT(params)` (no `AuthMiddleware`) accepts a user's own login token, an invite link or a reset token → **Cause:** every JWT in the instance (login = full `User` row, team invite `{orgId,timeLimit,...}`, password reset `{id,expires}`, Chrome-extension `{integrationId,...}`, enterprise provisioning) is signed with the same `JWT_SECRET` and carries no purpose/audience claim, so a valid signature proves nothing about *which* token it is (CVE-2026-94455 on `/enterprise/create-user`). **Fix:** use `verifyEnterpriseToken` (`libraries/nestjs-libraries/src/services/enterprise.token.ts`) for enterprise routes — it rejects the known foreign shapes (`FOREIGN_TOKEN_CLAIMS` is a denylist with one claim per existing signed payload except the enterprise `{ apiKey }` callback: a NEW signed payload is accepted by `/enterprise/*` until one of its claims is added there and to `enterprise.token.spec.ts`) — and never spread a client body into a signed payload (`inviteTeamMember` whitelists its fields). Never sign client-supplied JSON (`extension-refresh` stores AES-encrypted cookies instead): an attacker-chosen payload signed with `JWT_SECRET` is a universal token forgery oracle. `AuthMiddleware` itself accepts only the session shape (`asSessionPayload` in `libraries/nestjs-libraries/src/services/auth/session.token.ts`: string `id` + numeric `iat`, none of `NON_SESSION_CLAIMS` with a value, not `activated: false` — the activation e-mail link) and rejects revoked sessions (`isSessionRevoked`: older than 1 year, or `iat` before `User.sessionsValidAfter`, which `UsersRepository.updatePassword` sets; `forgotReturn` uses the same cutoff to make reset links single-use). A new signed payload that carries an `id` claim must add one of its claims to `NON_SESSION_CLAIMS` too.
13. **Symptom:** a provider helper becomes reachable from the browser (file read, process crash) → **Cause:** `POST /integrations/function` executes a provider method by the `name` the client sends. **Fix:** the controller only runs methods that `IntegrationManager.isDashboardCallable` accepts (`@Tool` or `@DashboardFunction()`); `/integrations/mentions` forces `name: 'mention'`; both routes go through `validateIntegrationProfile` like the other channel routes. Mark a new dashboard helper with `@DashboardFunction()` instead of loosening the check. The same allowlist idea guards `POST /third-party/function/:id/:functionName` (`isThirdPartyFunctionCallable`: only methods declared on the provider class).
14. **Symptom:** an authenticated or public-API response contains `apiKey`, `token`, `refreshToken` or `customInstanceDetails` → **Cause:** the controller returns a whole Prisma row (`update`/`create` return every column) or a service value that `AuthMiddleware` also consumes (CVE-2026-107761: `GET /user/organizations`, `DELETE /public/v1/integrations/:id`). **Fix:** `select` explicitly in the repository (`IntegrationRepository.deleteChannel` → `{ id: true }`) or project at the controller edge (`UsersController.getOrgs` → `{ id, name, users, subscription }`; `getOrgsByUserId` keeps the full row because `AuthMiddleware` needs it). Post reads by id (`GET /posts/:id`, `/posts/group/:group`) go through `toPublicPost`/`toPublicIntegration` (`libraries/nestjs-libraries/src/database/prisma/posts/post.response.projection.ts`), which also drops `Post.error` (raw provider exception, may carry `refresh_token`/`client_secret`); list reads (`PostsRepository.getPosts` → calendar and `GET /public/v1/posts`) return only `curatedPostError(error)` — the `bad_body` message, redacted with `redactSecrets`, or `null` and `childrenPost`; the worker keeps the full row via the repository. `PUT /posts/:id/date` returns only `{ id, publishDate, state }` (`PostsRepository.changeDate` `select`). The unauthenticated preview `GET /public/posts/:id` (`public.controller.ts`) returns an explicit allowlist (`id, content, image, publishDate, state, delay, releaseURL, integration{id,name,picture,providerIdentifier,profile}`) — never `group` (it is the key of the group-replacement soft delete), `organizationId`, `profileId` or `settings`.
15. **Symptom:** a per-profile API key (or an org USER) can read, delete or drive a channel/post of another profile in the same org → **Cause:** a route takes a channel/post id and only scopes by org. **Fix:** every route that receives an integration id must call `validateIntegrationProfile(org.id, id, profileId[, { requireProfile: getOrgRole(org) === 'USER' }])` (public API: only when `publicApiProfileId` is set — public org objects always carry role USER, so never use the `requireProfile` form there); every route that receives a post id must pass the profile to the service, which checks `post.profileId` (`PostsService.assertPostInProfile` → 404, or `[]` for list reads like `checkPostAnalytics`/`getMissingContent`). `validateIntegrationProfile` throws `HttpException` 403/404 (a plain `Error` would become a 500). Covered routes as of 2026-10-26: public `DELETE /integrations/:id`, `GET /integration-settings/:id`, `POST /integration-trigger/:id`, `GET /posts/:id/missing`, `PUT /posts/:id/release-id`; dashboard `GET /posts/:id`, `/posts/group/:group` (every root of the group is filtered by profile), `/posts/:id/missing`, `/posts/:id/release-url`, `PUT /posts/:id/release-id`, `GET/POST /integrations/:id/plugs`, `PUT /integrations/plugs/:id/activate`, `PUT /integrations/:id/custom-name`, `POST /integrations/provider/:id/connect` (body validated by `ProviderPageDto` with a whitelist pipe, also on the unauthenticated `/integrations/public/provider/:id/connect`), `GET /posts/find-slot/:id` (checked inside `PostsService.findFreeDateTime`); `PUT /integrations/customers/:id` renames an org-wide group, so a USER may rename it only when every live channel of the group is in their profile (`IntegrationService.updateCustomerName`); `POST /posts` (dashboard, public API and MCP) validates each `posts[].integration.id` inside `PostsService.createPost`. `PostsRepository.createOrUpdatePost` scopes the group replacement by `organizationId` and, when the save has a profile, by that profile or legacy rows without one (the client controls `group`); `GET /posts/group/:group` also returns `siblings` (other channels of the same batch, same profile only). Review-style dashboard routes — `/posts/:id/comments`, `/posts/:id/statistics`, `POST/GET /posts/:id/review-links`, `DELETE /posts/:id/review-links/:linkId` — pass `requireProfileId = getOrgRole(org) === 'USER' ? profile?.id ?? null : undefined` and the service compares strictly (`PostsService.assertPostReviewAccess`, `ReviewLinksService.assertReviewScope`: 403 for another profile, 404 if the post does not exist, admins unrestricted; `revoke` derives the profile from the link's post); `GET /posts/old` filters the USER's profile in `PostsRepository.getOldPosts`. Public `GET /social/:integration` stores `profile:${state}` for profile keys (the OAuth callback reads it), mirroring the dashboard route (as of 2026-10-27).
16. **Symptom:** a third-party OAuth app approved by an org member with role `USER` reads or writes channels/posts of every profile → **Cause:** the `pos_` token used to carry only the organization, and `PublicAuthMiddleware`/`startMcp` treat it as an org-wide credential. **Fix:** `POST /oauth/authorize` stores `OAuthAuthorization.profileId` = the approver's active profile when `getOrgRole(org) === 'USER'` (null for ADMIN/SUPERADMIN, org-wide); `OAuthService.getOrgByOAuthToken` re-checks the approver on every use (`OAuthRepository.getApproverAccess`: still a non-disabled member of the org; a USER needs a token bound to a live profile of the same org where they are still a non-VIEWER member — org-wide tokens approved by a USER before the column existed stop working); the public middleware sets `publicApiProfileId` and the MCP `resolveAuth` sets `profileId` from it, so every profile-scoped rule for profile API keys applies. Never resolve an OAuth token without going through `getOrgByOAuthToken`. Removing a member from the org (`OrganizationRepository.deleteTeamMember`) or from a profile (`ProfileRepository.removeMember`) revokes their authorizations there; `/oauth/token` compares the client secret in constant time, consumes the code once (`exchangeCodeForToken` matches the stored code) and has its own throttle bucket (`ThrottlerBehindProxyGuard`, also `/autopost/send`).
17. **Symptom:** a Farcaster login or channel connect succeeds with a code obtained elsewhere (link with `?code=`, another browser, another org), or a Neynar signer is created/consulted without a binding → **Cause:** the Farcaster code is a bearer credential for the approved managed signer. **Fix:** every signer goes through `FarcasterSignerService` and the Redis registry (`farcaster.signer.registry.ts`): the browser only gets an opaque `requestId` (never the `signer_uuid`), polled by `POST .../status` with a body, never a query string. Login (`/auth/farcaster/signer`, public, 404 without `NEYNAR_CLIENT_ID`): httpOnly cookie `farcaster_login` (random nonce, hash in Redis, same flags as `auth`), required by status and by the code exchange — `POST /auth/oauth/FARCASTER/exists`, `/auth/login` and `/auth/register` call `assertLoginCode` before `AuthService` and `consumeLogin` after success (a new account keeps the code until `/auth/register`). Channel (`/integrations/farcaster/signer`, authenticated, `CheckPolicies` Create CHANNEL): bound to org + user + profile + the `state` of `/integrations/social/wrapcast` (checked against `organization:${state}`/`profile:${state}`); `social-connect` passes `body.state` to `authenticate`, which requires the same state and consumes the entry. Single use (`DEL` = 1); unknown codes are rejected before any Neynar call. Sponsorship (`NEYNAR_SPONSOR_SIGNERS`) only on the channel route. Residual, documented in `docs/operations/farcaster-neynar.md`: consent phishing (someone approving a QR another person started) and the login signer staying approved until the user revokes it (Neynar has no revoke API).
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
