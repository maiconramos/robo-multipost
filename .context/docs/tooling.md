## Tooling & Productivity Guide

This monorepo powers the Postiz platform—a multi-app setup including a Next.js frontend, NestJS backend, Temporal orchestrator, Chrome extension, CLI, SDK, and shared libraries for integrations, auth, and more. To stay efficient, use pnpm for workspace management, Docker Compose for local services (Postgres, Redis, Temporal), and built-in scripts for linting, building, and testing. Key configs live at the root: `pnpm-workspace.yaml`, `docker-compose.yml`, `turbo.json` (for caching builds across apps), `tsconfig.json`, `.eslintrc.js`, and `.prettierrc`. Run `pnpm install` once at root to link everything. See [development-workflow.md](./development-workflow.md) for end-to-end setup.

## Required Tooling

- **Node.js**  
  Version: >=20.10.0 (LTS recommended).  
  [Install via NodeSource or nvm](https://nodejs.org/en/download/package-manager/).  
  Powers TypeScript compilation, Next.js frontend (`apps/frontend`), NestJS apps (`apps/backend`, `apps/orchestrator`), CLI/SDK (`apps/cli`, `apps/sdk`), and libraries. Verify: `node --version`.

- **pnpm**  
  Version: >=9.1.0.  
  `curl -fsSL https://get.pnpm.io/install.sh | sh -` then `pnpm setup`.  
  Monorepo package manager via `pnpm-workspace.yaml`. Handles 50+ packages across `apps/*` and `libraries/*`. Run `pnpm install` at root. Verify: `pnpm --version`. Use `pnpm --filter <app> <script>` for targeted runs (e.g., `pnpm --filter frontend dev`).

- **Docker & Docker Compose**  
  Version: Docker >=24, Compose >=2.21 (plugin or standalone).  
  [Install Docker Desktop](https://www.docker.com/products/docker-desktop/) or via package manager.  
  Spins up Postgres (Prisma migrations), Redis (`libraries/nestjs-libraries/src/redis`), Temporal server (`apps/orchestrator`), and optional MinIO/R2 mock for uploads (`libraries/nestjs-libraries/src/upload`). Run `docker compose up -d` at root. Ports: Postgres 5432, Redis 6379, Temporal UI 8080/UI, Backend 3001.

- **Git**  
  Version: >=2.40.  
  Standard install.  
  Version control with pre-commit hooks (see below). Clone: `git clone <repo> && pnpm i`.

- **Prisma CLI**  
  Included via dev deps. Run `pnpm prisma generate` or `pnpm prisma db push` for schema changes in `libraries/nestjs-libraries/src/database/prisma`.

## Recommended Automation

Enforce code quality with these root-level scripts (`pnpm run <script>`):

- **Linting & Formatting**: `pnpm lint` (ESLint + Prettier across TS/JS/JSON). Auto-fix: `pnpm lint:fix`. Configs: `.eslintrc.js` (strict TS/React/Nest rules), `.prettierrc` (2-space indent, single quotes).
  
- **Pre-commit Hooks**: Husky + lint-staged. Install: `pnpm run prepare` (runs on `pnpm i`). Hooks lint staged files, run type-check (`tsc --noEmit`), and format before commit.

- **Type Checking**: `pnpm type-check` (parallel `tsc --noEmit` via Turbo for all apps/libs).

- **Building**: `pnpm build` (Turbo-cached builds: frontend Next.js SSR, backend NestJS bundles, extension Vite CRX, libs compiled). Watch: `pnpm build:watch`.

- **Testing**: `pnpm test` (Jest/Vitest per app; integration tests in `apps/commands`). Coverage: `pnpm test:cov`.

- **Dev Servers**:
  ```
  pnpm dev          # All-in-one: frontend:3000, backend:3001, orchestrator Temporal, services up
  pnpm --filter frontend dev    # Next.js hot reload
  pnpm --filter extension dev   # Chrome extension (load unpacked)
  pnpm --filter backend dev     # NestJS API
  ```

- **CLI Utilities** (`apps/cli`): `pnpm cli upload <file>`, `pnpm cli posts list`, `pnpm cli integrations list`. Great for scripting uploads/posts via SDK (`apps/sdk`).

- **Migrations & Seeds**: `pnpm prisma migrate dev` (Postgres), `pnpm db:seed` (if scripted).

- **Code Generation**: `pnpm prisma generate` (auto-generates Prisma clients for models like users/posts/integrations).

Shortcuts: Bind `pnpm turbo run dev --filter=...` in your shell for parallel app dev.

## IDE / Editor Setup

**VS Code** (recommended; `.vscode/settings.json` provided):

- **Extensions**:
  | Extension | Purpose |
  |-----------|---------|
  | `dbaeumer.vscode-eslint` | Real-time linting (integrates `.eslintrc.js`). |
  | `esbenp.prettier-vscode` | Auto-format on save (`.prettierrc`). |
  | `bradlc.vscode-tailwindcss` | IntelliSense for Tailwind (frontend UI). |
  | `prisma.prisma` | Schema editing/migrations. |
  | `ms-vscode.vscode-typescript-next` | TS server for monorepo (strict mode). |
  | `nestjs.vscode-nestjs` | NestJS snippets/decorators (backend/libs). |
  | `christian-kohler.path-intellisense` | Auto-import paths (`@postiz/*`). |
  | `wix.vscode-import-cost` | Bundle size hints. |

- **Workspace Settings** (`.vscode/settings.json` overrides):
  ```json
  {
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": { "source.fixAll.eslint": true },
    "typescript.tsdk": "./node_modules/typescript/lib",
    "eslint.workingDirectories": ["apps/*", "libraries/*"]
  }
  ```

- **Snippets/Templates**: Use Emmet for React/TSX, NestJS snippets for controllers/DTOs.

**Other IDEs**: WebStorm/IntelliJ (enable ESLint/Prettier plugins); Vim/Neovim (ALE + null-ls).

## Productivity Tips

- **Terminal Aliases** (add to `~/.zshrc` or `~/.bashrc`):
  ```
  alias pi='pnpm install'
  alias pd='pnpm dev'
  alias plf='pnpm lint:fix'
  alias db='docker compose up -d && pnpm prisma db push'
  alias logs='docker compose logs -f'
  alias ext-reload='pnpm --filter extension build && chrome://extensions/ (load unpacked)'
  ```

- **Container Workflows**: `docker compose watch` (auto-restart services on changes). Full stack: `make dev` (if Makefile exists) or `docker compose up --build` for cold starts.

- **Local Emulators**:
  - Temporal UI: http://localhost:8080 (workflows like `autoPostWorkflow`).
  - Prisma Studio: `pnpm prisma studio`.
  - R2 Mock: Use MinIO in Docker for `libraries/nestjs-libraries/src/upload`.
  - Extension Testing: `pnpm extension dev` + Chrome incognito.

- **Monorepo Navigation**: `pnpm turbo run list` (app graph), `turbopilot` VS Code ext for Turbo.

- **Shared Scripts/Dotfiles**: Clone team dotfiles for VS Code + iTerm2 themes. Debug integrations: `pnpm cli integrations trigger <provider>`.

For full onboarding, follow [development-workflow.md](./development-workflow.md). Contribute scripts to root `scripts/` folder!
