## Project Overview

Hey there! Robo-Multipost is your all-in-one automation powerhouse for content creators, marketers, and agencies who juggle posting across dozens of social platforms like Instagram, LinkedIn, TikTok, and beyond. It tackles the chaos of manual multi-posting by offering seamless integrations, AI-powered agents for smart scheduling, video generation, and analytics—all orchestrated with reliable workflows. Whether you're a solo creator scaling launches or a team managing client campaigns, it saves hours, boosts reach, and keeps everything in sync.

## Codebase Reference

> **Detailed Analysis**: For complete symbol counts, architecture layers, and dependency graphs, see [`codebase-map.json`](./codebase-map.json).

## Quick Facts

- Root: `/Users/maiconramos/Documents/workspace/robo-multipost`
- Languages: TypeScript (majority), JavaScript
- Total Files: 643
- Total Symbols: 541
- Entry: `apps/sdk/src/index.ts`
- Full analysis: [`codebase-map.json`](./codebase-map.json)

## Entry Points

- [`apps/sdk/src/index.ts`](../apps/sdk/src/index.ts) — Core SDK bootstrap (`Postiz` class).
- [`apps/backend/src/main.ts`](../apps/backend/src/main.ts) — NestJS backend server startup.
- [`apps/orchestrator/src/main.ts`](../apps/orchestrator/src/main.ts) — Temporal workflow orchestrator.
- [`apps/cli/src/index.ts`](../apps/cli/src/index.ts) — CLI tool entry (`PostizAPI`).
- [`apps/commands/src/main.ts`](../apps/commands/src/main.ts) — Command-line task runner.
- [`apps/frontend/src/app/layout.tsx`](../apps/frontend/src/app/layout.tsx) — Next.js app root layout.
- [`apps/extension/src/background.ts`](../apps/extension/src/background.ts) — Browser extension background script.

## Key Exports

- `Postiz` (class) @ apps/sdk/src/index.ts:15
- `PostizAPI` (class) @ apps/cli/src/api.ts:8
- `AppModule` (class) @ apps/backend/src/app.module.ts:61
- `AgentGraphService` (class) @ libraries/nestjs-libraries/src/agent/agent.graph.service.ts:105
- `autoPostWorkflow` (function) @ apps/orchestrator/src/workflows/autopost.workflow.ts:14

> See [`codebase-map.json`](./codebase-map.json) for the complete list.

## File Structure & Code Organization

- `apps/` — Monorepo applications: `backend` (NestJS API), `frontend` (Next.js UI), `cli` (command-line tool), `sdk` (TypeScript SDK), `orchestrator` (Temporal workflows), `commands` (task runners), `extension` (browser extension).
- `libraries/` — Shared libraries: `nestjs-libraries` (backend modules like integrations, database, agents), `react-shared-libraries` (React hooks/utils), `helpers` (decorators, auth, utils).
- `docs/` — Documentation including this overview, architecture, and workflows.
- `dynamicconfig/` — Runtime configuration management.
- Root configs — `pnpm-workspace.yaml`, `docker-compose.yaml`, `eslint.config.mjs` for tooling and deployment.

## Technology Stack Summary

This project runs on Node.js with TypeScript as the primary language, JavaScript for extensions/scripts. Backend leverages NestJS for APIs/controllers, Prisma for database ORM (Postgres implied), Temporal for durable workflows, and Redis/OpenAI for caching/AI. Frontend uses Next.js 14+ with React components (shadcn/ui inferred), Tailwind for styling. Build tooling includes PNPM workspaces, Docker Compose for dev/prod, ESLint/Prettier for linting/formatting, and Vite for extension bundling.

## Core Framework Stack

- **Backend**: NestJS (controllers, services, modules) with modular architecture (controllers → services → utils).
- **Frontend**: Next.js App Router with React Server Components, focused on dashboard/features like launches, analytics.
- **Workflows/Orchestration**: Temporal for reliable execution (e.g., `autoPostWorkflow`, `streakWorkflow`).
- **Data**: Prisma repositories/services for models (users, posts, integrations).
- **Patterns**: Dependency injection, CQRS-lite via services/repos, event-driven with signals/activities.

## UI & Interaction Libraries

React-based UI in `apps/frontend/src/components/` uses shadcn/ui primitives (inferred from structure), custom icons, modals, and forms. CLI interactions via `apps/cli` with commander.js-like setup. Supports theming (dark/light), i18n via translation hooks (`useT`), and accessibility (ARIA labels in components). Platform-specific providers (e.g., Instagram, LinkedIn) handle OAuth/modals.

## Development Tools Overview

Key CLIs: `pnpm install`, `pnpm dev` (concurrent apps), `pnpm build`, `pnpm test`. Docker Compose for local stacks (DB, Redis, Temporal). See [tooling.md](./tooling.md) for full setup, including VS Code extensions for NestJS/Prisma/Temporal.

## Getting Started Checklist

1. Clone the repo and run `pnpm install` to set up monorepo dependencies.
2. Start services with `pnpm dev` (spins up backend, frontend, orchestrator, DB via Docker).
3. Verify by opening http://localhost:3000 (frontend) and testing CLI: `pnpm cli post --help`.
4. Run tests: `pnpm test` (Jest/Vitest coverage).
5. Explore workflows in [development-workflow.md](./development-workflow.md) and architecture in [architecture.md](./architecture.md).

## Next Steps

Dive into [architecture.md](./architecture.md) for layers (Controllers → Services → Utils). Check product specs in `AGENTS.md` or `CLAUDE.md` for AI features. Stakeholders: content teams at agencies. External: Stripe docs for billing, Temporal UI for monitoring. Contribute via [CONTRIBUTING.md](../CONTRIBUTING.md)!
