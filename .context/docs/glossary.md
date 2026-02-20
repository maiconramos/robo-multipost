## Glossary & Domain Concepts

The Postiz platform (also referred to as Robo-Multipost) is a comprehensive system for automating content distribution across social media, newsletters, and third-party platforms. Key domain entities include **Posts** (content items scheduled or published across channels), **Integrations** (authenticated connections to external providers like Instagram, LinkedIn, or Bluesky), **Autoposts** (automated workflows for recurring posts), **Agents** (AI-driven tools for content generation and management), **Launches** (campaigns or one-off content drops), **Plugs** (configurable UI extensions or settings panels), and **Providers** (platform-specific adapters, e.g., `BlueskyProvider`).

User personas include:
- **Content Creators/Influencers**: Schedule and auto-post multimedia content to multiple platforms.
- **Social Media Managers**: Manage integrations, analytics, and team permissions for organizations.
- **Agency Owners**: Handle multi-client autoposts, billing, and agency-specific repositories.
- **Developers**: Use SDK/CLI for custom automation or browser extensions for cookie-based auth.

See [project-overview.md](./project-overview.md) for architecture details.

## Type Definitions

- **`PostizConfig`** ([apps/cli/src/api.ts:3](../apps/cli/src/api.ts)): Configuration object for CLI/SDK interactions, including API keys and endpoints.
- **`AppAbility`** ([apps/backend/src/services/auth/permissions/permissions.service.ts:11](../apps/backend/src/services/auth/permissions/permissions.service.ts)): Type for CASL-based ability rules in authorization.
- **`AbilityPolicy`** ([apps/backend/src/services/auth/permissions/permissions.ability.ts:5](../apps/backend/src/services/auth/permissions/permissions.ability.ts)): Policy structure defining user permissions.
- **`AllProvidersSettings`** ([libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts:28](../libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts)): Comprehensive settings for all social providers in a post.
- **`AuthTokenDetails`** ([libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts:66](../libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts)): Token metadata from OAuth flows.
- **`AnalyticsData`** ([libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts:53](../libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts)): Standardized analytics response (views, clicks, engagements).
- **`PostResponse`** ([libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts:102](../libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts)): Details of a published post, including ID and status.
- **`NotificationType`** ([libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts:9](../libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts)): Enum-like type for system notifications (e.g., post failure, token expiry).

## Enumerations

- **`TrackEnum`** ([libraries/nestjs-libraries/src/user/track.enum.ts:1](../libraries/nestjs-libraries/src/user/track.enum.ts)): User tracking events (e.g., login, post creation) for analytics.
- **`Sections`** ([apps/backend/src/services/auth/permissions/permission.exception.class.ts:3](../apps/backend/src/services/auth/permissions/permission.exception.class.ts)): UI sections guarded by permissions (e.g., billing, analytics).
- **`AuthorizationActions`** ([apps/backend/src/services/auth/permissions/permission.exception.class.ts:16](../apps/backend/src/services/auth/permissions/permission.exception.class.ts)): CRUD actions (create, read, update, delete) for policy enforcement.
- **`PostComment`** ([apps/frontend/src/components/new-launch/providers/high.order.provider.tsx:31](../apps/frontend/src/components/new-launch/providers/high.order.provider.tsx)): Comment states in post previews (e.g., enabled, disabled).

## Core Terms

- **Autopost**: Automated, scheduled posting workflow using Temporal. Relevance: Handles recurring content distribution. Surfaces in `apps/orchestrator/src/workflows/autopost.workflow.ts`, `AutopostDto`, and `AutopostController`.
- **Integration**: OAuth-based connection to a provider (e.g., LinkedIn). Relevance: Enables posting/analytics. Defined in `ISocialMediaIntegration`, managed by `IntegrationManager`.
- **Provider**: Platform adapter (e.g., `BlueskyProvider`). Relevance: Abstracts API calls. Listed in `provider.registry.ts` and `all.providers.settings.ts`.
- **Agent**: AI agent using OpenAI/Fal for graph-based workflows. Relevance: Generates/optimizes content. In `AgentGraphService`, `AgentToolInterface`.
- **Plug**: Extensible UI component/settings panel. Relevance: Customizes launches/posts. In `apps/frontend/src/components/plugs/` and `@Plug()` decorator.
- **Short-linking**: URL shortening service. Relevance: Tracks clicks in posts. In `ShortLinkService` and `short-linking.interface.ts`.
- **Launch**: Campaign creation UI/flow. Relevance: Multi-step post setup. In `apps/frontend/src/components/new-launch/`.
- **R2 Uploader**: Cloudflare R2-based file upload. Relevance: Media handling for posts/videos. In `r2.uploader.ts` with multipart support.

## Acronyms & Abbreviations

- **API**: Application Programming Interface – Public endpoints in `apps/backend/src/public-api/`.
- **CLI**: Command-Line Interface – `apps/cli/` for scripting posts/uploads.
- **SDK**: Software Development Kit – `apps/sdk/` wrapper for `Postiz` class.
- **R2**: Cloudflare R2 – Object storage for uploads (`upload.module.ts`).
- **CASL**: Centralized Authorization for Laravel-like rules (`AppAbility`).
- **Temporal**: Workflow orchestration engine (`temporal.register.ts`).

## Personas / Actors

- **Content Creator**: Goals: Quick multi-platform posting, AI-assisted content. Workflows: New Launch → Select Providers → Schedule Autopost. Pain points addressed: Manual logins (via extension), token expiry (auto-refresh workflows).
- **Agency Admin**: Goals: Team management, client billing. Workflows: Add team members (`AddTeamMemberDto`), agency repos (`AgenciesRepository`). Pain points: Permission silos (CASL policies), analytics aggregation.
- **Developer/Integrator**: Goals: Custom tools. Workflows: CLI commands (`createPost`, `listIntegrations`), extension for cookie auth. Pain points: OAuth complexity (abstracted by providers).

## Domain Rules & Invariants

- **Token Refresh**: Integrations require `refresh_token` scopes; auto-refreshed via `refreshTokenWorkflow`. Invalid/missing scopes trigger `NotEnoughScopes`.
- **Post Validation**: Content must pass `ValidContent`/`ValidUrlPath`; providers enforce per-platform rules (e.g., char limits, media types).
- **Permissions**: All actions checked via `AppAbility`/`AbilityPolicy`; agencies inherit org rules.
- **Billing**: Subscriptions via Stripe (`StripeService`); lifetime plans in `/billing/lifetime`.
- **Localization**: Translations via `useT`/`getT`; no region-specific compliance noted, but throttles (`ThrottlerBehindProxyGuard`) prevent abuse.
- **Uploads**: Multipart for >5MB files (`createMultipartUpload`); validated by `CustomFileValidationPipe`.

## Related Resources

- [project-overview.md](./project-overview.md)
