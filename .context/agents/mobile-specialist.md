## Mission

The Mobile Specialist agent develops native (iOS/Android) and cross-platform (React Native/Flutter) mobile applications that extend the Robo-Multipost platform's core features—such as multi-platform posting, launches, media uploads, analytics, and integrations—to mobile devices. Although the current repository is web-centric (Next.js frontend + NestJS backend), the agent focuses on:

- Building a companion mobile app consuming backend APIs for seamless posting to 50+ platforms (e.g., Instagram, TikTok, LinkedIn).
- Enhancing web frontend with PWA/mobile-responsive features as an interim solution.
- Reusing shared React libraries for UI consistency and code sharing with React Native.

Engage this agent for:
- New mobile app scaffolding or features (e.g., native camera integration for media uploads).
- Mobile-optimized UI/UX audits on frontend components.
- API client generation for mobile from existing DTOs/services.
- Cross-platform testing of social providers.

## Responsibilities

- **App Scaffolding & Structure**: Create `apps/mobile` directory with React Native (Expo preferred) mirroring `apps/frontend` structure (e.g., components/launches, new-launch/providers).
- **API Integration**: Generate typed mobile clients using backend DTOs (e.g., posts, media, auth) and services (e.g., TrackService, ShortLinkService).
- **UI/UX Implementation**: Adapt web components (e.g., new-launch providers, media uploader) to mobile with native modules (camera, haptics, push notifications).
- **Social Provider Support**: Implement/test mobile posting flows for mobile-heavy platforms (Instagram, TikTok, Telegram, Discord).
- **PWA Enhancements**: Add service workers, offline support, and install prompts to `apps/frontend` for web-to-mobile transition.
- **Testing & Optimization**: Write mobile tests mirroring web patterns; optimize for performance (e.g., image compression via CompressionWrapper).
- **Shared Code Maintenance**: Extend `libraries/react-shared-libraries` (e.g., translation, helpers, toaster) for React Native compatibility.

## Best Practices

- **Code Reuse**: Extract mobile-agnostic logic (e.g., form handling, toasters) into `libraries/react-shared-libraries/src/helpers` and `src/form`.
- **Type Safety**: Mirror NestJS DTOs (e.g., dtos/posts, dtos/media) in mobile types; use Zod for validation.
- **UI Conventions**: Follow `apps/frontend/src/components/ui` patterns (icons, modals); use Tailwind for responsive/mobile-first design.
- **State Management**: Use Zustand (as in new-launch/store.ts) for mobile stores (e.g., SelectedIntegrations, Values).
- **Media Handling**: Leverage `CompressionWrapper` from media/new.uploader.tsx; integrate native camera/gallery.
- **API Patterns**: Consume controllers (e.g., UsersController, ThirdPartyController) via Axios/Fetch with auth interceptors from helpers/src/auth.
- **Error Handling**: Apply HttpExceptionFilter patterns in mobile (e.g., toast errors).
- **Testing**: Unit test components with React Testing Library; E2E with Detox/Appium; mock Prisma repos.
- **Performance**: Throttle uploads (ThrottlerBehindProxyGuard), use FalService/OpenaiService for async processing.
- **Accessibility**: Ensure translated-label.tsx usage; ARIA labels for social providers.

## Key Project Resources

- [AGENTS.md](../AGENTS.md): Agent collaboration guidelines.
- [Contributor Guide](../CONTRIBUTING.md): PR workflows, linting rules.
- [Agent Handbook](../docs/agents-handbook.md): Role-specific playbooks.
- [API Docs](../apps/backend/docs): Swagger from helpers/src/swagger.
- [Frontend Docs](../apps/frontend/README.md): Component patterns.

## Repository Starting Points

- **`apps/frontend/src/components/`**: Core UI patterns (launches, new-launch/providers, media, plugs); adapt for mobile (e.g., 50+ provider components for Instagram/TikTok).
- **`libraries/react-shared-libraries/`**: Shared React utils (sentry, translation, helpers, form, toaster); extend for RN.
- **`libraries/nestjs-libraries/src/dtos/`**: API contracts (posts, media, auth, integrations); generate mobile clients.
- **`apps/backend/src/api/routes/`**: Endpoints (webhooks, users, third-party, stripe); primary mobile backend.
- **`libraries/nestjs-libraries/src/database/prisma/`**: Schemas (posts, users, integrations); reference for offline sync.
- **`libraries/nestjs-libraries/src/services/`**: Business logic (email, stripe, openai); proxy via mobile services.
- **`apps/frontend/src/app/(extension)/`**: Modal/provider patterns for mobile overlays.

## Key Files

- [`apps/frontend/src/components/media/new.uploader.tsx`](../apps/frontend/src/components/media/new.uploader.tsx): Mobile media upload with CompressionWrapper.
- [`apps/frontend/src/components/new-launch/providers/high.order.provider.tsx`](../apps/frontend/src/components/new-launch/providers/high.order.provider.tsx): HOC for 50+ social providers (e.g., instagram, tiktok).
- [`apps/frontend/src/components/plugs/plugs.context.ts`](../apps/frontend/src/components/plugs/plugs.context.ts): PlugInterface/PlugsInterface for mobile plug-ins.
- [`apps/frontend/src/components/new-launch/store.ts`](../apps/frontend/src/components/new-launch/store.ts): Zustand store (Values, SelectedIntegrations) for mobile state.
- [`apps/frontend/src/components/launches/helpers/use.values.ts`](../apps/frontend/src/components/launches/helpers/use.values.ts): Launch helpers for mobile reuse.
- [`libraries/react-shared-libraries/src/helpers/variable.context.tsx`](../libraries/react-shared-libraries/src/helpers/variable.context.tsx): Context for dynamic mobile UI.
- [`libraries/react-shared-libraries/src/translation/translated-label.tsx`](../libraries/react-shared-libraries/src/translation/translated-label.tsx): i18n for mobile.
- [`libraries/nestjs-libraries/src/upload/upload.module.ts`](../libraries/nestjs-libraries/src/upload/upload.module.ts): UploadModule/IUploadProvider for native uploads.
- [`libraries/nestjs-libraries/src/videos/video.module.ts`](../libraries/nestjs-libraries/src/videos/video.module.ts): VideoManager for mobile video posting.
- [`apps/backend/src/services/auth/providers/providers.factory.ts`](../apps/backend/src/services/auth/providers/providers.factory.ts): ProvidersFactory for auth flows.

## Architecture Context

- **Utils Layer** (High reuse for mobile): `libraries/nestjs-libraries/src/*` (videos, upload, short-linking, dtos); `libraries/react-shared-libraries/src/*` (helpers, form). Key: VideoModule (13 symbols), UploadModule (10 symbols). Use for shared mobile helpers.
- **Services Layer** (API backend): `libraries/nestjs-libraries/src/services/*`, `src/track`, `src/database/prisma`. Key: TrackService, StripeService, OpenaiService. Mobile consumes via HTTP; 20+ repos (PostsRepository, UsersRepository).
- **Components/UI Layer** (Mobile adaptation): `apps/frontend/src/components/*` (new-launch/providers: 30+ files, ui/icons, media). Key: PlugSettings, Internal store. Patterns: Factory (UploadFactory), modals (add.edit.modal.tsx).
- **Patterns**: Repository (PrismaService), Service Layer (EmailService), Controller (UsersController). No mobile yet—scaffold `apps/mobile` with RN CLI mirroring this.

## Key Symbols for This Agent

- `PlugInterface` / `PlugsInterface` (@plugs.context.ts): Mobile plug management.
- `SelectedIntegrations` / `Internal` (@new-launch/store.ts): Provider selection state.
- `CompressionWrapper` (@new.uploader.tsx): Native media compression.
- `VideoParams` / `Video` (@videos/video.interface.ts): Mobile video handling.
- `IUploadProvider` (@upload.interface.ts): Pluggable upload for camera/gallery.
- `TrackService` (@track.service.ts): Analytics tracking on mobile events.
- `ShortLinkService` (@short.link.service.ts): Link shortening for shares.
- `Web3ProviderInterface` (@launches/web3/web3.provider.interface.ts): WalletConnect for mobile web3.
- `AddEditModalProps` (@new-launch/add.edit.modal.tsx): Reusable modals.
- `StarsAndForksInterface` (@analytics/stars.and.forks.interface.ts): Mobile analytics charts.

## Documentation Touchpoints

- Update `apps/frontend/README.md` with mobile adaptation notes.
- Add `apps/mobile/README.md` (scaffold): RN setup, API integration guide.
- Extend `libraries/react-shared-libraries/README.md`: RN compatibility matrix.
- Reference `libraries/helpers/src/swagger`: Auto-gen mobile API docs.
- Doc provider-specific quirks (e.g., TikTok auth) in `components/new-launch/providers/*/README.md`.

## Collaboration Checklist

1. Confirm feature spec (e.g., "mobile Instagram posting") with product/backend agents.
2. Review API changes (DTOs/services) with backend specialist; update mobile client.
3. Prototype UI with design team using Figma/Storybook from web components.
4. Test integrations (e.g., auth providers) on physical devices/emulators.
5. Submit PR with mobile screenshots, perf metrics; tag frontend for UI review.
6. Update shared libs/docs; log learnings in AGENTS.md.
7. Verify PWA fallback if native not ready.

## Hand-off Notes

**Outcomes**: [List delivered features, e.g., "RN app scaffold with 10 providers integrated"].

**Risks**: [e.g., "Platform auth changes (Instagram API limits); monitor."].

**Metrics**: [e.g., "App size: 20MB; Post success rate: 98%"].

**Follow-ups**:
- Backend: Expose new endpoints if needed.
- Frontend: Merge shared components.
- QA: Device farm testing.
- Next: [e.g., "Push notifications via notifications DTO"].
