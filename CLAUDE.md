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

### Traducoes (obrigatorio)

Todo texto visivel ao usuario no frontend **deve** usar o hook `useT()` de `@gitroom/react/translation/get.transation.service.client`:

```typescript
const t = useT();
// t('chave_unica', 'Texto fallback em ingles')
```

- **Nunca** usar strings hardcoded em JSX — sempre passar pelo `t()`
- Ao criar novas chaves, adicionar a traducao em **pt** (`libraries/react-shared-libraries/src/translation/locales/pt/translation.json`) e **en** (`locales/en/translation.json`)
- Manter as chaves em snake_case e descritivas (ex: `select_late_profile`, `failed_to_add_channel`)
- Os demais idiomas usam o fallback em ingles automaticamente

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

### TDD Obrigatorio (Test-Driven Development)

Toda nova feature, bug fix ou refactor **deve** seguir o ciclo TDD:

1. **RED** — Escrever o teste `.spec.ts` primeiro com o comportamento esperado (o teste deve falhar)
2. **GREEN** — Implementar o minimo de codigo para o teste passar
3. **REFACTOR** — Melhorar o codigo mantendo os testes verdes

#### Regras

- **Nunca** commitar codigo de producao sem o `.spec.ts` correspondente
- Testes devem ser co-localizados: `foo.service.ts` → `foo.service.spec.ts` (mesmo diretorio)
- Usar sempre `.spec.ts` (nao `.test.ts`)
- Rodar `pnpm test` antes de cada commit para garantir que nada quebrou

#### Utilitarios de teste (usar sempre)

Os helpers estao em `libraries/nestjs-libraries/src/test/`:

```typescript
import { createMock, createPrismaRepositoryMock, createTestModule } from '@gitroom/nestjs-libraries/test';
```

- `createMock<T>()` — mock de qualquer classe via jest-mock-extended (sem necessidade de interfaces)
- `createPrismaRepositoryMock('tableName')` — mock de `PrismaRepository<T>` com `model.[table]` mockado
- `createTestModule({ service, mocks })` — factory para NestJS TestingModule com mocks automaticos

#### Abordagem por camada

| Camada | O que testar | Como mockar |
|---|---|---|
| **Service** | Logica de negocio, branching, delegacao | `createMock<Repository>()` ou `createTestModule()` para muitas deps |
| **Repository** | Construcao de queries, transformacao de dados | `createPrismaRepositoryMock('table')` |
| **Controller** | Camada HTTP, extracao de params | `@nestjs/testing` com service mockado |
| **Social Provider** | Formatacao de posts, auth URLs, tratamento de erros | Instanciacao direta, `jest.spyOn` para HTTP |

#### Estrutura do teste

```typescript
describe('NomeClasse', () => {
  describe('nomeMetodo', () => {
    it('deve <comportamento esperado> quando <condicao>', async () => {
      // ARRANGE — preparar mocks e dados
      // ACT — executar o metodo
      // ASSERT — verificar resultado
    });
  });
});
```

#### Prioridade de cobertura

1. Services com logica de negocio (maior valor)
2. Social providers (isolados, sem DI)
3. Repositories com transformacao de dados
4. Controllers (menor prioridade — camada fina)

#### Comandos

```bash
pnpm test              # Todos os testes com coverage
pnpm test:watch        # Watch mode durante desenvolvimento
pnpm test:backend      # Apenas testes do backend
pnpm test:libs         # Apenas testes das libraries
```

#### Exemplos de referencia

- Service simples: `libraries/nestjs-libraries/src/database/prisma/sets/sets.service.spec.ts`
- Repository: `libraries/nestjs-libraries/src/database/prisma/sets/sets.repository.spec.ts`

### Document-First
Toda nova feature deve ter documentação escrita **antes ou em conjunto** com a implementação:
- Atualizar `docs/` antes de abrir PR
- PR sem documentação não deve ser mergeado

### API-First
Toda nova feature com interface de backend deve ter **contrato de API definido primeiro**:
- Definir endpoints, payloads e respostas antes de implementar
- A UI sempre consome a API, nunca o contrário
- Mudanças de contrato devem ser versionadas

### Changelog Incremental
Ao concluir uma tarefa que resulta em commit (feature, fix, refactor, etc.), **sempre atualize** a secao `## [Unreleased]` do `CHANGELOG.md` com uma entrada descritiva:
- Adicione na subcategoria correta: `### Adicionado`, `### Corrigido`, `### Alterado`, `### Removido`, `### Performance`, `### Documentacao`
- Crie a subcategoria se ela nao existir ainda dentro de `[Unreleased]`
- Escreva em portugues, sem acentos (compatibilidade de arquivos)
- Descreva o impacto para o usuario, nao o detalhe tecnico (ex: "Suporte a agendamento de Reels no Instagram" em vez de "Adicionar InstagramReelsProvider")
- Uma linha por mudanca; agrupar mudancas relacionadas do mesmo commit
- NAO incluir hash de commit (sera adicionado pelo `/changelog` na consolidacao)
- Se a mudanca for trivial (typo, ajuste interno sem impacto), nao adicionar entrada

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
- Releases estáveis são gerados a partir de `release`; pre-releases (RC/beta) são tags em `main`
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
