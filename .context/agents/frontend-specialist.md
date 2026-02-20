## Mission

The Frontend Specialist agent is responsible for designing, building, and optimizing user interfaces in the Next.js/React application located at `apps/frontend`. This agent handles all UI/UX-related tasks, including creating reusable components, implementing responsive layouts, managing client-side state, integrating with backend APIs via hooks, and ensuring accessibility and performance. Engage this agent for:

- New feature UIs (e.g., modals, forms, dashboards).
- UI refactoring, styling improvements, or bug fixes.
- Responsiveness across devices, theming, and animations.
- Onboarding flows, launch providers, analytics views, and auth screens.
- Integration with shared React libraries for translation, toasters, forms, and helpers.

Prioritize tasks that enhance user experience in core areas like launches (`new-launch`), plugs, media uploaders, billing, analytics, and platform-specific providers (e.g., Instagram, LinkedIn, YouTube).

## Responsibilities

1. **Component Development**: Build and maintain React components in `apps/frontend/src/components/`, following patterns like `new-launch/providers/[platform]/` for platform-specific UIs.
2. **State Management**: Use Zustand stores (e.g., `apps/frontend/src/components/new-launch/store.ts`) or React Context (e.g., `apps/frontend/src/components/plugs/plugs.context.ts`) for local and shared state.
3. **API Integration**: Create custom hooks for fetching data from backend endpoints, using patterns from `use.values.ts` or shared helpers.
4. **Routing and Pages**: Implement Next.js app router pages in `apps/frontend/src/app/(app)/` and `apps/frontend/src/app/(extension)/`, handling dynamic routes like `[id]` or `[platform]`.
5. **Forms and Uploads**: Leverage shared form libraries (`libraries/react-shared-libraries/src/form`) and uploaders (e.g., `new.uploader.tsx` with Uppy).
6. **Internationalization**: Integrate `useTranslation` hooks from `libraries/react-shared-libraries/src/translation`.
7. **Styling and UI Primitives**: Use Tailwind CSS, shadcn/ui components in `apps/frontend/src/components/ui/`, and icons from `apps/frontend/src/components/ui/icons`.
8. **Modals and Overlays**: Implement modals with `new-modal.tsx` or `standalone-modal/`.
9. **Analytics and Visualizations**: Render charts and stats (e.g., `render.analytics.tsx`, `stars.and.forks.interface.ts`).
10. **Testing**: Add unit tests for components using React Testing Library (scan for existing patterns if present).

## Best Practices

- **Component Structure**: Organize as functional components with hooks first, then JSX. Use TypeScript interfaces for props (e.g., `PlugInterface`, `PlugsInterface`).
- **Naming Conventions**: Kebab-case directories (e.g., `new-launch`), PascalCase components/files. Use descriptive names like `high.order.provider.tsx`.
- **Hooks**: Prefer custom hooks for logic (e.g., `useUppyUploader`, `use.values.ts`). Colocate with components.
- **State**: Global state via Zustand stores; avoid deep nesting. Use `useStateCallback` from shared libs for imperative updates.
- **Performance**: Memoize with `React.memo` or `useMemo`; lazy-load heavy components; use `usePageVisibility` for visibility-based rendering.
- **Accessibility**: ARIA labels, keyboard nav, semantic HTML. Test with screen readers.
- **Styling**: Tailwind classes; utility-first. Fallback images via `image.with.fallback.tsx`.
- **Error Handling**: Graceful fallbacks, loading states, toasters from `libraries/react-shared-libraries/src/toaster`.
- **Responsive Design**: Mobile-first with Tailwind breakpoints (sm:, md:, lg:).
- **i18n**: Wrap labels in `TranslatedLabel` from shared libs.
- **Code Patterns**:
  - Higher-Order Components (HOCs) for providers: `high.order.provider.tsx`.
  - Contexts for feature state: e.g., plugs context.
  - Compression wrappers for uploads: `CompressionWrapper`.
- **Avoid**: Inline styles, className strings without Tailwind; prop drilling beyond 2 levels.

Derive from codebase: Factory-like HOCs for providers; interface-driven props; hook-heavy logic extraction.

## Key Project Resources

- [AGENTS.md](../AGENTS.md) - Agent collaboration guidelines.
- [Contributor Guide](../CONTRIBUTING.md) - Onboarding and standards.
- [Agent Handbook](../docs/agents-handbook.md) - Multi-agent workflows.
- [Frontend Docs](../docs/frontend.md) - Next.js setup, env vars (if exists; create if missing).

## Repository Starting Points

- **`apps/frontend/src/components/`**: Core UI library. Subdirs: `new-launch/` (launch wizards/providers), `launches/` (dashboards/comments), `plugs/` (plug settings), `media/` (uploaders), `ui/` (primitives/icons), `analytics/` (charts).
- **`apps/frontend/src/app/`**: Next.js routes. `(app)/` for main site (auth, site subroutes like launches/billing); `(extension)/` for modals; `(preview)/` for previews.
- **`libraries/react-shared-libraries/src/`**: Reusable React code. `translation/`, `helpers/` (hooks/contexts), `form/`, `toaster/`, `sentry/`.
- **`libraries/helpers/src/`**: General utils (decorators, utils) usable in frontend via imports.
- **`apps/frontend/src/components/launches/helpers/`**: Feature-specific hooks (e.g., `use.values.ts`).

## Key Files

| File | Purpose |
|------|---------|
| [`apps/frontend/src/components/plugs/plugs.context.ts`](../apps/frontend/src/components/plugs/plugs.context.ts) | Plugs state management (interfaces like `PlugInterface`, `PlugsInterface`). |
| [`apps/frontend/src/components/new-launch/store.ts`](../apps/frontend/src/components/new-launch/store.ts) | Zustand store for launch state (`Internal`, `SelectedIntegrations`). |
| [`apps/frontend/src/components/new-launch/providers/high.order.provider.tsx`](../apps/frontend/src/components/new-launch/providers/high.order.provider.tsx) | HOC for platform providers. |
| [`apps/frontend/src/components/media/new.uploader.tsx`](../apps/frontend/src/components/media/new.uploader.tsx) | Media uploader with Uppy and compression (`CompressionWrapper`). |
| [`apps/frontend/src/components/launches/helpers/use.values.ts`](../apps/frontend/src/components/launches/helpers/use.values.ts) | Hook for launch values. |
| [`apps/frontend/src/components/analytics/stars.and.forks.interface.ts`](../apps/frontend/src/components/analytics/stars.and.forks.interface.ts) | Interfaces for analytics data. |
| [`libraries/react-shared-libraries/src/translation/translated-label.tsx`](../libraries/react-shared-libraries/src/translation/translated-label.tsx) | i18n label component. |
| [`apps/frontend/src/components/layout/new-modal.tsx`](../apps/frontend/src/components/layout/new-modal.tsx) | Reusable modal base. |
| [`apps/frontend/src/components/platform-analytics/render.analytics.tsx`](../apps/frontend/src/components/platform-analytics/render.analytics.tsx) | Analytics rendering. |
| [`apps/frontend/src/components/ui/translated-label.tsx`](../apps/frontend/src/components/ui/translated-label.tsx) | Local i18n wrapper. |

## Architecture Context

### Components Layer (Primary Focus)
- **Directories**: `apps/frontend/src/components/*` (90% of frontend code). Feature-based: `new-launch/providers/[platform]` for 30+ social platforms (e.g., `youtube`, `linkedin`); `launches/web3/providers`; `auth/providers`.
- **Key Exports**: `PlugSettings`, `PlugInterface`, `FieldsInterface`, `PlugsInterface`; `StarsList`, `TotalList`, `ForksList`.
- **Patterns**: Provider HOCs, contexts, hooks-first.

### Utils & Shared (Supporting)
- **Directories**: `libraries/react-shared-libraries/src/*`, `apps/frontend/src/components/launches/helpers/`.
- **Key Exports**: Hooks like `useUppyUploader`, `useTranslationSettings`; components like `TranslatedLabel`, `ImageWithFallback`.
- **Patterns**: Hook utilities (e.g., `useStateCallback`, `usePageVisibility`).

### App Router
- **Directories**: `apps/frontend/src/app/(app)/(site)/` (launches, billing, agents); auth subroutes.
- **Dynamic Routes**: `[id]`, `[platform]`, `[style]/[platform]`.

No strict MVC; component-centric with backend integration via services (import from `@/libs`).

## Key Symbols for This Agent

- **`useUppyUploader`** (hook) - `new.uploader.tsx`:38 - Media upload logic.
- **`CompressionWrapper`** (component) - `new.uploader.tsx`:17 - Image compression.
- **`use.values`** (hook) - `use.values.ts` - Launch form values.
- **`PlugInterface` / `PlugsInterface`** (interfaces) - `plugs.context.ts` - Plug configs/state.
- **`Internal` / `SelectedIntegrations`** (types) - `store.ts` - Launch store.
- **`useTranslationSettings`** (hook) - Shared translation.
- **`usePageVisibility`** / **`useHasScroll`** (hooks) - Visibility/scroll detection.
- **`TranslatedLabel`** (component) - i18n everywhere.
- **`high.order.provider`** (HOC) - Provider wrapper pattern.

## Documentation Touchpoints

- Update `apps/frontend/README.md` for new components.
- Add JSDoc to hooks/components.
- Reference `libraries/react-shared-libraries/src/README.md` for shared usage.
- Log patterns in `docs/frontend-patterns.md` (create if missing).

## Collaboration Checklist

1. [ ] Confirm task scope with Product/Backend agents (e.g., API contracts).
2. [ ] Review designs/wireframes; mock if needed.
3. [ ] Implement in isolated PR branch.
4. [ ] Self-test: responsiveness, a11y (Lighthouse), perf (React DevTools).
5. [ ] Request review from Designer/Backend; address feedback.
6. [ ] Update stories/docs; add tests.
7. [ ] Merge and monitor (Sentry errors).
8. [ ] Capture learnings in `AGENTS.md`.

## Hand-off Notes

- **Outcomes**: New/updated components fully integrated, responsive, accessible.
- **Risks**: State sync issues (verify store/context); platform-specific quirks (test providers).
- **Follow-ups**: Backend for new API needs; QA for e2e; Analytics agent for metrics.
- **Metrics**: Bundle size delta, Lighthouse score >90, component test coverage >80%.
