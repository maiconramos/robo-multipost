# Robô MultiPost — Instruções para Claude Code

Este projeto é o **Robô MultiPost**, um fork do [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0), adaptado para a comunidade Automação Sem Limites. É um scheduler de redes sociais self-hosted com suporte a 33+ canais, agendamento via calendário, analytics, biblioteca de mídia e integração com IA.

## Stack Principal

- **Backend:** NestJS (TypeScript) — `apps/backend`
- **Frontend:** Next.js 14 + React 18 + Tailwind CSS 3 — `apps/frontend`
- **Orchestrator:** NestJS + Temporal.io (jobs em background) — `apps/orchestrator`
- **ORM:** Prisma + PostgreSQL
- **Package manager:** PNPM (monorepo) — **nunca use npm ou yarn**
- **IA:** Mastra framework + MCP (Model Context Protocol)

## Estrutura do Monorepo

```
apps/
  backend/       ← API REST (NestJS)
  frontend/      ← UI (Next.js 14 + React 18)
  orchestrator/  ← Temporal workflows e activities (NestJS)
  extension/     ← Browser extension
  cli/           ← CLI tool (publicado como `postiz` no npm)
  sdk/           ← SDK Node.js (publicado como `@postiz/node`)
  commands/      ← Microserviço de comandos background

libraries/
  nestjs-libraries/      ← Código compartilhado backend/orchestrator
    integrations/social/ ← 33 providers de redes sociais
    database/prisma/     ← Schema Prisma + migrações
    chat/                ← Agentes e MCP tools
  react-shared-libraries/ ← Código compartilhado frontend
    translation/locales/ ← 17 idiomas (pt, en, es, fr, de, it, ru, tr, ja, ko, zh, vi, bn, ar, he, ka_ge)
  helpers/               ← Utilitários gerais
```

## Arquitetura Backend (obrigatório seguir)

A camada de backend segue rigorosamente:

```
Controller >> Service >> Repository
```

Em alguns casos com manager:

```
Controller >> Manager >> Service >> Repository
```

- **Nunca** fazer shortcut entre camadas
- A lógica de negócio vive em `libraries/nestjs-libraries/src/`
- O backend (`apps/backend`) é usado principalmente para controllers e imports de libs

## Frontend

- Componentes UI reutilizáveis: `/apps/frontend/src/components/ui`
- Roteamento: `/apps/frontend/src/app`
- Componentes de feature: `/apps/frontend/src/components`
- **Sempre usar SWR** para buscar dados, com o hook `useFetch` de `/libraries/helpers/src/utils/custom.fetch.tsx`

### Regra obrigatória de SWR

Cada hook SWR deve estar em um hook separado, cumprindo `react-hooks/rules-of-hooks`. **Nunca** usar `eslint-disable-next-line`.

**Válido:**
```typescript
const useCommunity = () => {
  return useSWR....
}
```

**Inválido:**
```typescript
const useCommunity = () => {
  return {
    communities: () => useSWR<CommunitiesListResponse>("communities", getCommunities),
    providers: () => useSWR<ProvidersListResponse>("providers", getProviders),
  };
}
```

### Tailwind e estilos

Antes de escrever qualquer componente, verificar:
- `/apps/frontend/src/app/colors.scss`
- `/apps/frontend/src/app/global.scss`
- `/apps/frontend/tailwind.config.js`

As variáveis `--color-custom*` estão **depreciadas** — não usar. Verificar outros componentes do sistema para manter consistência de design.

**Nunca instalar componentes frontend do npmjs** — escrever componentes nativos.

## Linting

O linting só pode rodar a partir da raiz do projeto:

```bash
pnpm lint
```

## Princípios de Desenvolvimento

### Document-First
Toda nova feature deve ter documentação escrita **antes ou em conjunto** com a implementação:
- Atualizar `docs/` antes de abrir PR
- PR sem documentação não deve ser mergeado

### API-First
Toda nova feature com interface de backend deve ter **contrato de API definido primeiro**:
- Definir endpoints, payloads e respostas antes de implementar
- A UI sempre consome a API, nunca o contrário
- Mudanças de contrato devem ser versionadas

## Estratégia Git (GitLab Flow)

### Branches

| Branch | Papel |
|---|---|
| `postiz` | Espelho limpo do upstream oficial — **nunca commitar customizações aqui** |
| `main` | Desenvolvimento e customizações do Robô MultiPost |
| `release` | Versão estável para produção — imagem Docker é gerada daqui |

### Remotes

| Remote | URL |
|---|---|
| `origin` | `https://github.com/maiconramos/robo-multipost` |
| `upstream` | `https://github.com/gitroomhq/postiz-app` |

### Regras

- Todo código customizado vai para `main`
- `release` só recebe merge de `main` quando testado e aprovado
- A imagem Docker é sempre gerada a partir de `release`, nunca de `main`
- Toda promoção `main` → `release` deve gerar uma tag semântica (ex: `v1.2.0`)
- Features grandes: criar branch `custom/nome-da-feature` a partir de `main`
- Features pequenas: podem ir direto em `main`

### Versionamento SemVer

| Tipo | Incrementa | Exemplo |
|---|---|---|
| Update do upstream Postiz | `MINOR` | `v1.1.0` → `v1.2.0` |
| Nova feature customizada | `MINOR` | `v1.2.0` → `v1.3.0` |
| Correção de bug | `PATCH` | `v1.2.0` → `v1.2.1` |
| Breaking change | `MAJOR` | `v1.2.0` → `v2.0.0` |

## Comandos Úteis

```bash
# Desenvolvimento
pnpm dev                  # Todos os apps em paralelo
pnpm dev-backend          # Backend + frontend

# Build
pnpm build                # Build completo
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

## Contexto de Produto

- **Idioma padrão:** pt-BR (arquivo de tradução `pt` já existe em `react-shared-libraries/src/translation/locales/`)
- **Branding:** "Robô MultiPost" (fork do Postiz, créditos mantidos por exigência da AGPL)
- **Integração Late:** TikTok e Pinterest via [Late API](https://docs.getlate.dev/llms-full.txt) como provedor alternativo
- **Billing:** desabilitado por padrão para self-hosted (`DISABLE_BILLING=true`)
- **Marketplace:** desabilitado por padrão (`DISABLE_MARKETPLACE=true`)
- **Storage:** local por padrão, Cloudflare R2 como opção avançada
- **IA:** infraestrutura Mastra + MCP já existe — trabalho é configurar providers por workspace

## Serviços Obrigatórios em Produção

O produto requer 5 serviços rodando:
1. App (backend + frontend)
2. PostgreSQL 17
3. Redis 7
4. **Temporal** (orquestrador de workflows — crítico para agendamento)
5. Nginx (reverse proxy)
