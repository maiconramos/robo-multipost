# Feature Developer Playbook

## Overview

The **Feature Developer Agent** implements new features based on specifications, following the codebase's architecture. Focus on modular, scalable additions that integrate with existing services, repositories, controllers, and UI components. Prioritize backend API extensions for data handling and frontend components for user interactions.

Key principles:
- Extend existing patterns: Service Layer for business logic, Repository for data access, Factory for object creation, Controller for routing.
- Use Prisma for database operations.
- Maintain separation: Backend in `apps/backend` and `libraries/nestjs-libraries`, Frontend in `apps/frontend`.
- Always add DTOs for inputs, handle auth/permissions, and support i18n.

## Codebase Structure

```
apps/
├── backend/          # NestJS API server
│   ├── src/api/routes/     # Controllers (*.controller.ts)
│   ├── src/services/       # App-specific services
│   └── src/public-api/     # Public endpoints
├── frontend/         # Next.js app
│   ├── src/app/(app)/      # Pages and layouts
│   └── src/components/     # UI components (e.g., new-launch/providers/*)
└── cli/              # CLI tool (PostizAPI, PostizConfig)

libraries/
├── nestjs-libraries/       # Shared backend libs
│   ├── src/database/prisma/ # Repos (e.g., users.repository.ts)
│   ├── src/services/        # Core services (e.g., stripe.service.ts)
│   ├── src/openai/          # AI services
│   └── src/integrations/    # Platform integrations
├── react-shared-libraries/  # Frontend shared (e.g., translation)
└── helpers/                 # Utilities (e.g., auth.service.ts)
```

- **Database**: Prisma (`libraries/nestjs-libraries/src/database/prisma/prisma.service.ts`).
- **Auth**: JWT-based with `AuthService`, `PublicAuthMiddleware`, `AuthMiddleware`.
- **Integrations**: 30+ social platforms (e.g., `new-launch/providers/twitter`, backend repos).
- **Testing**: Minimal; add unit tests in `__tests__` dirs matching services/components.
- **Configs**: `tsconfig.json`, `prisma/schema.prisma`, NestJS modules.

## Key Files and Purposes

| File/Path | Purpose |
|-----------|---------|
| `libraries/nestjs-libraries/src/database/prisma/prisma.service.ts` | Core DB client (`PrismaService`, `PrismaRepository`, `PrismaTransaction`). Inject for all DB ops. |
| `libraries/helpers/src/auth/auth.service.ts` | Auth logic (`AuthService`, encrypt/decrypt legacy). Use for user sessions/permissions. |
| `apps/backend/src/services/auth/auth.service.ts` | App-specific auth, guards (`AuthMiddleware`). |
| `libraries/nestjs-libraries/src/services/stripe.service.ts` | Payments (`StripeService`). Extend for billing features. |
| `apps/backend/src/api/routes/*.controller.ts` (e.g., `users.controller.ts`) | API endpoints. Add `@Controller('users')`, `@Post()`, DTOs. |
| `libraries/nestjs-libraries/src/track/track.service.ts` | Analytics (`TrackService`). Log events in new features. |
| `libraries/nestjs-libraries/src/openai/openai.service.ts` | AI generation (`OpenaiService`). Use for content/post creation. |
| `apps/frontend/src/components/new-launch/providers/*` | Platform-specific UI (e.g., `youtube.tsx`). Model new integrations here. |
| `apps/frontend/src/components/plugs/plugs.context.ts` | Plugs state (`PlugSettings`, `PlugsInterface`). Use for settings/features. |
| `libraries/react-shared-libraries/src/translation/*.ts` | i18n (`getT`, `useT`, `useTranslationSettings`). Required for all UI strings. |
| `libraries/nestjs-libraries/src/services/exception.filter.ts` | Errors (`HttpForbiddenException`, `HttpExceptionFilter`). Throw for auth/validation. |

## Focus Areas by Feature Type

- **Backend API**: `apps/backend/src/api/routes/`, `libraries/nestjs-libraries/src/database/prisma/*/*.repository.ts`.
- **Frontend UI**: `apps/frontend/src/components/new-launch/`, `apps/frontend/src/app/(app)/(site)/*`.
- **Integrations**: Backend repos (`third-party.repository.ts`), frontend providers (`providers/[platform]`).
- **Shared Logic**: Services in `libraries/nestjs-libraries/src/*/*.service.ts`.
- **Configs/DB**: `prisma/schema.prisma`, add models/repos.

## Development Workflows

### 1. New API Endpoint (e.g., `/api/posts/create`)
1. Create/update controller: `@Controller('posts') class PostsController { @Post() async create(@Body() dto: CreatePostDto, @Req() req) { ... } }`.
2. Define DTO: `libraries/nestjs-libraries/src/dtos/posts/create.post.dto.ts` (class-validator).
3. Inject services/repos: `@Inject(PrismaService) private prisma: PrismaService, @Inject(UsersRepository) private usersRepo: UsersRepository`.
4. Business logic in service: e.g., `PostService.create(postData, userId)`.
5. Add auth: `@UseGuards(AuthGuard)` or `PublicAuthMiddleware`.
6. Track: `this.trackService.track('post_created', { userId })`.
7. Error handling: `throw new HttpForbiddenException('Invalid perms')`.
8. Update module: `ApiModule` or route-specific.

### 2. New Frontend Feature (e.g., Post Composer UI)
1. Create component: `apps/frontend/src/components/post-composer.tsx` (use shadcn/ui from `components/ui`).
2. State management: Zustand store (`new-launch/store.ts` pattern) or Context (`plugs.context.ts`).
3. i18n: `const t = useT(); <Button>{t('post.submit')}</Button>`.
4. API integration: `useSWR` or `fetch` to new endpoint, auth headers.
5. Provider-specific: Duplicate `providers/[platform]/index.tsx` for new platforms.
6. Routing: Add to `app/(app)/(site)/posts/page.tsx` or modal.
7. Responsive: Tailwind classes matching existing (e.g., `new-layout`).

### 3. New Integration (e.g., New Social Platform)
1. Backend:
   - Add Prisma model: `schema.prisma` → `ThirdPartyIntegration`.
   - Repo: `libraries/nestjs-libraries/src/database/prisma/third-party/[platform].repository.ts`.
   - Service: `integrations/[platform].service.ts` (use `RefreshIntegrationService`).
   - Controller: `@Post('integrations/[platform]')`.
2. Frontend:
   - Provider: `components/new-launch/providers/[platform]/index.tsx`.
   - Fields: Extend `FieldsInterface` in `plugs.context.ts`.
3. Factory: Use `ProvidersFactory` for dynamic loading.
4. Test: Manual OAuth flow, refresh tokens.

### 4. Database Changes
1. Update `prisma/schema.prisma`.
2. `npx prisma generate && db push`.
3. Add repo: Extend `PrismaRepository`.
4. Migrate services/controllers.

### 5. Full Feature Rollout
1. **Plan**: Spec → Backend first (API), then Frontend, DB last.
2. **Implement**: Branch `feature/[name]`.
3. **Test**: Manual (Postman for API, browser for UI). Add `__tests__/*.spec.ts`.
4. **Review**: Self-check patterns, auth, i18n.
5. **Deploy**: Update `apps/backend/src/api/api.module.ts`, frontend builds.

## Best Practices and Conventions

- **Naming**: Kebab-case files, PascalCase classes/exports (e.g., `ShortLinkService`).
- **Dependency Injection**: `@Injectable({ providedIn: 'root' })` or NestJS modules.
- **Async/Await**: All DB/API calls.
- **Validation**: `class-validator` DTOs, `getValidationSchemas`.
- **Auth/Perms**: Always check `req.user.id`, use `apps/backend/src/services/auth/permissions`.
- **Logging/Tracking**: Inject `TrackService` for events.
- **Errors**: Custom exceptions from `exception.filter.ts`.
- **i18n**: Mandatory for UI; backend uses `getT`.
- **Factories/Repos**: 
  ```ts
  // Repo example
  @Injectable()
  export class PostsRepository extends PrismaRepository<Post> { ... }
  ```
- **Frontend Hooks/Stores**:
  ```tsx
  const usePostComposer = () => {
    const { plugs } = usePlugs();
    return useQuery(['posts'], () => api.posts.list());
  };
  ```
- **No Globals**: Inject everything.
- **Migrations**: Use Prisma transactions for multi-model ops.
- **Security**: Sanitize inputs, rate-limit controllers.

## Code Templates

### Backend Service
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';

@Injectable()
export class NewFeatureService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateDto) {
    return this.prisma.$transaction(async (tx) => {
      // Logic
    });
  }
}
```

### Controller Method
```ts
@Post()
@UseGuards(AuthGuard)
async create(@Body() dto: CreatePostDto, @Req() req: AuthReq) {
  return this.postService.create(dto, req.user.id);
}
```

### Frontend Provider Component
```tsx
import { useT } from '@/libraries/react-shared-libraries/src/translation';

export function NewPlatformProvider() {
  const t = useT();
  return (
    <div className="p-4">
      <h3>{t('providers.newplatform.title')}</h3>
      {/* OAuth form */}
    </div>
  );
}
```

## Common Pitfalls
- Forget auth → 401 errors.
- No i18n → Hardcoded strings.
- Direct Prisma queries → Use repos.
- No tracking → Lost analytics.

Follow this playbook to deliver production-ready features. Reference other agents (e.g., Test Writer) for validation.
