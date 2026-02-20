
# Copilot Coding Agent Instructions for Robô MultiPost

This project is **Robô MultiPost**, a fork of [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0).
A self-hosted social media scheduler for the Automação Sem Limites community.
Read `AGENTS.md` for full project context before suggesting any code.

## Project Architecture
- Monorepo managed with PNPM workspaces (not NX), apps in `apps/` and shared code in `libraries/`.
- Main services: `frontend` (Next.js 14), `backend` (NestJS), `orchestrator` (Temporal.io), `commands`, `extension`, `sdk`, `cli`.
- Data layer uses Prisma ORM (`libraries/nestjs-libraries/src/database/prisma/schema.prisma`) with PostgreSQL 17.
- Redis 7 for cache and queues.
- Temporal.io for all background job orchestration (scheduling, retries, publishing workflows).
- Email notifications via Resend.
- AI via Mastra framework + MCP (already implemented — Phase 3 exposes configuration).
- Social media integrations: 33 providers.

## Critical Rules

### Package Manager
- **PNPM only.** Never suggest npm or yarn.

### Backend Layer Pattern (NestJS — apps/backend)
- Always follow: `Controller → Service → Repository`
- With manager when needed: `Controller → Manager → Service → Repository`
- **Never skip layers.** Business logic lives in `libraries/nestjs-libraries/src/`
- Controllers import from libs only.

### Frontend (Next.js 14 — apps/frontend)
- Use `useFetch` hook from `libraries/helpers/src/utils/custom.fetch.tsx` for all API calls.
- Every SWR hook must be isolated in its own function — `react-hooks/rules-of-hooks`.
- **Never suggest installing React component libraries from npm** — write native components.
- Check `apps/frontend/src/app/colors.scss` and `global.scss` before styling.
- Never use `--color-custom*` CSS variables (deprecated).

### Git Branches
- `postiz` = upstream mirror only (Postiz official) — never commit customizations here
- `main` = all custom development
- `release` = production-ready, Docker is built from here + tag
- Never suggest `git push --force` or `git reset --hard`

### Code Quality
- No `eslint-disable` comments
- Document-First: suggest doc updates alongside code
- API-First: suggest endpoint contracts before implementation
- Keep `.env.example` updated with new env vars

## Developer Workflows
- Node.js: 20.17.0 (pinned via Volta)
- Install: `pnpm install`
- Dev: `pnpm dev` (all apps) or `pnpm dev-backend`
- Build: `pnpm build`
- Lint (from root only): `pnpm lint`
- Prisma: `pnpm prisma-generate`, `pnpm prisma-db-push`
- Docker dev: `docker compose -f ./docker-compose.dev.yaml up -d`

## Key Files & Directories
- `AGENTS.md` — Full agent context (read this first)
- `PRD.md` — Product requirements
- `apps/` — Main services and applications
- `libraries/` — Shared code and modules
- `docker-compose.yaml` — Production Docker setup (5 services)
- `docker-compose.dev.yaml` — Local development Docker setup
- `.env` — Environment configuration
- `pnpm-workspace.yaml` — Workspace package management
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma` — DB schema (45 models)
- `libraries/react-shared-libraries/src/translation/locales/` — i18n (17 languages)

## Documentation
- Upstream docs: https://docs.postiz.com/
- Late API: https://docs.getlate.dev/llms-full.txt

---

# Logs

- Where logs are used, ensure Sentry is imported using `import * as Sentry from "@sentry/nextjs"`
- Enable logging in Sentry using `Sentry.init({ enableLogs: true })`
- Reference the logger using `const { logger } = Sentry`
- Sentry offers a `consoleLoggingIntegration` that can be used to log specific console error types automatically without instrumenting the individual logger calls

## Configuration

The Sentry initialization needs to be updated to enable the logs feature.

### Baseline

```javascript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enableLogs: true,
});
```

### Logger Integration

```javascript
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations: [
    // send console.log, console.error, and console.warn calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "error", "warn"] }),
  ],
});
```

## Logger Examples

`logger.fmt` is a template literal function that should be used to bring variables into the structured logs.

```javascript
import * as Sentry from "@sentry/nextjs";

const { logger } = Sentry;

logger.trace("Starting database connection", { database: "users" });
logger.debug(logger.fmt`Cache miss for user: ${userId}`);
logger.info("Updated profile", { profileId: 345 });
logger.warn("Rate limit reached for endpoint", {
  endpoint: "/api/results/",
  isEnterprise: false,
});
logger.error("Failed to process payment", {
  orderId: "order_123",
  amount: 99.99,
});
logger.fatal("Database connection pool exhausted", {
  database: "users",
  activeConnections: 100,
});
```

---

For questions or unclear conventions, check the main README or ask for clarification in your PR description.

