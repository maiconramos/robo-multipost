## Data Flow & Integrations

Data enters the system primarily through three entry points: the web frontend (Next.js app), the CLI tool, and the browser extension. These interfaces interact with the backend API (NestJS-based in `apps/backend`) via HTTP requests for actions like authentication, post creation, integration setup, and uploads. The backend processes inputs through controllers (e.g., `AuthController`, `AutopostController`), validates them using DTOs (e.g., `AutopostDto`), and delegates to services.

Core data movement occurs via:
- **Synchronous paths**: Direct service calls for CRUD operations on Prisma repositories (e.g., `AutopostRepository`, `AgenciesRepository`).
- **Asynchronous paths**: Temporal workflows in `apps/orchestrator` (e.g., `autoPostWorkflow`, `refreshTokenWorkflow`) orchestrate activities like `PostActivity`, `IntegrationsActivity`, and `AutopostActivity`. These handle posting to social platforms, token refreshes, and email notifications.
- **Shared state**: Prisma database for persistence (users, posts, integrations), Redis for caching/sessions, and R2/Cloudflare for media uploads.

Data exits via external integrations (e.g., social media posts, emails, newsletters) or API responses. For example, a post creation flow uploads media, generates content via OpenAI/Fal services, and queues a Temporal workflow to distribute across connected platforms. See [architecture.md](./architecture.md) for layer details.

## Module Dependencies

- **apps/backend/** → `libraries/nestjs-libraries` (integrations, dtos, database/prisma, upload, temporal), `libraries/helpers` (auth, utils)
- **apps/frontend/** → `apps/backend` (public API endpoints), `libraries/react-shared-libraries` (translation, sentry, helpers)
- **apps/orchestrator/** → `libraries/nestjs-libraries` (temporal, integrations, database/prisma services), `apps/backend` (shared services)
- **apps/cli/** → `apps/backend` (API client via `PostizAPI`), `apps/sdk`
- **apps/extension/** → `apps/backend` (indirect via token refresh), internal providers
- **apps/commands/** → `libraries/nestjs-libraries` (tasks for agent.run, refresh.tokens), `apps/backend`
- **libraries/nestjs-libraries/** → Prisma (database), external SDKs (OpenAI, Stripe, Resend)

## Service Layer

- [`AutopostService`](libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts) - Manages scheduled posts and workflows.
- [`AgenciesService`](libraries/nestjs-libraries/src/database/prisma/agencies/agencies.service.ts) - Handles agency accounts and teams.
- [`IntegrationManager`](libraries/nestjs-libraries/src/integrations/integration.manager.ts) - Coordinates social media and third-party connections.
- [`RefreshIntegrationService`](libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts) - Token refresh for integrations.
- [`OpenaiService`](libraries/nestjs-libraries/src/openai/openai.service.ts) - Content generation and extraction.
- [`EmailService`](libraries/nestjs-libraries/src/services/email.service.ts) - Email sending via providers.
- [`StripeService`](libraries/nestjs-libraries/src/services/stripe.service.ts) - Billing and subscriptions.
- [`TrackService`](libraries/nestjs-libraries/src/track/track.service.ts) - Analytics and event tracking.
- [`ShortLinkService`](libraries/nestjs-libraries/src/short-linking/short.link.service.ts) - URL shortening.
- [`VideoManager`](libraries/nestjs-libraries/src/videos/video.manager.ts) - Video processing and generation.

## High-level Flow

The primary pipeline for autoposting follows this sequence:

```mermaid
graph TD
    A[User Input: Frontend/CLI/Extension] --> B[Backend Controllers<br/>(AuthController, AutopostController)]
    B --> C[Services & DTO Validation<br/>(AutopostService, IntegrationManager)]
    C --> D[Database Persist<br/>(Prisma Repos)]
    C --> E[Temporal Orchestrator<br/>(autoPostWorkflow)]
    E --> F[Activities<br/>(PostActivity, IntegrationsActivity)]
    F --> G[External Integrations<br/>(Social Providers)]
    G --> H[Post Published<br/>+ Analytics Feedback]
    D --> I[Redis Cache / Signals]
    H --> J[Response / Notifications]
```

1. Input validated and persisted.
2. Workflow enqueued via Temporal.
3. Activities execute integrations asynchronously.
4. Results tracked and notified (e.g., via `digestEmailWorkflow`).

## Internal Movement

Modules collaborate via:
- **Temporal**: Workflows (`apps/orchestrator/src/workflows/*`) signal activities across services. Infinite workflows handle retries (e.g., `InfiniteWorkflowRegister`).
- **Events/Signals**: Custom signals like `SendEmail` trigger emails; Redis pub/sub for real-time updates.
- **RPC/Database**: gRPC not used; instead, shared Prisma client across backend/orchestrator. Direct service injection in NestJS modules.
- **Queues**: Temporal task queues manage backpressure; throttler guards (`ThrottlerBehindProxyGuard`) limit API rates.

## External Integrations

- **Social Media** (via `IntegrationManager` & providers in `libraries/nestjs-libraries/src/integrations/social/*`):
  | Provider | Purpose | Auth | Payload | Retry |
  |----------|---------|------|---------|-------|
  | `BlueskyProvider` | Post/poll creation | OAuth refresh tokens | `PostResponse`, `MediaContent` | Exponential backoff in Temporal |
  | `LinkedInPageProvider` | Analytics (views/clicks) | OAuth scopes | `AnalyticsData` (e.g., `AllPageViews`) | 3 retries, dead-letter on failure |
  | `SkoolProvider`, `BeehiivProvider` | Community/newsletter posts | API keys | `PostDetails` | Workflow retries |

- **Billing**: `StripeService` - Webhooks for subscriptions (`BillingSubscribeDto`); payouts via `Nowpayments`.
- **Emails**: `EmailService` → `ResendProvider`/`NodeMailerProvider`; payloads: `{ to, subject, html }`; retry via Temporal.
- **Uploads**: R2 uploader (`r2.uploader.ts`) - Multipart for large files; signed URLs.
- **AI/ML**: `OpenaiService`/`FalService` - Content extraction/generation; `ExtractContentService`.
- **Auth**: Multi-provider (e.g., `AuthService` with permissions via `AppAbility`).

All integrations use `RefreshIntegrationService` for token management; failures route to dead-letter queues in Temporal.

## Observability & Failure Modes

- **Metrics/Logs**: `TrackService` (events via `TrackEnum`); Sentry integration across apps; structured logs in services.
- **Traces**: Temporal workflow history; OpenTelemetry hooks in NestJS.
- **Failure Handling**: 
  - Retries: Temporal cron (`refreshTokenWorkflow` every 6h); backoff in activities.
  - Dead-letters: Failed workflows → Prisma `notifications` table.
  - Compensating: `abortMultipartUpload` for uploads; `NotEnoughScopes` filter auto-notifies users.
  - Alerts: Throttler exhaustion logged; Stripe webhooks trigger `digestEmailWorkflow`.

## Related Resources

- [architecture.md](./architecture.md)
