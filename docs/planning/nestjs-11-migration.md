# Migração NestJS 10 → 11 — Plano

> **Status:** planejamento (terreno preparado). Criado em 2026-06-07.
> Item #5 da fila de sync do upstream Postiz (`38b0ac8`). Não aplicar via
> cherry-pick — é um bump de major; seguir este plano.

## Objetivo e escopo

Subir todo o ecossistema NestJS de **v10 → v11** no monorepo (backend, orchestrator
e libraries compartilhadas). É um **major** com mudanças de runtime (Express 5),
então **build dos 3 apps + testes + smoke test com a app rodando** são obrigatórios —
`test:libs` (ts-jest) NÃO pega erro de boot.

## 1. Matriz de versões (atual → alvo)

| Pacote | Atual | Alvo (Nest 11) | Observação |
|---|---|---|---|
| `@nestjs/common` | ^10.0.2 | **^11** | core |
| `@nestjs/core` | ^10.0.2 | **^11** | core |
| `@nestjs/platform-express` | ^10.0.2 | **^11** | **traz Express 5** |
| `@nestjs/testing` | ^10.0.2 | **^11** | |
| `@nestjs/microservices` | ^10.3.1 | **^11** | **não é importado em lugar nenhum** — bumpar junto ou remover |
| `@nestjs/cli` | 10.0.2 | **^11** | devDep |
| `@nestjs/schematics` | ^10.0.1 | **^11** | devDep |
| `@nestjs/swagger` | ^7.3.0 | **^11.4** | ⚠️ maior salto (peer exige `@nestjs/common ^11.0.1`) |
| `@nestjs/schedule` | ^4.0.0 | **^6** | peer aceita `^10 || ^11` |
| `@nestjs/throttler` | ^6.3.0 | **^6.5** | peer já inclui `^11` |
| `reflect-metadata` | ^0.1.13 | **^0.2** | recomendado pelo Nest 11 |
| `rxjs` | ^7.8.0 | (manter ^7.8) | Nest 11 suporta rxjs 7 |
| Node.js | 22 (Docker/CI) | ✅ já OK | Nest 11 exige **≥ 20** |

## 2. Breaking changes 10→11 × blast radius no fork

| Breaking change (oficial) | Afeta o fork? | Onde / Mitigação |
|---|---|---|
| **Express 5: wildcard `*` precisa de nome** (`/*` → `/*splat`) | ⚠️ **1 ponto** | `apps/backend/src/main.ts:56` — `app.use(['/copilot/*', '/posts'], …)`. Trocar `'/copilot/*'` por `'/copilot/{*splat}'` (ou regex). As rotas MCP (`/mcp/:id`, `/sse/:id`) usam `:param` — **ok**. `forRoutes(...controllers)` usa classes — **ok**. |
| **Express 5: query parser `simple` por padrão** (sem nested/arrays) | 🟡 baixo | 12 usos de `@Query()`, todos com DTOs **planos** (ex. `startDate`/`endDate`/`page`). Mitigação à prova de bala: `app.set('query parser', 'extended')` no `main.ts` (preserva o `qs` atual, risco zero). |
| **Reflector: `getAllAndOverride` → `T \| undefined`, `getAllAndMerge` → objeto** | ✅ não | `permissions.guard.ts` usa só `reflector.get<>()` — assinatura inalterada. |
| **Cache module: agora via Keyv** | ✅ não | Não usamos `@nestjs/cache-manager` (usamos `ioredis` direto). |
| **ConfigModule: precedência/validação** | ✅ não | Não usamos `@nestjs/config` (usamos `dotenv`/`process.env`). |
| **Ordem de middleware: módulo global executa primeiro** | 🟡 verificar | `AuthMiddleware`/`PublicAuthMiddleware` (api/public-api modules). Conferir que nada depende da ordem relativa atual. |
| **Lifecycle: `OnModuleDestroy` em ordem reversa** | 🟡 baixo | `StartupMigrationService` usa `OnModuleInit` (idempotente). Sem dependência crítica de ordem de destroy. |
| **Resolução de módulo por referência (hash mudou)** | 🟡 testes | Pode afetar testes que dependem de hash de módulo dinâmico — improvável aqui (usamos `createTestModule`/mocks). |
| **Node ≥ 20** | ✅ já | Imagem em Node 22.20 (após o fix do crash). |
| **@nestjs/swagger 7→11** | ⚠️ **alto** | Muita anotação (`@ApiProperty`, `@ApiOperation`, `@ApiResponse`, `@ApiBody`) + a doc Swagger nova (`/docs`, public API). Swagger 11 tem mudanças próprias (enums, tipos, `@ApiProperty` inference). **Validar `/docs` renderizando após o bump.** |

## 3. Plano de migração (ordem)

1. **Branch** dedicada: `chore/nestjs-11`.
2. **Bump das deps** (package.json) conforme a matriz; `pnpm install` (rebase de lockfile).
3. **Express 5:** corrigir `/copilot/*` → `/copilot/{*splat}` e adicionar
   `app.set('query parser', 'extended')` no `main.ts`.
4. **Swagger 11:** `pnpm build:backend` e abrir `/docs` — corrigir qualquer
   anotação quebrada (foco nos controllers public-api + os que documentamos).
5. **Compilar tudo:** `pnpm build:backend`, `pnpm build:frontend`,
   `pnpm build:orchestrator` — exit 0 nos três.
6. **Testes:** `pnpm test:libs` + `pnpm test:backend` verdes.
7. **Smoke test com a app rodando** (`pnpm dev` ou imagem RC): login, listar canais,
   agendar post, criar/listar flow, `/docs` abrindo, e os logs do orchestrator sem
   erro de boot (atenção ao `@sentry/profiling-node`, que já mordeu no Node 26).
8. **RC** (`new-release rc`) para validar a imagem antes de promover.

## 4. Validação (gates)

- [ ] `pnpm build:backend` exit 0
- [ ] `pnpm build:frontend` exit 0
- [ ] `pnpm build:orchestrator` exit 0
- [ ] `pnpm test:libs` + `pnpm test:backend` verdes
- [ ] `/docs` (Swagger) renderiza e mostra a Public API
- [ ] Smoke runtime: backend + orchestrator sobem sem `MODULE_NOT_FOUND`; login, post, flow funcionam
- [ ] Imagem RC sobe limpa (pm2: 3 processos `online` estáveis)

## 5. Rollback

É um bump isolado numa branch. Se algo falhar: não mergear; `git checkout main`.
Se já tiver mergeado e a imagem quebrar, reverter o PR e cortar nova RC (mesmo
padrão do fix do Node 26). Preservar `ENCRYPTION_KEY` (sem relação, mas regra geral).

## 6. Riscos / pontos de atenção

1. **Swagger 11** é o item mais provável de exigir ajustes (anotações). Reservar
   tempo para revisar `/docs`.
2. **Express 5** muda matching de rota — além do `/copilot/*`, conferir no smoke
   test qualquer 404 inesperado em rotas com params/curingas.
3. **`@nestjs/microservices`** é dep órfã (não importada) — bumpar junto para não
   travar peer, ou removê-la (PR à parte).
4. **Não diluir** com a cadeia de workflow V103→V105 (épico separado) nem com os
   fixes de provider — manter o PR do NestJS 11 focado só no bump.
5. Rodar **`build:backend` de verdade** antes de declarar pronto (lição do crash de
   boot: testes não pegam erro de runtime/peer).

## Referências
- Guia oficial: https://docs.nestjs.com/migration-guide
- Triagem do upstream: [`upstream-sync-triage-2026-06.md`](./upstream-sync-triage-2026-06.md) (item #5)
- Commit upstream correspondente: `38b0ac8` (update nestjs)
