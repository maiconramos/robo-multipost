# Robô MultiPost — Claude Code Instructions

## Identity

**Robô MultiPost** is a fork of [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0), customized for the Automação Sem Limites community. Self-hosted social media scheduler with 33+ channels, calendar-based scheduling, analytics, media library, and a per-workspace AI layer.

## Stack

| Layer | Technology | Details in |
|---|---|---|
| Backend | NestJS + TypeScript | [`apps/backend/CLAUDE.md`](apps/backend/CLAUDE.md) |
| Frontend | Next.js 14 + React 18 + Tailwind 3 | [`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md) |
| Orchestrator | NestJS + Temporal.io | [`apps/orchestrator/CLAUDE.md`](apps/orchestrator/CLAUDE.md) |
| Shared domain | NestJS libraries | [`libraries/nestjs-libraries/CLAUDE.md`](libraries/nestjs-libraries/CLAUDE.md) |
| Shared UI | React libraries | [`libraries/react-shared-libraries/CLAUDE.md`](libraries/react-shared-libraries/CLAUDE.md) |
| ORM | Prisma + PostgreSQL 17 | — |
| Package manager | **PNPM** (monorepo) — never npm/yarn | — |
| AI | Mastra + MCP | [`libraries/nestjs-libraries/src/ai/CLAUDE.md`](libraries/nestjs-libraries/src/ai/CLAUDE.md) |

## Monorepo Map

| Path | Purpose | Child CLAUDE.md |
|---|---|---|
| `apps/backend/` | REST API | [link](apps/backend/CLAUDE.md) |
| `apps/frontend/` | Next.js UI | [link](apps/frontend/CLAUDE.md) |
| `apps/orchestrator/` | Temporal workflows | [link](apps/orchestrator/CLAUDE.md) |
| `apps/extension/` | Browser extension | — (stub) |
| `apps/cli/` | CLI/skill de agente (`@robo-multipost/agent`) — self-hosted, com flows | [link](apps/cli/CLAUDE.md) |
| `apps/sdk/` | `@postiz/node` SDK | — (stub) |
| `apps/commands/` | Background commands microservice | — (stub) |
| `libraries/nestjs-libraries/` | Shared backend/orchestrator domain | [link](libraries/nestjs-libraries/CLAUDE.md) |
| `└── src/integrations/social/` | 40+ social media providers | [link](libraries/nestjs-libraries/src/integrations/social/CLAUDE.md) |
| `└── src/ai/` | AI Provider System, credits, persona, KB | [link](libraries/nestjs-libraries/src/ai/CLAUDE.md) |
| `└── src/chat/` | Mastra agents, MCP tools, IG webhook | [link](libraries/nestjs-libraries/src/chat/CLAUDE.md) |
| `└── src/database/prisma/` | Schema + repositories | inside parent |
| `libraries/react-shared-libraries/` | Shared UI components | [link](libraries/react-shared-libraries/CLAUDE.md) |
| `libraries/helpers/` | General utilities | inside root |
| `docs/` | Architecture and operations (read, don't rewrite) | — |
| `.context/` | Portable dotcontext via MCP — DO NOT touch | — |

## Non-Negotiable Principles

1. **Controller → Service → Repository** with no shortcut between layers. Business logic lives in `libraries/nestjs-libraries/src/`. Details in [`apps/backend/CLAUDE.md`](apps/backend/CLAUDE.md).
2. **TDD is mandatory** (RED → GREEN → REFACTOR). Specs are co-located, suffix `.spec.ts`. Helpers and patterns in [`libraries/nestjs-libraries/CLAUDE.md`](libraries/nestjs-libraries/CLAUDE.md).
3. **PNPM only** — `npm`/`yarn` are blocked.
4. **i18n is mandatory in the frontend** — no hardcoded strings in JSX, always `useT()`. Details in [`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md).
5. **Document-First** — update `docs/` before or alongside the PR; PRs without documentation are not merged.
6. **API-First** — define the contract (endpoint + payload + response) before implementing. UI consumes the API, never the other way around.
7. **Incremental Changelog** — every non-trivial commit updates `## [Unreleased]` in `CHANGELOG.md` (entries in pt-BR with full accents, Keep a Changelog format).
8. **GitLab Flow** — branches `postiz` (upstream mirror, never commit here) | `main` (development) | `release` (production). Promoting `main → release` requires a SemVer tag.

## Golden Rules

- **Never** use `eslint-disable-next-line` — refactor to comply with the rule.
- **Never** install UI components from npm — write them natively (see [`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md)).
- **Never** access AI credentials skipping `AiProviderResolverService` (see [`libraries/nestjs-libraries/src/ai/CLAUDE.md`](libraries/nestjs-libraries/src/ai/CLAUDE.md)).
- **Never** hardcode `graph.facebook.com` in Instagram comment activities — use `FlowActivity.resolveIgRoute` (see [`apps/orchestrator/CLAUDE.md`](apps/orchestrator/CLAUDE.md)).
- **Never** hardcode `process.env` in OAuth providers — propagate `ClientInformation` (see [`libraries/nestjs-libraries/src/integrations/social/CLAUDE.md`](libraries/nestjs-libraries/src/integrations/social/CLAUDE.md)).
- **Never** throw/extend `HttpForbiddenException` for a generic 403 — the global `HttpExceptionFilter` (`libraries/nestjs-libraries/src/services/exception.filter.ts`) always converts it into a 401 + auth-cookie clear (forced logout). For a real 403 that keeps the session, use `new HttpException(body, 403)` or a dedicated exception class (e.g. `NoProfileAssignedException`, `AdminRoleRequiredException`) — see [`apps/backend/CLAUDE.md`](apps/backend/CLAUDE.md).
- **Never** touch `.context/` — managed by dotcontext via MCP, has its own lifecycle.
- **Never** run `gh pr <create|edit|merge|close|ready|review|comment|reopen>` without `--repo maiconramos/robo-multipost` — this repo is a fork of `gitroomhq/postiz-app`, and `gh` defaults to the upstream public repo. Enforced by hook `.claude/hooks/gh-pr-fork-guard.sh` (blocks the command with exit 2). Always use `gh pr <subcommand> --repo maiconramos/robo-multipost --base main --head <branch> ...`. Read-only `gh pr view|list|diff|checks|status` are not blocked.
- Linting runs **only from the repo root** with `pnpm lint`.
- Project skills live in `.claude/skills/`; per-session auto-memory in `~/.claude/projects/.../memory/`.

## Subagents (.claude/agents/)

- **`plan-reviewer`** — auto-invoked PROACTIVELY after a plan is approved and before any code is written. Read-only (`Read, Glob, Grep`). Validates the plan against the actual repo — architecture compliance (Controller→Service→Repository, social provider abstract, `resolveIgRoute`, `AiProviderResolverService`), code-reality check (do the referenced files/functions exist?), cross-cutting impact (Prisma + `StartupMigrationService`, public-api contracts, shared DTOs, env vars), dependency map, TDD impact (which new files need `.spec.ts`), i18n impact (which `useT()` keys need `pt`/`en` entries), and documentation heads-ups for the `doc-maintainer`. Categorizes findings as 🛑 BLOCKER / ⚠️ CONCERN / 💡 HEADS-UP. Never edits, never decides whether to proceed, never rewrites the plan — humans decide.
- **`code-reviewer`** — auto-invoked after every batch of code edits, in parallel with `security-auditor` when security surfaces are touched. Read-only (`Read`, `Glob`, `Grep`) review against repo standards: layer architecture (Controller → Service → Repository), TDD compliance, i18n with `useT()`, SWR rules-of-hooks, provider/credential contracts (`AiProviderResolverService`, `ClientInformation`, 412 vs 402, `FlowActivity.resolveIgRoute`), style (`eslint-disable` ban, native UI primitives, `pnpm` only), branch hygiene, and Wizard ↔ Flow Builder parity. Reports findings as 🚫 MUST FIX / 🟡 SHOULD FIX / 💭 NIT. Escalates to `security-auditor` (`→ SECURITY-AUDITOR` marker) when HMAC, OAuth, JWT, secrets, encryption, raw SQL, or SSRF-risky surfaces appear — never audits them itself. Canonical rule content lives in [`.context/skills/code-review/SKILL.md`](.context/skills/code-review/SKILL.md).
- **`security-auditor`** — auto-invoked when `code-reviewer` emits the `→ SECURITY-AUDITOR` marker, or directly when a human requests a security audit (release-branch sweep, surface-specific deep dive, post-CVE regression check). Read-only (`Read`, `Glob`, `Grep`). Audits the 12 dimensions derived from [`.context/skills/security-audit/SKILL.md`](.context/skills/security-audit/SKILL.md): HMAC verification on signed webhooks, OAuth flow integrity and `ClientInformation` propagation, JWT handling, authentication/authorization decorators (`@UseGuards`, `@GetOrgFromRequest`, `@GetProfileFromRequest`), DTO validation against external payloads, secret/token leakage in logs, raw SQL via `$queryRaw`/`$executeRaw`, SSRF blocklist on user-supplied URLs, prompt injection mitigation via the `<source>` wrapper (canonical in `ai-web-search.service.ts`), AES-256-GCM encryption-at-rest for stored credentials, per-profile credential routing (`FlowActivity.resolveIgRoute` for Instagram), AGPL compliance and rate-limit hygiene. Categorizes findings as 🚨 CRITICAL / ⚠️ HIGH / 💡 MEDIUM (no LOW). Conservative posture — when in doubt, reports rather than discards. Never edits, never invokes other subagents, never drafts the fix — points at the vulnerability and the class of mitigation only. Fourth subagent of the pipeline (running in parallel with `code-reviewer`); `test-completer` follows; `doc-maintainer` is last.
- **`test-completer`** — auto-invoked PROACTIVELY before commit when the TDD hook (`.claude/hooks/tdd-check.sh`) would block due to a staged `*.service.ts`, `*.repository.ts`, or `*.provider.ts` without a co-located `*.spec.ts`. Tools: `Read, Edit, Write, Glob, Grep, Bash(pnpm test:*)` — `Edit`/`Write` are restricted to `*.spec.ts` / `*.spec.tsx` files only, enforced as MUST NOT in the system prompt because tools alone cannot restrict file paths; `Bash` is restricted to `pnpm test:*` via the tools whitelist (no `pnpm install`, no `git`, no MCP). Generates specs following the repo's canonical TDD conventions (`createMock<T>()`, `createTestModule({ service, mocks })`, Red-Green-Refactor, `describe`/`it` strings in pt-BR sem acentos), validated with `pnpm test --filter <package>`. Reports findings as 🟢 CREATED / 🟡 UPDATED / 🔴 FAILED / ⏭️ SKIPPED. Conservative posture: never generates placeholder specs just to bypass the hook (reports SKIPPED with justification instead), never modifies production code to make tests pass (reports FAILED and stops — likely a real bug), never generates frontend `.spec.tsx` by default. Canonical content lives in [`.context/skills/test-generation/SKILL.md`](.context/skills/test-generation/SKILL.md). Fifth and last subagent of the pipeline.
- **`doc-maintainer`** — auto-invoked at the end of every feature or non-trivial bugfix. Reads the diff, locates affected `CLAUDE.md` files, and **proposes** targeted updates (drift, new pitfalls, file-map gaps, `📁 NEW SUBAREA CANDIDATE` flags). Tools restricted to `Read, Glob, Grep, Edit`; edits scoped to `CLAUDE.md`/`AGENTS.md` only. Never applies changes without human approval. Scope registered in [`docs/planning/claude-md-maintainer-agent.md`](docs/planning/claude-md-maintainer-agent.md).
- **`feature-acceptance-reviewer`** — auto-invoked PROACTIVELY after `doc-maintainer` approval and before opening PR, on substantial features only (≥ 5 files modified or crossing ≥ 2 areas). Read-only (`Read, Glob, Grep`), **model `opus`** (unique in repo — only subagent using opus; needs 1M token context to hold entire feature + system context simultaneously). Audits **feature-as-a-whole in system context** to catch macro integration gaps the other 5 diff reviewers don't: (1) coverage of original requirements, (2) cross-file integration (consumers of changed code still work?), (3) architectural pattern consistency at feature level, (4) i18n cross-locale parity (en/pt), (5) adjacent CLAUDE.md documentation drift, (6) migration safety (Prisma rollback plans), (7) UX consistency (patterns, vocabulary, spacing), (8) telemetry/log naming convention. Reports findings as 🚨 SHIP-BLOCKING / ⚠️ POLISH-NEEDED / 💡 OBSERVATION. Conservative posture: reads from disk (untrusted input), searches actively for gaps, never speculates without evidence. Recuses on features < 5 files with ⏭️ SKIPPED. Sixth and last subagent of the pipeline (before PR).

## Browser Validation (Claude in Chrome)

Claude in Chrome is enabled in this project. When invoked via
`claude --chrome` or `/chrome`, the main agent gains
`mcp__claude-in-chrome__*` tools to control the user's real Chrome
browser — navigate, click, fill forms, read DOM, read console errors,
inspect network requests, screenshot — reusing the user's existing
logged-in session and connected branches.

### When to use

The main agent SHOULD invoke browser tools to validate features
end-to-end after `code-reviewer` and `security-auditor` pass, and
before opening the PR, when:

- Implementing or modifying frontend flows that affect visible behavior
  (forms, buttons, navigation, modals, new screens, visible state
  changes, dashboards, settings).
- Fixing bugs reported as visual or interaction issues.
- Touching `apps/frontend/` in ways that materially change UX.

### When to skip

Skip browser validation when:

- Backend-only changes (no frontend impact).
- Refactor without observable behavior change.
- Test-only or documentation-only changes.
- Type-only changes that do not affect rendering.

### How to behave

1. Assume the user has the local app running (`pnpm dev:dev`) and is
   already logged in to the relevant environment in Chrome.
2. Use the smallest set of browser tool calls needed to verify the
   feature behavior. Do not over-explore.
3. Read console output and key network calls related to the change;
   surface unexpected errors.
4. Capture a screenshot only when it helps the PR description (visual
   diff, new screen, fixed visual bug). Do not screenshot every step.
5. If the session has expired or login is needed, **ASK the user to log
   in**. Do not attempt automated authentication.
6. Report findings as part of the implementation summary in the PR body
   under a `### Browser Validation` section.

### Hard constraints

- Browser tools are for validation, not for implementing features.
  Do not use them to bypass the normal implementation pipeline.
- Do not run browser validation in cloud sessions (the local app and
  logged-in Chrome live on the user's machine).
- Do not perform destructive actions (delete account, cancel
  subscription) during validation. If the test scenario requires it,
  ask the user first.

### Reference

- Setup: `claude --chrome` (one-off) or `/chrome` followed by "Enabled
  by default" (persistent).
- Requires Claude Code CLI ≥ v2.0.73 and Claude for Chrome extension
  ≥ v1.0.36.
- Available in beta on Pro / Max / Team / Enterprise plans.

## Code Graph (Graphify)

This repo is indexed as a knowledge graph by [Graphify](https://github.com/safishamsi/graphify). The graph maps symbols, call sites, dependencies, god nodes, and surprising connections across all 25 supported languages. Outputs live in `graphify-out/`:

- `GRAPH_REPORT.md` — top-level findings (god nodes, surprising connections, why-comments, suggested questions).
- `graph.json` — full queryable graph.

### When to consult the graph

The main agent and reviewers SHOULD prefer querying the graph over recursive Grep when:

- Investigating cross-cutting code ("who calls X?", "what depends on Y?").
- Estimating blast radius of a change (god nodes have many consumers).
- Understanding architectural relationships in unfamiliar areas.
- Finding implicit coupling between modules (`libraries/nestjs-libraries/src/integrations/social/` providers, for instance).

Read `graphify-out/GRAPH_REPORT.md` first as a starting point; query `graphify-out/graph.json` for specifics.

### When NOT to use the graph

Skip graph consultation for:

- Localized changes within a single file.
- Style/formatting changes.
- Documentation-only changes.
- Trivial bug fixes with obvious scope.

### Auto-rebuild

Git hooks (`graphify hook install` was run) rebuild the graph automatically on `post-commit` and `post-checkout`. This is tree-sitter only — zero API cost recurring. The graph stays in sync with the codebase without manual intervention.

### Manual rebuild

When docs, PDFs, or images change (which DO use the LLM API), run:

```
graphify update .    # re-extract only changed files
```

To rebuild fully:

```
graphify .
```

### MCP server

The `.mcp.json` in this repo registers a Graphify MCP server providing `mcp__graphify__query_graph`, `get_node`, `get_neighbors`, `shortest_path` tools. Requires Python 3.10+ and `graphifyy[mcp]` installed locally (via `uv tool install 'graphifyy[mcp]'` or `pipx install 'graphifyy[mcp]'`). The server is invoked through `uvx --from 'graphifyy[mcp]' python -m graphify.serve graphify-out/graph.json`. The `plan-reviewer` subagent is configured to use these tools when available. If the MCP server fails to initialize, it falls back to reading `GRAPH_REPORT.md` and using Grep — no hard dependency.

## Product Context

- **Default language:** pt-BR (`react-shared-libraries/src/translation/locales/pt`). User-facing text uses full pt-BR accents.
- **Branding:** "Robô MultiPost" — Postiz credits preserved as required by AGPL.
- **Zernio (formerly Late / getlate.dev):** TikTok and Pinterest via [Zernio API](https://docs.zernio.com/llms-full.txt) as alternative provider. Details in [`libraries/nestjs-libraries/src/integrations/social/CLAUDE.md`](libraries/nestjs-libraries/src/integrations/social/CLAUDE.md).
- **Billing:** disabled by default (`DISABLE_BILLING=true`).
- **Marketplace:** disabled by default (`DISABLE_MARKETPLACE=true`).
- **Storage:** local by default; Cloudflare R2 optional.
- **AI:** Mastra + MCP infra exists; configuration is per-workspace via Settings UI.

## Required Production Services

App (backend + frontend) | PostgreSQL 17 | Redis 7 | **Temporal** (critical for scheduling) | Nginx (reverse proxy).

## Essential Commands

```bash
# Development
pnpm dev                  # All apps
pnpm dev-backend          # Backend + frontend

# Build
pnpm build                # Full build
pnpm build:backend
pnpm build:frontend
pnpm build:orchestrator

# Banco de dados
pnpm prisma-generate      # Gerar Prisma client
pnpm prisma-db-push       # Aplicar migrações

# Docker
pnpm docker-build         # Build das imagens Docker

# Linting (sempre da raiz)
pnpm lint
```

## Contexto Portável (.context/)

O diretório `.context/` é gerenciado pelo [dotcontext](https://github.com/dotcontext/cli) (MCP configurado em `.mcp.json` na raiz) e é a source-of-truth para portabilidade entre IDEs (Claude Code, Antigravity, Cursor, Codex). Mudanças manuais em `.claude/`, `.cursor/rules`, `.windsurfrules` ou `.github/copilot-instructions.md` **não** se propagam sem sync explícito via dotcontext.

Gateways disponíveis quando o MCP está carregado: `explore`, `context`, `plan`, `agent`, `skill`, `sync`. Como invocar:

- `use the security-auditor agent to audit the new webhook handler`
- `use the commit-message skill to draft a commit for staged changes`
- `plan "<descrição>" using dotcontext` (workflow PREVC completo)

Estado atual: 14 agents preenchidos em `.context/agents/`, 10 docs preenchidos em `.context/docs/`, e 10 skills `unfilled` em `.context/skills/` aguardando preenchimento via MCP. Para ativar o MCP localmente e preencher os skills, siga `docs/planning/dotcontext-bootstrap.md`. Para uso diário, veja `docs/planning/dotcontext-daily-usage.md`.

## Contexto de Produto

- **Idioma padrão:** pt-BR (arquivo de tradução `pt` já existe em `react-shared-libraries/src/translation/locales/`)
- **Branding:** "Robô MultiPost" (fork do Postiz, créditos mantidos por exigência da AGPL)
- **Integração Zernio:** TikTok e Pinterest via [Zernio API](https://docs.zernio.com/llms-full.txt) como provedor alternativo (ex-Late/getlate.dev — mesma empresa, nova marca)
- **Billing:** desabilitado por padrão para self-hosted (`DISABLE_BILLING=true`)
- **Marketplace:** desabilitado por padrão (`DISABLE_MARKETPLACE=true`)
- **Storage:** local por padrão, Cloudflare R2 como opção avançada
- **IA:** infraestrutura Mastra + MCP já existe — trabalho é configurar providers por workspace

## Sistema de Créditos de IA

O sistema de créditos controla quantas imagens e vídeos cada perfil pode gerar por mês.

### Modos de operacao (`AI_CREDITS_MODE`)

| Modo | Comportamento |
|------|--------------|
| `unlimited` (default) | Todos os perfis geram sem limite. Uso registrado para analytics |
| `managed` | Creditos gerenciados por perfil. Perfil default (admin) sempre ilimitado |

### Cadeia de precedencia (modo managed)

```
1. AI_CREDITS_MODE=unlimited → SEMPRE ilimitado, ignora tudo
2. Perfil default (isDefault=true) → sempre ilimitado
3. Config do perfil (aiImageCredits/aiVideoCredits) → se preenchido, usa
4. Config default (AI_CREDITS_DEFAULT_IMAGES/AI_CREDITS_DEFAULT_VIDEOS) → se preenchido, usa
5. Fallback → ilimitado (-1)
```

### Valores especiais nos campos de creditos

| Valor | Significado |
|-------|-------------|
| `null` | Usar padrao da env var ou fallback ilimitado |
| `-1` | Ilimitado para este perfil |
| `0` | Bloqueado (sem creditos de IA) |
| `N > 0` | N creditos por mes |

### Env vars relacionadas

# Quality
pnpm lint                 # Always from repo root
pnpm test                 # Full coverage

# Docker
pnpm docker-build
```

Area-specific commands (AI tests, catalog refresh, release scripts) live in the respective child `CLAUDE.md` files.

## Note on Language

This `CLAUDE.md` and all child `CLAUDE.md` files are written in **English** (better for AI agents). User-facing artifacts — `CHANGELOG.md`, `docs/`, translation files in `pt/translation.json`, UI strings via `useT()` — remain in pt-BR per project convention.

## References

- [`AGENTS.md`](AGENTS.md) — points to this file (single source of truth).
- [`docs/architecture/`](docs/architecture/) — detailed architecture (AI Provider, Instagram automations, AI persona, knowledge base).
- [`docs/planning/`](docs/planning/) — feature planning and PRDs.
- [`docs/operations/`](docs/operations/) — Docker release, deploy.
- [`CHANGELOG.md`](CHANGELOG.md) — change history.
- `.context/` — portable dotcontext (MCP, do not touch).
