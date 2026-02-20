## Testing Strategy

Quality in the robo-multipost codebase is maintained through a layered testing approach combining unit, integration, and end-to-end (E2E) tests, enforced by CI/CD pipelines. We prioritize high code coverage (targeting 80%+ for statements and 70%+ for branches), automated linting with ESLint, and code formatting with Prettier. Tests are written using Jest as the primary framework across NestJS backend services, React/Next.js frontend components, CLI tools, and browser extensions. Integration tests leverage Supertest for API endpoints and Prisma for database mocking. All pull requests trigger quality gates via Turborepo and GitHub Actions, blocking merges on failures. This ensures reliability in core areas like social integrations, agent workflows, video uploads, and authentication flows. See [development-workflow.md](./development-workflow.md) for local setup and CI details.

## Test Types

- **Unit**: Jest for isolated testing of services, utils, controllers, and components. Files named `*.spec.ts` (NestJS/backend), `*.test.ts` (CLI/utils), and `*.test.tsx` (React components). Mock dependencies like Prisma, Redis, and OpenAI using Jest mocks or libraries like `@nestjs/testing`.
- **Integration**: Jest with `@nestjs/testing` module for API controllers and services interacting with databases (Prisma) or external providers (e.g., Stripe, social integrations). Files named `*.e2e-spec.ts`. Use Supertest for HTTP requests and TestContainers for isolated DB/Redis setups.
- **E2E**: Playwright for browser-based flows in the frontend app and extension (e.g., auth flows, post creation). Files in `e2e/` directories per app (e.g., `apps/frontend/e2e/`). Harnesses include custom fixtures for authenticated sessions and mock Temporal workflows.

## Running Tests

- All tests: `turbo run test` (runs across all apps/libraries via Turborepo).
- Watch mode: `turbo run test -- --watch` (interactive mode with `--watchAll` for full suite).
- Coverage: `turbo run test -- --coverage` (generates HTML reports in `coverage/`; thresholds enforced via `jest.config.ts`).
- Specific app: `cd apps/backend && npm run test` (or `pnpm test` for monorepo consistency).
- Update snapshots: `turbo run test -- --update-snapshot`.

Example for backend integration test:
```bash
npm run test:watch -- apps/backend/src/api/routes/*.e2e-spec.ts
```

## Quality Gates

- **Coverage**: Minimum 80% statements, 70% branches, 80% functions, 80% lines (enforced in `jest.config.ts` and CI via `--coverageThreshold`).
- **Linting**: ESLint must pass (`turbo run lint`); includes TypeScript strict mode and custom rules for NestJS decorators and Prisma queries.
- **Formatting**: Prettier auto-format on pre-commit (husky hook); `turbo run format:check` fails on diffs.
- **TypeScript**: `tsc --noEmit` in CI; no errors allowed.
- **Security/Perf**: Snyk scans and Lighthouse CI scores >90 for frontend PRs.
- Merges blocked unless all pass; view reports in GitHub Actions.

## Troubleshooting

- **Flaky Temporal workflows** (e.g., `apps/orchestrator`): Use `temporal test` CLI or mock Temporal client; increase timeouts in `jest.config.ts`.
- **Redis/Prisma mocks failing**: Ensure `MockRedis` and Prisma accelerators are reset per test (`afterEach(() => redis.flushAll())`).
- **Extension E2E timeouts**: Run with `--headed` in Playwright; Chrome flags for CORS in `playwright.config.ts`.
- **Long-running video upload tests**: Skip in CI with `test.skip` env var; use `jest --runInBand`.
- Clear Jest cache: `turbo run test -- --clearCache`. For Docker env quirks, use `pnpm turbo run test -- --forceExit`.
