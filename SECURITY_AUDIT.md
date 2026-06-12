# Auditoria de Segurança — Robô MultiPost

> **Escopo:** SaaS multi-tenant (Next.js + NestJS + Temporal + Prisma/PostgreSQL + Redis, Docker Swarm).
> **Tipo:** Auditoria *read-first* — nenhum código de aplicação foi modificado.
> **Data:** 2026-06-12 · **Branch:** `claude/multipost-security-audit-6hktdq`
> **Método:** cada achado foi provado em `arquivo:linha` rastreando a cadeia Controller → Service → Repository (ou webhook/worker). Achados levantados por varredura automatizada que **não** sobreviveram à verificação manual foram rebaixados ou descartados e estão listados na seção [Falsos-positivos descartados](#falsos-positivos-descartados).

---

## Sumário executivo

| Severidade | Qtde | IDs |
|---|---|---|
| 🔴 Crítico | 2 | B1, E2* |
| 🟠 Alto | 8 | A1, A2, A3, B2, B3, B4, D1, D3, E1 |
| 🟡 Médio | 18 | A4, A5, B5, B6, B7, B8, C1, C2, C3, D2, D4, E3, E4, E5, E6, E7, E8, E9 |
| ⚪ Baixo | 11 | B9, C4, C5, C6, D5, D6, D7, D8, E10, E11a, E11b |

\* E2 é Crítico **condicional** — só se `NOT_SECURED` for setado em produção (foot-gun de baixa probabilidade, impacto crítico).

**Causa-raiz sistêmica:** a autorização a nível de objeto é **fail-open e opt-in**. O `PoliciesGuard` libera (`return true`) qualquer rota sem `@CheckPolicies` e, mesmo quando presente, só valida papel/assinatura — **nunca** ownership do objeto. O isolamento entre tenants depende inteiramente de o controller lembrar de passar `org.id`/`profile.id` ao service. Uma única omissão vira IDOR cross-tenant (achados A1–A4).

---

## 🏆 Quick Wins — top 5 (maior impacto, menor esforço)

| # | Achado | Esforço | Correção |
|---|---|---|---|
| 1 | **A1/A2/A3 — IDOR em flows-executions e profile-members** | Baixo | Injetar `@GetOrgFromRequest()` nos handlers e propagar `org.id` ao service/repo (`where: { id, organizationId }` / `flow: { organizationId }`). Padrão já usado nas rotas irmãs. |
| 2 | **C1 — SSRF por DNS rebinding em `/webhooks/send`** | Trivial (1 linha) | Adicionar `dispatcher: ssrfSafeDispatcher` ao `fetch` (`webhooks.controller.ts:66`), igual a `/public/stream` e uploads. |
| 3 | **E5 — Swagger exposto em produção** | Trivial | Envolver `loadSwagger(app)` (`main.ts:73`) num guard `if (!IS_GENERAL / NODE_ENV !== 'production')`. |
| 4 | **B2 — segredos gerados com `Math.random()`** | Baixo | Trocar `makeId` por `crypto.randomBytes` (base62/hex) nos geradores de `pos_`/`pca_`/`pcs_`/`apiKey`/`code` (`oauth.service.ts`, `organization.repository.ts`, `profile.repository.ts`). |
| 5 | **B3/B9 — JWT sem expiração e sem algoritmo fixado** | Baixo | `sign(payload, secret, { expiresIn: '..', algorithm: 'HS256' })` e `verify(token, secret, { algorithms: ['HS256'] })` (`auth.service.ts:42-46`). |

---

## Threat Model (resumo da Fase 0)

| Ativo | Ameaça | Onde | Achado |
|---|---|---|---|
| Tokens OAuth dos canais sociais | Leitura do banco → takeover das contas | `Integration.token` em texto claro | B1 |
| Sessão de usuário | Roubo de JWT eterno; sem revogação | `auth.service.ts`, cookie 1 ano | B3 |
| Recursos de outros tenants | IDOR/BOLA | `flows`/`profiles` controllers sem org | A1–A4 |
| Conta Instagram da vítima | Forja de webhook cross-tenant | pool global de segredos no HMAC | D1 |
| Credenciais (todas) | `ENCRYPTION_KEY` vazio → chave constante | `encryption.service.ts:13` | B4/E8 |
| Plano de controle de workflows | Temporal-UI sem auth no host | `docker-compose.yaml` | E3 |

---

## Achados detalhados (ordenados por severidade)

### 🔴 Crítico

#### B1 — Tokens OAuth dos canais sociais armazenados em texto claro
- **Arquivos:** `libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts:120`; `integration.repository.ts:251-305`; `schema.prisma:363`
- **Descrição:** `Integration.token` e `refreshToken` são gravados crus. Não há nenhuma chamada de cripto na cadeia service→repository (grep limpo em toda a pasta `integrations/`). A coluna `tokenEncrypted Boolean @default(false)` existe mas **nunca** é setada na criação. A feature de cifragem está documentada (`docs/planning/credenciais-por-workspace.md:444-446`) mas **não foi implementada**.
- **Impacto:** qualquer leitura do banco (backup vazado, insider, dump, ou um futuro bug na camada SQL) expõe os access/refresh tokens vivos de Facebook, Instagram, X, LinkedIn etc. de **todos** os tenants → takeover total das contas sociais conectadas. Contraste: credenciais de IA e de provider são AES-256-GCM — a lacuna é específica das colunas de token da `Integration`.
- **Correção:** cifrar com o `EncryptionService` (AES-256-GCM) na escrita e decifrar na leitura; migração única para os tokens existentes; setar `tokenEncrypted=true`.

#### E2 — `NOT_SECURED` em produção expõe a sessão (foot-gun)
- **Arquivos:** `apps/backend/src/main.ts:27,38`; `auth.controller.ts:74,84-86`; `users.controller.ts:133`
- **Descrição:** com `NOT_SECURED` setado, o JWT vai para cookie **não-httpOnly** *e* é ecoado em response header; cookies perdem `Secure`/`sameSite`; `impersonate` (token de troca de org de superadmin) fica legível por JS. É um único env var sem guarda — o `ConfigurationChecker` não alerta.
- **Impacto (se setado):** roubo trivial de sessão via XSS/sniffing, CSRF amplo, escalonamento via `impersonate`. Probabilidade baixa (destinado a dev), impacto crítico.
- **Correção:** abortar o boot se `NOT_SECURED` estiver setado e `NODE_ENV=production`; nunca expor `auth`/`impersonate` em headers.

---

### 🟠 Alto

#### A1 — IDOR: histórico de execução de flows acessível cross-tenant
- **Arquivos:** `apps/backend/src/api/routes/flows.controller.ts:195-211` → `flows.service.ts:1003-1016` → `flows.repository.ts:285-298`
- **Descrição:** `GET /flows/:id/executions` e `/:id/executions/:executionId` não injetam `@GetOrgFromRequest()`; service e repo só filtram `where: { id }` / `where: { flowId }`. (A rota irmã `getInstagramPosts`, logo acima, passa `org.id` corretamente — a omissão é por-rota.)
- **Impacto:** qualquer usuário autenticado lê o histórico de execução de flows de outra org — contém PII de usuários finais do Instagram (IDs, texto de comentários, conteúdo de DMs, estado do follow-gate).
- **Correção:** propagar `org.id` e filtrar via `flow: { organizationId }`.

#### A2 — IDOR: membros de perfil de qualquer org (vaza e-mails)
- **Arquivos:** `profiles.controller.ts:60-63` → `profile.service.ts:85` → `profile.repository.ts:140-142` (`where: { profileId }`)
- **Descrição:** `GET /profiles/:id/members` não passa org; retorna `id`/`email`/`name` dos membros.
- **Impacto:** enumeração de perfis + vazamento de PII (e-mails) entre tenants.
- **Correção:** validar que o `profileId` pertence à org do request antes de retornar.

#### A3 — IDOR de escrita: remover membros de perfil de outra org
- **Arquivos:** `profiles.controller.ts:74-81` → `profile.service.ts:72` → `profile.repository.ts:110-115`
- **Descrição:** `DELETE /profiles/:id/members/:userId` tem `@CheckPolicies(ADMIN)`, mas o guard só verifica que o chamador é admin **na própria org** (`req.org`); não valida que o `profileId` pertence a essa org. Como qualquer um pode criar a própria org e ser admin dela, o gate é trivial.
- **Impacto:** revoga o acesso de usuários legítimos de outra org (deleta as linhas `ProfileMember` de que o acesso deles deriva).
- **Correção:** validar ownership do `profileId` contra `org.id`.

#### B2 — Segredos bearer gerados com `Math.random()` (CWE-338)
- **Arquivos:** `libraries/nestjs-libraries/src/services/make.is.ts:7`; `oauth.service.ts:28,29,88,139`; `organization.repository.ts:24,162,269`; `profile.repository.ts:274`
- **Descrição:** `makeId` usa `Math.random()` (PRNG não-criptográfico, `xorshift128+`). Gera tokens de API pública (`pos_`+makeId(40)), `clientId`/`clientSecret` OAuth, `authorization code`, e `apiKey` de org/perfil. O estado do `Math.random` do V8 é recuperável a partir de saídas consecutivas, e cada `makeId` emite várias de uma vez (o `clientId` sai logo antes do `clientSecret` na mesma função).
- **Impacto:** previsão de tokens/segredos de API → bypass de autenticação na API pública e no MCP.
- **Correção:** usar `crypto.randomBytes`.

#### B3 — JWT sem expiração + cookie de 1 ano + sem revogação
- **Arquivos:** `libraries/helpers/src/auth/auth.service.ts:42-43`; `auth.controller.ts:72-82`; `users.controller.ts:281-324`
- **Descrição:** `signJWT` não define `expiresIn`; logout só limpa o cookie; não há `jti`/denylist/token-version. Cookie expira em 1 ano.
- **Impacto:** um JWT vazado é válido indefinidamente; logout não invalida a sessão server-side.
- **Correção:** `expiresIn` curto + refresh token; denylist em Redis no logout.

#### B4 — `JWT_SECRET` reusado como chave de cripto; fallback inseguro do `ENCRYPTION_KEY`
- **Arquivos:** `libraries/nestjs-libraries/src/crypto/encryption.service.ts:13`; `libraries/helpers/src/auth/auth.service.ts:23,30`
- **Descrição:** a chave-mestra AES-256-GCM é `process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || ''`. Se `ENCRYPTION_KEY` não estiver setado, a confidencialidade das credenciais passa a depender do segredo de **assinatura de sessão**; se ambos faltarem, a chave vira `SHA256('')` — constante pública. O `JWT_SECRET` também deriva a chave da cripto CBC legada (via MD5).
- **Impacto:** acoplamento de domínios de segredo; comprometer um derruba todos. Default vazio (E8) torna a cripto inútil.
- **Correção:** exigir `ENCRYPTION_KEY` independente e não-vazio; abortar boot se ausente.

#### D1 — Forja cross-tenant de webhook do Instagram
- **Arquivos:** `apps/backend/src/api/routes/ig-webhook.controller.ts:361-375,405-422`; dispatch `149-156,297`
- **Descrição:** `verifySignature` agrupa os segredos de **todos** os workspaces (`findAllDecrypted('facebook')`, sem escopo de org) como assinantes válidos e aceita o evento se a assinatura casar com **qualquer** candidato. O despacho é feito pelo `igAccountId` vindo do corpo do request.
- **Impacto:** um tenant (admin da própria org) seta seu próprio `instagramAppSecret`, monta um corpo com o `igAccountId` público da vítima, assina com seu segredo e POSTa → dispara o **flow da vítima**, comandando a conta Instagram dela (DMs/replies a destinatários escolhidos, consumo de postbacks, poluição de inbox). O HMAC deixa de provar "veio da Meta".
- **Correção:** validar a assinatura **apenas** contra o(s) segredo(s) da org dona do `igAccountId` recebido.

#### D3 — Token na URL nos endpoints MCP/SSE (CWE-598)
- **Arquivos:** `libraries/nestjs-libraries/src/chat/start.mcp.ts:189-270`
- **Descrição:** `/mcp/:id`, `/sse/:id`, `/message/:id` autenticam pelo path param (`req.params.id` → `resolveAuth`). Todas as rotas MCP setam `Access-Control-Allow-*: *`.
- **Impacto:** o token (API key / `pos_`) vaza em logs de nginx/proxy, histórico do navegador e header `Referer`. Compõe com B2 (tokens previsíveis).
- **Correção:** exigir `Authorization: Bearer` (como já faz a rota `/mcp`); nunca aceitar credencial no path.

#### E1 — Container roda como root
- **Arquivo:** `Dockerfile.dev:15-18,31`
- **Descrição:** o usuário `www` é criado mas não há `USER www`; o `CMD` roda `nginx` + `pm2` (backend/frontend/orchestrator) como root. O `user www;` do nginx.conf só dropa workers do nginx.
- **Impacto:** comprometer qualquer processo do app = root dentro do container.
- **Correção:** `USER www` após o build (ou dropar privilégios via pm2/su-exec); ajustar permissões.

---

### 🟡 Médio

#### A4 — IDOR de escrita: adicionar membros a perfil de outra org
- **Arquivos:** `profiles.controller.ts:65-72` → `profile.service.ts:68` → `profile.repository.ts:100-106`
- **Descrição:** mesmo padrão de A3 (sem validação de ownership do `profileId`). **Não** concede acesso em runtime — o `showprofile` é org-gated (`auth.middleware.ts:116-123`) — mas polui a membership e pode adicionar usuários arbitrários.
- **Correção:** validar `profileId` contra `org.id`.

#### A5 — Cache Redis sem namespace de org
- **Arquivos:** `libraries/nestjs-libraries/src/database/prisma/flows/unmatched-comment.service.ts:161,264`
- **Descrição:** a chave `ig:media:{igMediaId}:metadata` não inclui orgId; o mesmo `igMediaId` em orgs distintas colide.
- **Impacto:** vazamento de metadados de mídia entre tenants via cache.
- **Correção:** prefixar a chave com `orgId`.

#### B5 — Sem rate limiting nos endpoints de autenticação
- **Arquivos:** `apps/backend/src/app.module.ts` (throttler global só cobre `/public/v1/posts`); `auth.controller.ts`
- **Descrição:** `/auth/login`, `/auth/register`, `/auth/forgot`, `/auth/forgot-return`, `/auth/oauth/:provider/exists` não têm `@Throttle`.
- **Impacto:** brute-force de senha, enumeração de e-mail, força bruta em token de reset.
- **Correção:** `@Throttle` por IP nas rotas de auth.

#### B6 — Token de reset de senha é multi-uso
- **Arquivo:** `apps/backend/src/services/auth/auth.service.ts:232-242`
- **Descrição:** validado só por expiração (20 min); não invalidado após uso.
- **Impacto:** dentro da janela, o mesmo token reseta a senha repetidamente.
- **Correção:** marcar token como usado (Redis/coluna) ou versionar.

#### B7 — Enumeração de e-mails
- **Arquivos:** `auth.service.ts:265-286`; `auth.controller.ts:239-252`
- **Descrição:** `/auth/resend-activation` e `/auth/oauth/:provider/exists` retornam mensagens distintas para e-mail existente vs. inexistente.
- **Correção:** respostas genéricas + rate limit.

#### B8 — Cripto legada AES-256-CBC com chave derivada por MD5
- **Arquivos:** `libraries/helpers/src/auth/auth.service.ts:9-34`; usada em `organization.repository.ts:24`, `oauth.service.ts:89`
- **Descrição:** `fixedEncryption`/`EVP_BytesToKey` (MD5) cifram `apiKey` de org/perfil e o `code` OAuth em repouso.
- **Correção:** migrar para AES-256-GCM (`EncryptionService`).

#### C1 — SSRF por DNS rebinding em `/webhooks/send`
- **Arquivo:** `apps/backend/src/api/routes/webhooks.controller.ts:66`
- **Descrição:** o DTO `@IsSafeWebhookUrl` resolve DNS e bloqueia IPs privados na validação, mas o `fetch` re-resolve no envio sem pin de IP (não usa `ssrfSafeDispatcher`). Vetor: rebinding. É **cego** (resposta descartada) e **só-HTTPS**.
- **Correção:** adicionar `dispatcher: ssrfSafeDispatcher` (quick win #2).

#### C2 — Stored XSS same-org em notificações
- **Arquivo:** `apps/frontend/src/components/notifications/notification.component.tsx:10-17,35`
- **Descrição:** `replaceLinks(notification.content)` injeta HTML sem sanitização; parte do conteúdo embute campos editáveis pelo usuário (nome/nickname de canal).
- **Impacto:** membro de baixo privilégio → admin da mesma org.
- **Correção:** sanitizar com DOMPurify (como `sanitizePostContent`).

#### C3 — XSS no chat de IA via prompt-injection
- **Arquivo:** `apps/frontend/src/components/agents/agent.chat.tsx:213-234`
- **Descrição:** renderiza a saída por regex embutindo `${p1}` cru; o app faz web-search e ingere comentários do IG, que a IA pode ecoar como HTML. Sem CSP para mitigar.
- **Correção:** sanitizar antes do `dangerouslySetInnerHTML`; adicionar CSP (E6).

#### D2 — HMAC do webhook IG falha-aberto
- **Arquivo:** `apps/backend/src/api/routes/ig-webhook.controller.ts:381-396`
- **Descrição:** sem segredo configurado → `return` silencioso; `SKIP_IG_WEBHOOK_HMAC=true` → `return`. Em ambos, o processamento prossegue sem validação.
- **Correção:** falhar fechado em produção; nunca permitir skip com `NODE_ENV=production`.

#### D4 — Sem rate limit na autenticação do MCP
- **Arquivo:** `libraries/nestjs-libraries/src/chat/start.mcp.ts`
- **Descrição:** rotas registradas via `app.use` antes do pipeline Nest, fora do `ThrottlerGuard`. Cada request faz lookup no banco.
- **Impacto:** DoS; amplifica D3.
- **Correção:** throttle por IP nas rotas MCP.

#### E3 — Temporal e Spotlight publicados no host sem auth
- **Arquivo:** `docker-compose.yaml:280-281,325-326,238-239`
- **Descrição:** `temporal:7233` (gRPC), `temporal-ui:8080`, `spotlight:8969` mapeados para o host; `TEMPORAL_API_KEY`/`TLS` comentados.
- **Impacto:** quem alcança o host lê/termina workflows de todos os tenants pela UI 8080.
- **Correção:** não publicar essas portas; auth/TLS no Temporal; remover Spotlight do compose de produção.

#### E4 — `.env` ausente do `.dockerignore`
- **Arquivos:** `.dockerignore`; `Dockerfile.dev:25` (`COPY . /app`)
- **Impacto:** um `.env` no contexto de build é assado na imagem publicada.
- **Correção:** adicionar `.env` e `.env.*` (exceto `.example`) ao `.dockerignore`.

#### E5 — Swagger exposto sem auth em produção
- **Arquivos:** `apps/backend/src/main.ts:73`; `libraries/helpers/src/swagger/load.swagger.ts:31`
- **Impacto:** expõe toda a superfície de API, DTOs e esquema de auth para recon.
- **Correção:** guard por `NODE_ENV` (quick win #3).

#### E6 — Ausência de `helmet`/headers de segurança no app
- **Arquivos:** `apps/backend/src/main.ts:23-46`; `var/docker/nginx.conf:20-37,56-71`
- **Descrição:** sem CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy. O nginx só protege `/uploads/`.
- **Impacto:** clickjacking, sem HSTS, sem defense-in-depth para XSS (compõe com C2/C3).
- **Correção:** `helmet` no backend e/ou `add_header` no nginx para todas as rotas.

#### E7 — Dependências com vulnerabilidades conhecidas
- **Evidência:** `pnpm audit` → 114 vulns (2 crit, 18 high, 84 mod, 10 low). As 2 críticas são dev-only (`vitest` UI, `shell-quote` de build); as altas são majoritariamente transitivas (mastra/opentelemetry/telegram) de classe DoS/ReDoS.
- **Correção:** `pnpm audit` no CI; bump das dependências de runtime.

#### E8 — Defaults perigosos no compose
- **Arquivo:** `docker-compose.yaml:11,187`
- **Descrição:** `JWT_SECRET` com placeholder e `ENCRYPTION_KEY: ''` vazio. Se não trocados → forja de JWT trivial e chave AES = `SHA256('')` (liga com B4).
- **Correção:** gerar segredos no deploy; o `ConfigurationChecker` deve validar força e presença de `ENCRYPTION_KEY` e abortar se inseguro.

#### E9 — Secrets via env vars em texto plano (não Docker secrets)
- **Arquivo:** `docker-compose.yaml:6-187`
- **Impacto:** legíveis via `/proc`, `docker inspect`, contexto Sentry.
- **Correção:** usar `secrets:` do Docker Swarm.

---

### ⚪ Baixo

| ID | Achado | Arquivo:linha |
|---|---|---|
| B9 | `verifyJWT` não fixa `algorithms` (defense-in-depth; sem caminho de chave pública hoje) | `auth.service.ts:45-46` |
| C4 | Self-XSS nos previews de provider (Reddit sem sanitização; demais via `stripHtmlValidation`) — só no editor autenticado, não alcança a página pública | `reddit.provider.tsx:41`, `*.preview.tsx` |
| C5 | Mass-assignment latente — `ValidationPipe` global sem `whitelist`; `updateIntegration` espalha `...params` | `main.ts:50-54`, `integration.repository.ts:189` |
| C6 | Blocklist IPv6 link-local incompleto (`startsWith('fe80:')` não cobre `fe80::/10`) | `webhook.url.validator.ts:36` |
| D5 | Token usado como `requestId` no `runWithContext` (risco de log) | `start.mcp.ts:173,217` |
| D6 | Verify token padrão `'multipost'` hardcoded (só verificação GET) | `ig-webhook.controller.ts:21,46` |
| D7 | `AGENT_API_KEY` comparado com `!==` (não timing-safe) | `public.controller.ts:68` |
| D8 | APIs públicas sem `@Throttle` em upload/delete (fallback global aplica) | `public.integrations.controller.ts` |
| E10 | `register`/`login`/`resend-activation` retornam `e.message` cru | `auth.controller.ts:111-113,175-177,246-251` |
| E11a | CORS inclui `localhost:6274` sempre (com credentials) | `main.ts:42` |
| E11b | `prisma db push --accept-data-loss` a cada boot; `sameSite:'none'` sem token CSRF | `package.json:34`, `auth.controller.ts` |

---

## ✅ Verificado seguro (controles que funcionam)

- **Impersonation** gated em `isSuperAdmin` re-buscado do banco (`auth.middleware.ts:64`); `showorg`/`showprofile` validados por pertencimento.
- **`PoliciesGuard`** corretamente registrado como `APP_GUARD` global (não é no-op) — mas é fail-open por design (ver causa-raiz).
- **SSRF em `/public/stream`, upload por URL e AI web search**: validador (resolve DNS, bloqueia IPv4-mapped IPv6, CGNAT, multicast) + `ssrfSafeDispatcher` (pin de IP) + re-validação de redirects.
- **SQL injection**: nenhuma — só Prisma ORM; o único `$executeRawUnsafe` usa strings estáticas.
- **Command injection**: nenhum `exec`/`spawn`/`eval` com input.
- **Ordem do HMAC do IG**: validado e lançado **antes** de qualquer efeito colateral (`ig-webhook.controller.ts:80`).
- **Replay/idempotência do webhook**: `markMetaMidIfUnconsumed` (updateMany atômico) + `findExistingExecution`.
- **Per-profile scoping da API pública**: rejeita `?profileId` ≠ chave com 403.
- **XSS na página pública `/p/[id]`**: `sanitizePostContent` = DOMPurify com whitelist.
- **Credenciais de IA e de provider**: sempre AES-256-GCM.
- **Sem segredos hardcoded** e **nenhum `.env` versionado** (nem no histórico).
- **Postgres/Redis não publicados no host** no compose de produção; imagens base fixadas.

---

## Falsos-positivos descartados

Achados levantados pela varredura automatizada que **não** sobreviveram à verificação manual:

| Alegação | Veredito | Razão |
|---|---|---|
| `/webhooks/send` é SSRF aberto | Rebaixado → C1 (Médio) | O DTO `@IsSafeWebhookUrl` resolve DNS e bloqueia IPs privados; resta só rebinding, cego e HTTPS-only. |
| `/media/video/function` é não-autenticado | Descartado | `MediaController` está no `authenticatedController` (`api.module.ts:66`). |
| `getMediaById`/`getAutopost`/postbacks são IDOR HTTP | Rebaixado → dívida de defense-in-depth | Só alcançáveis via workflow Temporal org-scoped ou já validados no service; não via HTTP. |
| JWT vulnerável a alg-confusion RS256 (Crítico) | Rebaixado → B9 (Baixo) | Sem caminho de verificação com chave pública; ambos os lados usam o segredo simétrico. |
| Preview do Reddit é stored-XSS (Alto) | Rebaixado → C4 (Baixo) | A página pública usa DOMPurify; previews só no editor autenticado (self-XSS). |
| Forja cross-tenant do webhook IG é "safe" | **Elevado → D1 (Alto)** | A varredura concluiu seguro; a leitura de `verifySignature` provou o pool global de segredos. |
| Brute-force de API key no MCP (Crítico) | Rebaixado → D4 (Médio, DoS) | Entropia dos tokens inviabiliza adivinhação; risco real é DoS. |

---

## Metodologia

Auditoria conduzida em 6 fases (recon/threat-model → controle de acesso → autenticação/OAuth → injeção/SSRF → webhooks/MCP → config/deps), com varredura automatizada **sempre seguida de verificação manual no código-fonte** antes de afirmar cada achado. Severidade atribuída pelo impacto real no contexto multi-tenant, não pela teoria. Regras Semgrep para os padrões recorrentes estão em [`.semgrep/`](.semgrep/).
