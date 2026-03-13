# Robo-Multipost Documentation

Welcome to the comprehensive documentation for **Robo-Multipost** (aka Postiz), a multi-platform social media posting automation tool powered by AI agents, Temporal workflows, and extensive social integrations. This repo powers a full-stack application with SDK, CLI, browser extension, Next.js frontend, NestJS backend, and Temporal orchestrator.

This `docs/` folder serves as the centralized knowledge base for developers, covering architecture, workflows, integrations, and best practices. Use the sidebar or links below to navigate.

## 🚀 Quick Start

1. **Clone & Install**:
   ```bash
   git clone <repo-url>
   pnpm install
   ```

2. **Development Setup**:
   - Backend: `pnpm dev:backend`
   - Frontend: `pnpm dev:frontend`
   - Orchestrator: `pnpm dev:orchestrator`
   - Extension: `pnpm dev:extension`
   - Full stack: `pnpm dev`

3. **Key Commands**:
   | Command | Description |
   |---------|-------------|
   | `pnpm build` | Build all apps & libraries |
   | `pnpm lint` | Run ESLint across workspace |
   | `pnpm test` | Run Jest tests |
   | `pnpm db:migrate` | Apply Prisma migrations |
   | `pnpm cli agent-run` | Execute agent workflow |

4. **Environment**:
   - Copy `.env.example` to `.env` and configure `DATABASE_URL`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, etc.
   - Docker: `docker-compose -f docker-compose.dev.yaml up`

## 📋 Core Guides

| Guide | Description | Key Topics |
|-------|-------------|------------|
| [Project Overview](./project-overview.md) | High-level vision, roadmap, & user stories | Features, monetization, stakeholders |
| [Architecture Notes](./architecture.md) | System design & component map | Monorepo structure, layers (Config → Utils → Services → Models → Controllers) |
| [Development Workflow](./development-workflow.md) | Daily dev processes | Branching (feat/*, fix/*), PR reviews, CI/CD |
| [Testing Strategy](./testing-strategy.md) | Test suites & coverage | Unit (Jest), E2E, integration, flaky test handling |
| [Glossary & Domain Concepts](./glossary.md) | Domain language | Autopost, Agents, Integrations, Plugs, Sets |
| [Data Flow & Integrations](./data-flow.md) | APIs, queues, & external services | Temporal workflows, social providers (50+), webhooks |
| [Security & Compliance](./security.md) | Auth, secrets, & audits | Ability-based permissions, encryption, GDPR |
| [Tooling Guide](./tooling.md) | CLI, IDE, & automation | pnpm workspace, Vite/Next/Nest, Docker |

## 🏗️ Architecture Overview

Monorepo with pnpm workspaces (`apps/`, `libraries/`).

```
.
├── apps/
│   ├── backend/     # NestJS API (controllers, services)
│   ├── frontend/    # Next.js app (components, pages)
│   ├── sdk/         # TypeScript SDK (Postiz class)
│   ├── cli/         # CLI tool (PostizAPI)
│   ├── extension/   # Browser extension (cookies, providers)
│   ├── commands/    # NestJS CLI commands
│   └── orchestrator # Temporal workflows (autopost, agents)
├── libraries/
│   ├── nestjs-libraries/ # Shared Nest modules (integrations, dtos, prisma)
│   ├── react-shared-libraries/ # React hooks (translation, sentry)
│   └── helpers/     # Utilities (auth, decorators, utils)
```

### Key Layers (Dependency Flow)
1. **Config** → `.env`, app configs
2. **Utils** → OpenAI, upload (R2), throttler, short-links
3. **Services** → Track, Redis, Newsletter, Integrations (50+ social: X, LinkedIn, TikTok, etc.)
4. **Models** → Prisma schemas (users, posts, agencies)
5. **Controllers** → API routes (auth, autopost, billing)
6. **Repositories** → Prisma CRUD (agencies, autopost, etc.)
7. **Components** → React UI (new-launch providers, agents, analytics)

### Public API Highlights
- **SDK**: `Postiz` class for programmatic posting.
  ```typescript
  import { Postiz } from '@postiz/sdk';
  const postiz = new Postiz({ apiKey: 'your-key' });
  await postiz.post({ content: 'Hello world', platforms: ['x', 'linkedin'] });
  ```
- **Agents**: `AgentGraphService`, `AgentToolInterface` for AI-driven posting.
- **Integrations**: `ISocialMediaIntegration` – 50+ providers (BlueskyProvider, LinkedInPageProvider, etc.).
- **Workflows**: `autoPostWorkflow`, `streakWorkflow` via Temporal.

## 🔧 Key Modules & Exports

### Top Classes
- `AppModule` (backend/orchestrator)
- `VideoManager` (videos)
- `IntegrationManager` (social integrations)
- `AgentGraphService` (AI agents)

### Top Interfaces
- `ISocialMediaIntegration`
- `AgentToolInterface`
- `VideoParams`

### Prisma Repos
- `AutopostRepository`, `AgenciesRepository`, `PostsRepository`

## 🌐 Integrations (50+)
- **Social**: X, LinkedIn, Instagram, TikTok, Bluesky, Reddit, Discord, etc.
- **AI/Video**: OpenAI, Fal.ai, HeyGen, Veo3.
- **Payments**: Stripe, NowPayments.
- **Email/Newsletter**: Resend, Beehiiv.
- **Storage**: Cloudflare R2, local.

## 📊 Repository Snapshot
```
../../docs/planning/agents.md/
apps/                 # 6 apps (backend, frontend, sdk, cli, extension, orchestrator)
CLAUDE.md/
CODE_OF_CONDUCT.md/
CONTRIBUTING.md/
docker-compose*.yaml/
libraries/            # Shared libs (nestjs, react, helpers)
package.json          # pnpm monorepo
pnpm-workspace.yaml
README.md             # Root README
tsconfig*.json
```

## 🤝 Contributing
- Follow [CONTRIBUTING.md](../CONTRIBUTING.md).
- Use [Development Workflow](./development-workflow.md).
- Report issues: [GitHub Issues](https://github.com/postiz/robo-multipost/issues).

## 📄 License
[MIT](../LICENSE) – See root for details.

**Last Updated**: Auto-generated from codebase analysis. Edit source files to regenerate.
