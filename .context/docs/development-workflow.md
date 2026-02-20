# Development Workflow

This repository follows a streamlined, trunk-based development process optimized for a multi-app monorepo containing a Next.js frontend, NestJS backend, Chrome extension, CLI, SDK, orchestrator (Temporal workflows), and shared libraries. The focus is on rapid iteration, automated testing, and continuous deployment.

Daily workflow:
1. **Sync latest changes**: Always start from `main` with `git pull origin main` and rebase feature branches.
2. **Create a feature branch**: Use descriptive names like `feat/add-linkedin-analytics` or `fix/extension-cookie-refresh`.
3. **Make changes**: Edit code in relevant apps (e.g., `apps/frontend`, `apps/backend`) or libraries (e.g., `libraries/nestjs-libraries`). Run tests locally before committing.
4. **Commit atomically**: Use conventional commits (e.g., `feat(backend): add autopost controller`).
5. **Push and open PR**: Target `main`. CI will run linting, tests, and builds.
6. **Iterate on feedback**: Address review comments, rebase if needed.
7. **Merge**: Squash or rebase merge after approvals. Automated releases trigger on main merges.

Leverage AI agents for code generation/refactoring (see [AGENTS.md](../AGENTS.md) for collaboration tips). Cross-reference [testing-strategy.md](./testing-strategy.md) for running unit/integration/e2e tests and [tooling.md](./tooling.md) for editor setup.

# Branching & Releases

- **Model**: Trunk-based development. All work on short-lived feature/fix branches from `main`. No long-term `develop` or release branches.
- **Branch naming**:
  - `feat/<feature-name>`: New features.
  - `fix/<issue-key>`: Bug fixes.
  - `chore/<task>`: Refactors, docs, tooling.
  - `hotfix/<critical-issue>`: Urgent production fixes.
- **PR rules**: Linear history (rebase), single purpose, <500 lines/chunk.
- **Releases**:
  - Automated semantic versioning via CI (Changesets or semantic-release).
  - Cadence: Continuous on `main` merges; weekly minors, monthly majors.
  - Tagging: `v<major>.<minor>.<patch>` (e.g., `v2.1.0`), annotated with changelog.
  - Deployment: Vercel/Netlify for frontend/extension; Railway/Docker for backend/orchestrator.

# Local Development

This Turborepo uses `pnpm` workspaces and `turbo` for orchestration. All commands from root.

```
- Install dependencies: `pnpm install`
- Dev (all apps): `pnpm turbo dev`
  - Frontend: http://localhost:3000
  - Backend: http://localhost:3001
  - Extension: Load `apps/extension/dist` in chrome://extensions
  - Orchestrator/CLI: Runs workflows/tasks in parallel
- Lint: `pnpm turbo lint`
- Test: `pnpm turbo test --filter=...` (see [testing-strategy.md](./testing-strategy.md))
- Build: `pnpm turbo build`
- Typecheck: `pnpm turbo type-check`
- CLI test: `pnpm --filter=cli dev "postiz --help"`
- Extension pack: `pnpm --filter=extension build`
```

Database: Use Docker for Prisma/Postgres (`docker-compose up -d db`). Run `pnpm db:push` after schema changes. Env: Copy `.env.example` to `.env.local`.

For app-specific:
```
Frontend only: pnpm --filter=frontend dev
Backend only: pnpm --filter=backend dev
Temporal dev: pnpm --filter=orchestrator dev
```

See [tooling.md](./tooling.md) for VS Code setup, Husky pre-commit hooks, and Docker.

# Code Review Expectations

PRs require at least 1 approval from a core maintainer. Self-approvals disabled. Reviewers check:

- **Code quality**: Conventional commits, small changes, no console.logs.
- **Tests**: 100% coverage for new logic; reference [testing-strategy.md](./testing-strategy.md).
- **Types/Schema**: No TS errors; Prisma migrations if needed.
- **Security**: No secrets in code; validate inputs (e.g., CustomFileValidationPipe).
- **Docs**: Update READMEs/DTOs/Swagger.
- **Performance**: No regressions; check throttler/Sentry utils.
- **Architecture**: Follow patterns (Controllers → Services → Repos); no direct DB calls in controllers.

Use AI agents for initial reviews/diffs (tips in [AGENTS.md](../AGENTS.md)). Block merges on failing CI (lint, test, build). Re-review after pushes.

# Onboarding Tasks

New contributors:
1. **Setup**: Follow Local Development above; verify all dev servers start.
2. **Good first issues**: Labelled `good-first-issue` or `help-wanted` in GitHub issues (e.g., add provider docs, fix UI lint).
3. **Starter PRs**: Update a DTO (e.g., [AddCommentDto](../libraries/nestjs-libraries/src/dtos/comments/add.comment.dto.ts)), add test for utils.
4. **Runbooks**: [Postiz API playground](http://localhost:3001/api/docs), [Temporal UI](http://localhost:7233).
5. **Dashboards**: Sentry for errors, Stripe for billing sim.

Join Discord/Slack for questions. Claim issues via `/assign` comment.

## Related Resources

- [testing-strategy.md](./testing-strategy.md)
- [tooling.md](./tooling.md)
