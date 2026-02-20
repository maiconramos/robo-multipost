## Security & Compliance Notes

This project adheres to industry-standard security practices to protect user data, prevent unauthorized access, and mitigate common vulnerabilities. Key policies and guardrails include:

- **Input Validation and Sanitization**: All incoming requests are validated using NestJS pipes, including `CustomFileValidationPipe` for uploads and DTOs with class-validator (e.g., `AddCommentDto`, `AutopostDto`). URL paths are validated via `ValidUrlPath` and `ValidUrlExtension` utilities.
- **Rate Limiting**: Implemented via `ThrottlerBehindProxyGuard` and `ThrottlerModule` to prevent abuse, especially on public API endpoints like `/api/routes/*`.
- **Error Handling**: Centralized with `HttpExceptionFilter` and custom exceptions like `HttpForbiddenException`, `NotEnoughScopes`, and permission-specific errors in `permission.exception.class.ts`.
- **Secure Uploads**: Multipart uploads to Cloudflare R2 use signed URLs (`signPart`, `completeMultipartUpload`) with automatic abort on failure (`abortMultipartUpload`). Local storage is available for development.
- **Monitoring and Logging**: Sentry integration across frontend (`libraries/react-shared-libraries/src/sentry`) and backend. Track events via `TrackService` and `TrackEnum`.
- **HTTPS Enforcement**: All production deployments require TLS. Middleware in `apps/frontend/src/middleware.ts` handles secure redirects.
- **Dependency Management**: Regular audits for vulnerabilities; no known critical issues in core libraries like Prisma, NestJS, or Temporal.
- **Code Practices**: Secrets scanning in CI/CD, no hardcoded credentials, and linting rules enforce secure patterns (e.g., no `console.log` of sensitive data).

Developers must follow [architecture.md](./architecture.md) for service-layer security (e.g., Controllers → Services → Repositories). Report vulnerabilities via GitHub issues labeled "security".

## Authentication & Authorization

Authentication is managed via a custom NestJS-based system with JWT tokens and ability-based authorization using CASL.

- **Identity Providers**: Primary auth uses email/password with `AuthService` (`apps/backend/src/services/auth/auth.service.ts` and `libraries/helpers/src/auth/auth.service.ts`). Supports activation (`/auth/activate/[code]`) and password reset (`/auth/forgot/[token]`). Browser extension handles OAuth flows for social providers via cookie extraction (`extractCookies` in `apps/extension/src/background.ts`).
- **Token Formats**: JWTs issued by `AuthController` (`apps/backend/src/api/routes/auth.controller.ts`). Refresh tokens stored securely in the extension (`StoreRefreshTokenRequest`) and backend (encrypted via `encrypt_legacy_using_IV` with derived IV from `deriveLegacyKeyIv`).
- **Session Strategies**: Stateless JWTs validated by `AuthMiddleware` (`apps/backend/src/services/auth/auth.middleware.ts`). Extension uses background alarms (`ensureAlarm`, `refreshAllCookies`) for token refresh without persistent sessions.
- **Role/Permission Models**: CASL-powered with `AppAbility` (`apps/backend/src/services/auth/permissions/permissions.service.ts`) and `AbilityPolicy`. Actions defined in `AuthorizationActions` enum (e.g., read/write on posts, agencies). Checks via `abilities.can()` in controllers. Agencies support team members (`AddTeamMemberDto`).

Example permission check in a controller:
```typescript
import { AppAbility, AbilityPolicy } from '../services/auth/permissions';

@Controller('posts')
@UseGuards(AuthMiddleware)
export class PostsController {
  constructor(private ability: AbilityPolicy) {}

  @Post()
  create(@Req() req: Request) {
    const ability = this.ability.build(req.user);
    if (!ability.can('create', 'Post')) {
      throw new HttpForbiddenException('Insufficient permissions');
    }
    // ...
  }
}
```

Social integrations (`ISocialMediaIntegration`) use provider-specific tokens (e.g., `BlueskyProvider`, `LinkedInPageProvider`) with scope validation (`NotEnoughScopesFilter`).

See [architecture.md](./architecture.md#services) for AuthService dependencies.

## Secrets & Sensitive Data

Secrets are never committed to version control. All sensitive data follows strict classification and handling:

- **Storage Locations**: Environment variables via `.env` files (loaded by `@nestjs/config`). Production uses platform parameter stores (e.g., AWS SSM, Vercel Env). No vaults like HashiCorp Vault currently; Stripe keys via `StripeService`, OpenAI via `OpenaiService`.
- **Data Classifications**:
  | Classification | Examples | Handling |
  |----------------|----------|----------|
  | High (PII/Credentials) | User emails, refresh tokens, API keys (OpenAI, Stripe, social) | Encrypted at rest (Prisma DB with provider-managed encryption), in transit (TLS 1.3). Legacy encryption: AES with IV (`libraries/nestjs-libraries/src/crypto`). |
  | Medium (Business Logic) | Post content, analytics data | Tokenized/hashed where possible; access-logged via Sentry. |
  | Low | Public metadata | No encryption required. |
- **Encryption Practices**: Tokens encrypted client-side in extension (`StoredRefreshEntry`). Backend uses `crypto` module for payments (`Nowpayments`) and legacy auth. Uploads to R2 are server-side encrypted.
- **Rotation Cadence**: Manual rotation recommended quarterly or on compromise. Automated for short-lived JWTs (15min access, 7d refresh). Social tokens refreshed via `RefreshIntegrationService`.
- **Access Controls**: Secrets scoped to services (e.g., `IntegrationManager` for social). Extension limits storage to necessary cookies (`CookieProvider` interface).

Developers: Use `dotenv` locally; rotate via env var updates and DB migrations for user tokens.

## Compliance & Policies

- **GDPR**: User consent for data processing (posts, analytics). Right to erasure via user deletion flows. Data residency in US/EU via Cloudflare R2.
- **SOC2 (Target)**: Controls for availability (Temporal workflows), confidentiality (encryption), and privacy. Audits planned.
- **Platform Policies**: Compliance with social provider ToS (e.g., LinkedIn analytics scopes in `linkedin.page.provider.ts`).
- **Internal Policies**: Weekly security scans, no third-party deps without review. Evidence: Sentry dashboards, audit logs in Prisma (`notifications`, `webhooks` tables).

## Related Resources

- [architecture.md](./architecture.md)
