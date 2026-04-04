# Plano de Hardening de Segurança — Robô MultiPost

> **Contexto:** auditoria de segurança realizada em 2026-04-04 identificou 40+ vulnerabilidades (6 críticas, 14 altas, 20+ médias/baixas). Este documento organiza as correções em **ondas de implementação**, das mais críticas às opcionais, **sem introduzir breaking changes** para instalações self-hosted em produção.
>
> **Princípios norteadores:**
> 1. **Backward-compatible:** toda mudança de env var ou schema tem default seguro que preserva comportamento atual
> 2. **Feature flags:** funcionalidades novas de segurança ficam OPT-IN via env var até estabilizarem
> 3. **Migrações idempotentes:** qualquer migração de dados é re-executável sem efeitos colaterais
> 4. **Validação em cada etapa:** cada onda tem testes automatizados + checklist manual
> 5. **Release incremental:** uma onda por release patch/minor, com changelog claro

---

## Índice de Ondas

| Onda | Tema | Severidade | Breaking? | Release |
|------|------|------------|-----------|---------|
| 1 | Webhook Instagram + credenciais expostas | Crítica | Não | patch |
| 2 | IDOR em recursos customizados (flows) | Crítica | Não | patch |
| 3 | IDOR em recursos core (integrations, webhooks, profiles) | Crítica | Não | minor |
| 4 | Validação de input (DTOs + sanitização) | Alta | Não | minor |
| 5 | Security headers + CORS hardening | Alta | Não | minor |
| 6 | Rate limiting granular em auth | Alta | Não | patch |
| 7 | Encryption key + rotação de credenciais | Alta | Migração | minor |
| 8 | JWT lifecycle + session revocation | Média | Opt-in | minor |
| 9 | Audit log + observabilidade | Média | Aditivo | minor |
| 10 | Refinamentos opcionais | Baixa | Não | patch |

---

## Onda 1 — Contenção imediata (CRÍTICA)

**Objetivo:** parar sangramentos ativos. Zero impacto funcional.

### 1.1 Rotacionar credenciais expostas
**Ação do operador (não é código):**
- Trocar `JWT_SECRET`, `OPENAI_API_KEY`, `CLOUDFLARE_*`, `ELEVENSLABS_API_KEY`, `FAL_KEY`, `KIEAI_API_KEY`, `TRANSLOADIT_SECRET` nos painéis dos provedores
- Remover `.env` do histórico git com `git filter-repo --path .env --invert-paths`
- Force-push para `origin` após comunicação com contribuidores
- Adicionar `.env` ao `.gitignore` (já está) e criar `.env.example` sem valores reais

**Checklist:**
- [ ] Todas as chaves rotacionadas nos dashboards dos provedores
- [ ] `.env` removido do histórico de todas as branches
- [ ] Comunicado enviado à equipe sobre re-clone necessário
- [ ] CI atualizado com novas credenciais nos secrets do GitHub

### 1.2 Corrigir webhook Instagram (fail-closed + raw body)
**Arquivos:**
- `apps/backend/src/api/routes/ig-webhook.controller.ts`
- `apps/backend/src/main.ts` (body parser raw para a rota do webhook)

**Mudanças:**
1. Configurar `express.raw({ type: 'application/json' })` **apenas** para `POST /public/ig-webhook` no `main.ts`
2. `verifySignature`: se `FACEBOOK_APP_SECRET` ausente, lançar `ServiceUnavailableException` (503) em vez de retornar silenciosamente
3. Calcular HMAC sobre `req.rawBody: Buffer` capturado pelo parser
4. Substituir `token === verifyToken` por `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(verifyToken))`

**Compatibilidade:** operadores que não configurarem `FACEBOOK_APP_SECRET` verão 503 em vez de aceitação silenciosa — **isto é a correção desejada**. Adicionar nota no CHANGELOG.

**Testes:**
- `ig-webhook.controller.spec.ts`:
  - Assinatura válida → 200
  - Assinatura inválida → 403
  - Sem `FACEBOOK_APP_SECRET` → 503
  - Body raw preservado ao calcular HMAC (teste com payload com caracteres Unicode)
  - `verify_token` com tamanhos diferentes não crasha `timingSafeEqual`

### 1.3 Remover vazamento de API key em social-connect
**Arquivo:** `apps/backend/src/api/routes/no.auth.integrations.controller.ts:279`

**Mudança:** remover `apiKey: org.apiKey` do payload JWT enviado ao webhook externo. Se o callback realmente precisa autenticar de volta, usar um token de sessão curto e específico (ex: JWT de 5min com escopo `integration:callback`).

**Testes:**
- Mock do `fetch` e assert de que `apiKey` nunca aparece no body
- JWT de callback valida apenas claims mínimas necessárias

### 1.4 Proteger `/webhooks/send`
**Arquivo:** `apps/backend/src/api/routes/webhooks.controller.ts:64`

**Mudança:** adicionar `@UseGuards(AuthService)` no endpoint, recebendo `@GetOrgFromRequest()` e validando que a URL de destino pertence a um webhook previamente cadastrado pela organização.

**Compatibilidade:** se houver integração externa dependendo deste endpoint (improvável — tem nome genérico), manter versão legacy por 1 release com deprecation warning. Auditar logs antes de remover.

**Testes:**
- Request sem auth → 401
- Request com auth mas URL fora da whitelist da org → 403
- Request válido → dispara fetch mockado

### Validação da Onda 1
```bash
pnpm test -- --testPathPattern="ig-webhook|webhooks|no.auth.integrations"
pnpm lint
# Smoke test manual: webhook IG real com conta sandbox
```

---

## Onda 2 — IDORs em código customizado (CRÍTICA)

**Objetivo:** blindar as rotas novas do fork (flows/automações). Escopo pequeno e auto-contido.

### 2.1 Escopo de organização em `getExecutions`
**Arquivos:**
- `apps/backend/src/api/routes/flows.controller.ts:98`
- `libraries/nestjs-libraries/src/database/prisma/flows/flows.service.ts`
- `libraries/nestjs-libraries/src/database/prisma/flows/flows.repository.ts:244`

**Mudanças:**
1. Controller passa `org.id` para `getExecutions(orgId, flowId, page, limit)`
2. Repository filtra `where: { flowId, flow: { organizationId: orgId } }`
3. Adicionar `Math.min(limit, 100)` como cap de paginação
4. Adicionar `@IsInt() @Min(1) @Max(100)` em DTO de query

### 2.2 Validar `integrationId` cross-org em `createFlow`
**Arquivo:** `libraries/nestjs-libraries/src/database/prisma/flows/flows.repository.ts:62`

**Mudança:** antes do `create`, fazer `findFirst` em `integration` com `{ id, organizationId: orgId, deletedAt: null }`. Se não existir, lançar `BadRequestException('Integration not found')`.

### 2.3 Limitar duração do nó `DELAY`
**Arquivos:**
- `apps/orchestrator/src/workflows/flow.execution.workflow.ts:172`
- `libraries/nestjs-libraries/src/dtos/flows/flow.dto.ts`

**Mudanças:**
1. Validar `duration`/`unit` em `SaveCanvasDto` quando `node.type === 'DELAY'` (custom validator)
2. No workflow: `const MAX_DELAY_MS = 24 * 60 * 60 * 1000; await sleep(Math.min(durationMs, MAX_DELAY_MS))`
3. Expor `FLOW_MAX_DELAY_HOURS` como env var (default 24) para operadores aumentarem se necessário

### 2.4 Validar `data` do node por tipo
**Arquivo:** `libraries/nestjs-libraries/src/dtos/flows/flow.dto.ts`

**Mudança:** criar discriminated union por `node.type` com validação específica:
- `REPLY_COMMENT`/`SEND_DM`: `message` string, max 2200 chars (limite do IG)
- `DELAY`: `duration` number, `unit` enum
- `CONDITION`: estrutura validada de condição

Manter campo `data: string` como opaque storage no banco (sem migração), mas validar **antes** de persistir.

### 2.5 Corrigir `{commenter_name}` interpolando `igCommenterId`
**Arquivo:** `apps/orchestrator/src/workflows/flow.execution.workflow.ts:214`

**Mudanças:**
1. Adicionar `igCommenterName?: string` a `FlowExecutionInput`
2. Propagar campo a partir do webhook IG (`entry.changes[0].value.from.username`)
3. Interpolar `input.igCommenterName || input.igCommenterId` (fallback seguro)

**Compatibilidade:** executions antigas sem `igCommenterName` caem no fallback — sem breaking change.

### Testes da Onda 2
- `flows.service.spec.ts` / `flows.repository.spec.ts`:
  - Usuário da org A não consegue ler executions da org B (404)
  - `createFlow` com `integrationId` de outra org → 400
  - `limit > 100` é capado silenciosamente
- `flow.execution.workflow.spec.ts`:
  - `DELAY` de 999999h é capado a `MAX_DELAY_MS`
  - Interpolação prefere `igCommenterName` quando presente
- Validação de DTO: payload com `DELAY` sem `duration` → 400

### Validação da Onda 2
```bash
pnpm test -- --testPathPattern="flows"
pnpm build:backend && pnpm build:orchestrator
# Teste E2E: criar flow com integration de outra org deve falhar
```

---

## Onda 3 — IDORs em recursos core (CRÍTICA)

**Objetivo:** blindar controllers herdados do upstream Postiz. Mudanças mais invasivas — exigem cuidado com backport.

### 3.1 Criar guard/helper de ownership centralizado
**Arquivo novo:** `libraries/nestjs-libraries/src/guards/resource-ownership.guard.ts`

Decorator `@VerifyOwnership('integration' | 'webhook' | 'profile' | ...)` que, dado o `:id` da rota e o `org.id`, verifica via repository específico que o recurso pertence à organização antes de executar o handler.

### 3.2 Aplicar em controllers core
**Arquivos:**
- `apps/backend/src/api/routes/integrations.controller.ts` (`saveProviderPage`, `updateIntegrationGroup`, `updateOnCustomerName`, etc.)
- `apps/backend/src/api/routes/webhooks.controller.ts` (`deleteWebhook`, `updateWebhook`)
- `apps/backend/src/api/routes/profiles.controller.ts` (`updateProfile`, `deleteProfile`, `addMember`, `removeMember`)

### 3.3 Corrigir middleware de profile
**Arquivo:** `apps/backend/src/services/auth/auth.middleware.ts:104`

**Mudança:** ao resolver `showprofile` header/cookie, validar que o user tem `ProfileMember` vinculado ao profile, não apenas que o profile existe na org.

### 3.4 Proteger `getMembers` com auth
**Arquivo:** `apps/backend/src/api/routes/profiles.controller.ts:61`

**Mudança:** adicionar `@UseGuards(AuthService)` — atualmente está público.

### Testes da Onda 3
- Matriz de testes cross-org para cada endpoint: user da org A com ID de recurso da org B → 404
- Middleware: user sem `ProfileMember` seleciona profile alheio → 403
- `getMembers` sem auth → 401

### Validação da Onda 3
```bash
pnpm test
# Teste E2E: rodar suite de tenant isolation completa
```

---

## Onda 4 — Validação de input (ALTA)

**Objetivo:** eliminar `@Body() any` e sanitizar HTML.

### 4.1 Criar DTOs tipados para endpoints sem validação
**Arquivos afetados:**
- `apps/backend/src/api/routes/third-party.controller.ts` (linhas 67, 100)
- `apps/backend/src/api/routes/integrations.controller.ts:56`
- `apps/backend/src/api/routes/public.controller.ts:180`
- `apps/backend/src/api/routes/no.auth.integrations.controller.ts:317`
- `apps/backend/src/api/routes/auth.controller.ts:203` (query)

Cada endpoint ganha um DTO dedicado em `libraries/nestjs-libraries/src/dtos/` com decorators `@IsString`, `@IsEmail`, `@MaxLength`, etc.

### 4.2 Endurecer `ValidationPipe` global
**Arquivo:** `apps/backend/src/main.ts:50`

```typescript
new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false, // manter false por 1 release para evitar breaking
})
```

**Migração:** observar logs por 1 release com `whitelist: true` removendo campos desconhecidos silenciosamente. Depois trocar para `forbidNonWhitelisted: true`.

### 4.3 Sanitizar HTML no preview público
**Arquivo:** `apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx:137`

**Mudança:** adicionar `isomorphic-dompurify` e envolver `__html: DOMPurify.sanitize(p.content)`.

**Alternativa melhor:** renderizar como texto com `whitespace-pre-wrap` sem `dangerouslySetInnerHTML` (avaliar se o conteúdo realmente precisa de HTML).

### 4.4 Wrap JSON.parse em try-catch com validação de estrutura
**Arquivos:**
- `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts:307`
- `apps/backend/src/api/routes/integrations.controller.ts:122`
- `apps/backend/src/api/routes/no.auth.integrations.controller.ts:243`

Criar helper `safeJsonParse<T>(str, schema)` em `libraries/helpers/src/utils/` que valida via Zod ou class-validator após parse.

### 4.5 Sanitizar filenames em uploads
**Arquivos:**
- `apps/backend/src/api/routes/media.controller.ts:95,184`
- `apps/backend/src/api/routes/third-party.controller.ts:92,162`

Substituir `.split('/').pop()` por `path.basename()` + regex whitelist `[a-zA-Z0-9._-]+`.

### Testes da Onda 4
- Endpoints com DTO: payload inválido → 400 com mensagem clara
- XSS: salvar post com `<script>alert(1)</script>` e verificar que preview renderiza escapado
- Filename: upload com `../../../etc/passwd` → rejeitado ou sanitizado

---

## Onda 5 — Security headers + CORS (ALTA)

**Objetivo:** camada defensiva no nível HTTP.

### 5.1 Adicionar helmet
**Arquivos:** `apps/backend/src/main.ts`, `package.json`

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: false, // habilitar gradualmente com env var
  crossOriginEmbedderPolicy: false, // pode quebrar uploads, testar
}));
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
```

**Compatibilidade:** iniciar com CSP desligada. Monitorar via `Content-Security-Policy-Report-Only` antes de enforçar.

### 5.2 Feature flag para CSP
Adicionar `ENABLE_CSP=false` no `.env.example`. Quando `true`, aplicar CSP restritiva com nonces. Por padrão desligada para não quebrar instalações.

### 5.3 Hardening de cookie
**Arquivo:** `apps/backend/src/api/routes/auth.controller.ts:72`

**Mudanças:**
- Adicionar env var `COOKIE_SAMESITE` (default `lax`, aceita `none`/`strict`)
- Reduzir expiração default de 365 dias para 30 dias
- Manter comportamento legacy via env var `COOKIE_MAX_AGE_DAYS=365` para preservar sessões existentes de operadores que não querem deslogar todos os usuários

### 5.4 Mover `localhost:6274` do main.ts para env
**Arquivo:** `apps/backend/src/main.ts:40`

Adicionar `CORS_EXTRA_ORIGINS` (CSV) no env.

### Testes da Onda 5
- Response headers incluem `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
- Cookie tem `HttpOnly`, `Secure`, `SameSite=lax` por default
- CORS rejeita origem não listada

---

## Onda 6 — Rate limiting granular (ALTA)

**Objetivo:** proteger endpoints de brute force.

### 6.1 Throttler específico em auth
**Arquivos:** `apps/backend/src/api/routes/auth.controller.ts`

```typescript
@Throttle({ default: { ttl: 900_000, limit: 5 } }) // 5 req / 15min
@Post('/login')
```

Aplicar também em `/register`, `/forgot`, `/forgot-return`, `/activate`.

### 6.2 Throttle por IP+email combinado
Custom `ThrottlerGuard` que usa `${req.ip}:${req.body.email}` como key para evitar que 1 IP bloqueie múltiplos usuários legítimos.

### 6.3 CAPTCHA opcional após N falhas
Feature flag `ENABLE_CAPTCHA=false`. Integração com Cloudflare Turnstile. Por padrão desligado.

### Testes da Onda 6
- 6 logins inválidos consecutivos → 6ª retorna 429
- Rate limit por IP+email isolado (user A não bloqueia user B)

---

## Onda 7 — Encryption key + credenciais (ALTA, com migração)

**Objetivo:** eliminar MD5 legacy e padronizar criptografia de credenciais.

### 7.1 Configurar ENCRYPTION_KEY
**Arquivo:** `apps/backend/src/main.ts` (bootstrap)

No startup, validar que `ENCRYPTION_KEY` está definido. Se não, **gerar aviso mas não bloquear** (para não quebrar upgrade). Log: "ENCRYPTION_KEY not set, using JWT_SECRET as fallback (deprecated, set ENCRYPTION_KEY before next release)".

### 7.2 Implementar AES-256-GCM
**Arquivo novo:** `libraries/helpers/src/auth/encryption.service.ts`

Novo `encryptV2`/`decryptV2` com AES-256-GCM + IV aleatório + authentication tag. Prefixar ciphertext com versão: `v2:${iv}:${tag}:${ciphertext}`.

### 7.3 Migração dual-read
**Arquivo:** `libraries/nestjs-libraries/src/database/prisma/credentials/credential.service.ts`

- `encrypt()` sempre usa v2
- `decrypt()` detecta prefixo: se `v2:` → v2, senão → legacy MD5
- Re-encriptar on-read: toda vez que decifrar v1, re-encriptar em v2 no banco

**Sem migração em massa.** Rotação acontece gradualmente conforme uso. Instalação pode migrar 100% rodando um job opcional:

### 7.4 Job de migração opcional
**Arquivo novo:** `apps/commands/src/tasks/migrate-encryption.task.ts`

Comando CLI `pnpm run migrate:encryption` que:
- Lê todas credenciais em batches de 100
- Decripta (tolera v1 e v2)
- Re-encripta em v2
- Salva
- Loga progresso

**Idempotente:** credenciais já em v2 são puladas.

### Testes da Onda 7
- `encryption.service.spec.ts`: round-trip v2, detecção de tampering (tag inválida)
- `credential.service.spec.ts`: decripta v1 e re-encripta em v2 no read
- Job de migração: executar 2x não corrompe dados

### Validação da Onda 7
```bash
pnpm test -- --testPathPattern="encryption|credential"
# Teste em staging com clone de banco de produção
pnpm run migrate:encryption --dry-run
```

---

## Onda 8 — JWT lifecycle + session revocation (MÉDIA, opt-in)

**Objetivo:** permitir revogação de sessões e reduzir janela de exposição de tokens vazados.

### 8.1 Tabela `Session` no Prisma
**Arquivo:** `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

```prisma
model Session {
  id        String   @id @default(uuid())
  userId    String
  jti       String   @unique
  createdAt DateTime @default(now())
  expiresAt DateTime
  revokedAt DateTime?
  userAgent String?
  ipAddress String?
  user      User     @relation(fields: [userId], references: [id])
  @@index([userId, revokedAt])
}
```

### 8.2 Gerar `jti` em cada JWT
**Arquivo:** `libraries/helpers/src/auth/auth.service.ts`

Ao sign, gerar `jti: randomUUID()` e persistir `Session`. No verify, checar `revokedAt IS NULL`.

**Opt-in via env:** `SESSION_REVOCATION_ENABLED=false` (default). Quando `false`, comportamento atual (JWT stateless). Quando `true`, valida `Session` no banco — adiciona 1 query por request autenticado (cachear em Redis).

### 8.3 Endpoint `/auth/logout-all`
Revoga todas as `Session` do user (set `revokedAt`).

### 8.4 Reduzir expiração default
JWT expira em 30 dias (configurável via `JWT_EXPIRES_DAYS`, default 30). Instalações existentes podem manter 365 setando a env.

### Testes da Onda 8
- Com `SESSION_REVOCATION_ENABLED=true`: revogar sessão invalida requests subsequentes
- Com `SESSION_REVOCATION_ENABLED=false`: comportamento idêntico ao atual (sem regressão)

---

## Onda 9 — Audit log + observabilidade (MÉDIA)

**Objetivo:** detectar abuso e dar suporte forense.

### 9.1 Tabela `AuditLog`
```prisma
model AuditLog {
  id             String   @id @default(uuid())
  organizationId String?
  userId         String?
  action         String   // 'auth.login', 'integration.delete', 'user.impersonate', etc.
  resourceType   String?
  resourceId     String?
  metadata       Json?
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime @default(now())
  @@index([organizationId, createdAt])
  @@index([userId, createdAt])
}
```

### 9.2 Decorator `@Audit('action.name')`
Intercepta controller method, loga request + response status em `AuditLog`.

### 9.3 Aplicar em operações sensíveis
- Login/logout, password change, password reset
- Impersonate (super-admin)
- Rotação de API key
- Conexão/desconexão de integrações
- Criação/remoção de webhook
- Alteração de permissões de member

### 9.4 Retenção configurável
`AUDIT_LOG_RETENTION_DAYS=90` (default 90). Job diário remove logs mais antigos.

### Testes da Onda 9
- Login bem-sucedido gera AuditLog com action `auth.login.success`
- Login falhado gera action `auth.login.failure`
- Impersonate gera entry com metadata `{ impersonatedUserId }`

---

## Onda 10 — Refinamentos opcionais (BAIXA)

**Objetivo:** polimento e hygiene.

### 10.1 Mitigar DNS rebinding em SSRF
`IsSafeWebhookUrl`: após validar DNS, resolver IP **novamente imediatamente antes** do fetch e comparar. Se mudou, abortar.

### 10.2 Open redirect em OAuth
`no.auth.integrations.controller.ts:293`: validar `returnURL` contra whitelist de domínios (`FRONTEND_URL` + opcional `OAUTH_ALLOWED_REDIRECTS`).

### 10.3 Email enumeration em login
Retornar mesma mensagem para "user not found" e "invalid password" (delay constante para evitar timing).

### 10.4 Remover `console.log` com dados sensíveis
Grep por `console.log.*body|JSON.stringify.*body` em controllers e substituir por logger estruturado com redação de campos sensíveis.

### 10.5 Substituir `$executeRawUnsafe` por `$executeRaw`
`startup-migration.service.ts` e `profile.seed.module.ts`: converter para template strings mesmo sem parâmetros variáveis (anti-pattern hygiene).

### 10.6 Bump de deps vulneráveis
- `axios ^1.7.7` → `^1.8.x`
- `pnpm audit --fix`
- Alinhar `volta.node` com `engines.node` do `package.json`

### 10.7 Timing-safe compare em todos os segredos
Buscar todas as comparações de token/secret e usar `crypto.timingSafeEqual`.

---

## Template de validação por onda

Cada onda deve ter:

```markdown
## Checklist Onda N

### Pré-deploy
- [ ] Testes unitários novos passando
- [ ] Testes de regressão da suite existente passando
- [ ] `pnpm lint` sem warnings novos
- [ ] `pnpm build` (todos os apps) sem erros
- [ ] Migrações Prisma testadas em clone de staging
- [ ] CHANGELOG.md atualizado na seção [Unreleased]
- [ ] Env vars novas documentadas em .env.example com valores default seguros
- [ ] docs/ atualizado com novas configurações

### Deploy staging
- [ ] Deploy em staging bem-sucedido
- [ ] Smoke test: login, criar post, conectar integração, criar flow
- [ ] Logs limpos (sem erros novos)
- [ ] Métricas de latência estáveis

### Deploy produção
- [ ] Release tag criada (SemVer)
- [ ] Docker image buildada e publicada
- [ ] Release notes publicadas destacando mudanças de segurança
- [ ] Comunicado para operadores self-hosted (env vars novas, breaking se houver)
- [ ] Monitorar logs por 24h pós-deploy
```

---

## Mapeamento onda → release

| Onda | Release sugerida | Motivo |
|------|------------------|--------|
| 1 | `v0.3.1` (patch hotfix) | Contenção crítica, zero impacto funcional |
| 2 | `v0.3.2` (patch) | Fix de código customizado novo |
| 3 | `v0.4.0` (minor) | Muitos arquivos, merece minor |
| 4 | `v0.4.0` (minor) | Junto com onda 3 |
| 5 | `v0.5.0` (minor) | Headers podem impactar integrações externas |
| 6 | `v0.5.1` (patch) | Rate limit granular |
| 7 | `v0.6.0` (minor) | Migração de criptografia — comunicação forte |
| 8 | `v0.7.0` (minor) | Opt-in, mas adiciona tabela Session |
| 9 | `v0.8.0` (minor) | Feature de auditoria aditiva |
| 10 | `v0.8.x` (patches) | Rolling de melhorias menores |

---

## Nota sobre backward-compatibility

**Garantias deste plano:**
- Nenhuma onda remove env vars existentes sem período de deprecation de 2 releases
- Schemas do Prisma apenas **adicionam** colunas/tabelas (nunca removem ou mudam tipo)
- Feature flags são default-off ou default-compatible
- Comportamento padrão preserva o atual até operador optar por novas features
- Migrações de dados (onda 7) são dual-read e idempotentes

**Se um operador atualizar sem ler o CHANGELOG:** sistema continua funcional, apenas mais seguro. Features novas de segurança ficam dormentes até serem habilitadas via env.
