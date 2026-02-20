# AGENTS.md — Robô MultiPost

Context file for AI coding agents. This project is **Robô MultiPost**, a fork of [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0), customized for the Automação Sem Limites community. It is a self-hosted social media scheduler supporting 33+ networks with calendar scheduling, analytics, media library, and AI integration.

---

## Project Overview

- **Type:** Social media scheduler (self-hosted, Docker-based)
- **Upstream:** [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app)
- **Fork:** [maiconramos/robo-multipost](https://github.com/maiconramos/robo-multipost)
- **License:** AGPL-3.0 (credits and attribution must be preserved)
- **Language:** TypeScript throughout (monorepo)
- **Package manager:** PNPM only — never use npm or yarn

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | NestJS (TypeScript) |
| Frontend | Next.js 14 + React 18 |
| Styling | Tailwind CSS 3 |
| Background jobs | NestJS + Temporal.io |
| Database | PostgreSQL 17 + Prisma ORM |
| Cache | Redis 7 |
| AI engine | Mastra framework + MCP (Model Context Protocol) |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions → GHCR |

---

## Monorepo Structure

```
apps/
  backend/        ← REST API (NestJS)
  frontend/       ← UI (Next.js 14 + React 18)
  orchestrator/   ← Temporal workflows and activities (NestJS)
  extension/      ← Browser extension
  cli/            ← CLI tool (npm: postiz)
  sdk/            ← Node.js SDK (npm: @postiz/node)
  commands/       ← Background command microservice

libraries/
  nestjs-libraries/
    integrations/social/   ← 33 social media providers
    database/prisma/       ← Prisma schema + migrations (45 models)
    chat/                  ← AI agents and MCP tools
    openai/                ← AI provider integration
    3rdparties/            ← Third-party integrations
  react-shared-libraries/
    translation/locales/   ← 17 languages (pt, en, es, fr, de, it, ru, tr, ja, ko, zh, vi, bn, ar, he, ka_ge)
    ui/                    ← Shared React components
    helpers/               ← Shared utilities
  helpers/                 ← General utilities
```

---

## Setup Commands

```bash
# Install dependencies (PNPM only)
pnpm install

# Development — all apps
pnpm dev

# Development — backend + frontend only
pnpm dev-backend

# Build
pnpm build
pnpm build:backend
pnpm build:frontend
pnpm build:orchestrator

# Database
pnpm prisma-generate   # Generate Prisma client
pnpm prisma-db-push    # Apply schema migrations

# Docker
pnpm docker-build      # Build Docker images

# Linting (must run from root)
pnpm lint
```

---

## Production Services (all required)

Any production instance needs all 5 services running:

1. **App** — backend + frontend container
2. **PostgreSQL 17** — main database
3. **Redis 7** — cache and queues
4. **Temporal** — workflow orchestrator (critical: all scheduling passes through here)
5. **Nginx** — reverse proxy

Development also includes pgAdmin 4 and RedisInsight for DB management.

---

## Backend Architecture

Strictly follow the 3-layer pattern:

```
Controller → Service → Repository
```

Or with a manager:

```
Controller → Manager → Service → Repository
```

- Never skip layers or shortcut between them
- Business logic lives in `libraries/nestjs-libraries/src/`
- `apps/backend` is used for controllers and imports from libs

---

## Frontend Architecture

- UI components: `apps/frontend/src/components/ui/`
- Routing: `apps/frontend/src/app/`
- Feature components: `apps/frontend/src/components/`
- Always use SWR for data fetching via the `useFetch` hook from `libraries/helpers/src/utils/custom.fetch.tsx`

### SWR Rule (strict)

Each SWR call must be in a **separate hook**, compliant with `react-hooks/rules-of-hooks`. No `eslint-disable-next-line`.

```typescript
// VALID
const useWorkspace = () => {
  return useSWR('/api/workspace', fetcher)
}

// INVALID
const useWorkspace = () => {
  return {
    workspace: () => useSWR('/api/workspace', fetcher),
    members: () => useSWR('/api/members', fetcher),
  }
}
```

### Styling Rules

- Check `apps/frontend/src/app/colors.scss` and `global.scss` before writing components
- Check `apps/frontend/tailwind.config.js` for available tokens
- `--color-custom*` variables are **deprecated** — do not use them
- Never install frontend component libraries from npm — write native components
- Check existing components for design consistency before creating new ones

---

## Code Style

- TypeScript throughout
- Follow existing patterns in each layer before introducing new ones
- Linting from root only: `pnpm lint`
- No `eslint-disable` comments unless absolutely justified

---

## Development Principles

### Document-First
Every new feature must have documentation written **before or alongside** implementation:
- Update `docs/` or the relevant file before opening a PR
- Describe expected behavior, usage flow, and impacts
- Document env vars, configurations, and affected endpoints
- PR without documentation should not be merged

### API-First
Every new backend feature must have an **API contract defined first**:
- Define endpoints, payloads, and responses before implementing (OpenAPI spec or explicit PR contract)
- UI always consumes the API — never the other way around
- API contract changes must be versioned and documented

---

## Git Strategy (GitLab Flow)

### Branches

| Branch | Role | Rule |
|---|---|---|
| `postiz` | Clean mirror of the official upstream repo | **Never commit customizations here** |
| `main` | Active development and customizations | All custom code lives here |
| `release` | Stable version for production | Only receives merge from `main` when tested and approved |

### Remotes

```
origin   → https://github.com/maiconramos/robo-multipost
upstream → https://github.com/gitroomhq/postiz-app
```

### Sync with upstream (when Postiz releases updates)

```bash
git checkout postiz
git fetch upstream
git merge upstream/main

git checkout main
git merge postiz
# resolve conflicts, test, commit
```

### Feature development

```bash
git checkout main
git checkout -b custom/feature-name
# develop...
git checkout main
git merge custom/feature-name
git branch -d custom/feature-name
```

> Small features can go directly to `main`.

### Release flow

```bash
git checkout release
git merge main
git tag -a v1.2.0 -m "Release v1.2.0 — description"
git push origin release
git push origin v1.2.0
```

> Docker image is always built from `release` branch + tag, never from `main`.

### Hotfix flow

```bash
git checkout release
git checkout -b hotfix/bug-description
# fix...
git checkout release && git merge hotfix/bug-description
git tag -a v1.2.1 -m "Hotfix v1.2.1"
git checkout main && git merge hotfix/bug-description
git branch -d hotfix/bug-description
git push origin release main && git push origin v1.2.1
```

### Semantic versioning

| Change type | Increment | Example |
|---|---|---|
| Upstream Postiz update | `MINOR` | `v1.1.0` → `v1.2.0` |
| New custom feature | `MINOR` | `v1.2.0` → `v1.3.0` |
| Bug fix | `PATCH` | `v1.2.0` → `v1.2.1` |
| Breaking change | `MAJOR` | `v1.2.0` → `v2.0.0` |

---

## Product Context

### Branding
- Name: **Robô MultiPost** (fork of Postiz — AGPL credits must be preserved)
- Default language: **pt-BR** (translation file `pt` already exists — review quality, not create from scratch)
- All 17 existing languages must remain available

### Late Integration
- [Late](https://docs.getlate.dev/llms-full.txt) is an alternative publishing provider for networks with strict OAuth approval
- Phase 1 targets: **TikTok via Late** and **Pinterest via Late**
- Credentials stored using Postiz's existing encryption layer
- Provider selection per channel in a dedicated Settings section

### Feature Flags (self-hosted defaults)
| Feature | Default | Env var |
|---|---|---|
| Billing / Stripe | Disabled | `DISABLE_BILLING=true` |
| Marketplace | Disabled | `DISABLE_MARKETPLACE=true` |
| Storage | Local | `STORAGE_PROVIDER=local` |
| Short links | Disabled | (no provider configured) |

### AI Infrastructure (already exists)
The AI infrastructure is already in the codebase:
- **Mastra framework** — AI engine
- **MCP tools** — image generation, video generation, scheduling
- **`/agents` page** — already in the frontend
- **`copilot.controller.ts`** — already in the backend
- **Mastra DB tables** — already in Prisma schema
- **`Credits` table** — for usage tracking

Phase 3 goal: expose and configure existing infrastructure with community-friendly providers (OpenRouter, Kie.ai) — not build from scratch.

---

## Social Media Providers (33 total)

X (Twitter), LinkedIn, LinkedIn Page, Instagram, Instagram Standalone, Facebook, TikTok, YouTube, Pinterest, Reddit, Threads, Bluesky, Mastodon, Discord, Slack, Telegram, Twitch, Medium, Dev.to, Hashnode, WordPress, Dribbble, Farcaster, Nostr, Lemmy, ListMonk, Skool, Kick, VK, Google My Business, Whop, MoltBook

---

## Key Files Reference

| File | Purpose |
|---|---|
| `CLAUDE.md` | Claude Code agent instructions |
| `AGENTS.md` | This file — generic agent context |
| `PRD.md` | Full product requirements document |
| `libraries/nestjs-libraries/src/database/prisma/schema.prisma` | Full DB schema (45 models) |
| `apps/frontend/src/app/colors.scss` | Design token colors |
| `apps/frontend/tailwind.config.js` | Tailwind config |
| `libraries/helpers/src/utils/custom.fetch.tsx` | SWR fetch hook |
| `.github/workflows/` | CI/CD pipelines |
| `docker-compose.yaml` | Production Docker setup |
| `docker-compose.dev.yaml` | Development Docker setup |
## AI Context References
- Documentation index: `.context/docs/README.md`
- Agent playbooks: `.context/agents/README.md`

