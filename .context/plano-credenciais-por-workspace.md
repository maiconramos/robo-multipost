# Plano: Credenciais de Providers por Workspace + Integração Late

---

## Prompts para Multi-Agentes Paralelos

### Ordem de execução

```
Onda 1 (rodar em paralelo):
  ├── Agente 1A: Late — Backend
  └── Agente 1B: Late — Frontend

Onda 2 (rodar após Onda 1, em paralelo):
  ├── Agente 2A: Sistema de Credenciais — Backend
  └── Agente 2B: Sistema de Credenciais — Frontend
```

---

## AGENTE 1A — Late: Backend

```
Você é um agente de desenvolvimento sênior trabalhando no Robô MultiPost,
um fork do Postiz (NestJS + Next.js + Prisma + Temporal + PostgreSQL).

## Missão
Implementar a integração com o Late (https://getlate.dev) como provider de publicação
para TikTok e Pinterest. O Late é um serviço que abstrai OAuth complexos — o usuário
conecta suas redes sociais uma vez no Late e publica através da API deles.

## Leia estes arquivos ANTES de qualquer implementação

Leia na ordem para entender os padrões:
1. libraries/nestjs-libraries/src/integrations/social.abstract.ts
2. libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts
3. libraries/nestjs-libraries/src/integrations/integration.manager.ts
4. libraries/nestjs-libraries/src/integrations/social/pinterest.provider.ts (referência simples)
5. libraries/nestjs-libraries/src/integrations/social/bluesky.provider.ts (padrão customFields)
6. libraries/nestjs-libraries/src/database/prisma/schema.prisma (modelos Organization e Integration)
7. apps/backend/src/api/routes/integrations.controller.ts (fluxo getIntegrationUrl)
8. apps/backend/src/api/routes/no.auth.integrations.controller.ts (fluxo connectSocialMedia)
9. libraries/helpers/src/auth/auth.service.ts (criptografia existente)

Busque também a documentação do Late em:
- https://docs.getlate.dev/llms-full.txt

## Arquitetura de credenciais para o Late

O Late usa uma API key única por conta. O modelo de armazenamento no Postiz:
- Organization.lateApiKey → chave Late da organização (para gestão nas Settings)
- Integration.token → Late API key (para o provider usar ao postar, sem precisar de DB)
- Integration.internalId → Late account ID (conta conectada no Late)
- Integration.customInstanceDetails → JSON com Late profile ID da org

Lógica: a "access token" para providers Late É a Late API key. Isso permite que o
provider funcione sem acesso ao banco durante a publicação via Temporal.

## O que implementar

### 1. Prisma Schema — adicionar campo na Organization

No arquivo `libraries/nestjs-libraries/src/database/prisma/schema.prisma`, adicionar
na model Organization:

```prisma
lateApiKey String?
```

Após modificar, rodar: `pnpm run prisma-db-push`

### 2. Late OAuth Callback personalizado

O Late não usa o padrão code/codeVerifier do OAuth tradicional. O fluxo é:
1. Chamamos `late.connect.getConnectUrl({ platform, redirect_url })` com a Late API key
2. Usuário faz OAuth no TikTok/Pinterest ATRAVÉS do Late
3. Late redireciona de volta para nossa URL com o Late account ID

Criar endpoint de callback dedicado:
`GET /api/integrations/late/callback?accountId=acc_xxx&profileId=prf_xxx&platform=tiktok&state=xxx`

Este endpoint (no `no.auth.integrations.controller.ts`) deve:
- Ler state do Redis para recuperar organizationId e platform
- Salvar o Integration com token=lateApiKey, internalId=accountId

### 3. LateTikTokProvider

Criar `libraries/nestjs-libraries/src/integrations/social/late-tiktok.provider.ts`

```typescript
export class LateTikTokProvider extends SocialAbstract implements SocialProvider {
  identifier = 'late-tiktok';
  name = 'TikTok (via Late)';
  isBetweenSteps = false;
  scopes = [];
  editor = 'normal' as const;
  maxLength = () => 2200;

  // generateAuthUrl:
  // - Recebe ClientInformation com instanceUrl = lateApiKey da org
  // - Chama: new Late({ apiKey }).connect.getConnectUrl({ platform: 'tiktok', redirect_url, headless: true })
  // - Retorna a URL do Late para redirecionar o usuário
  // - state = uuid gerado localmente, armazenar no Redis

  // authenticate:
  // - Para Late, o "code" no callback é o Late account ID
  // - Retorna AuthTokenDetails com:
  //   accessToken = lateApiKey (vem do ClientInformation via Redis)
  //   id = lateAccountId
  //   name = nome da conta TikTok
  //   username = username do TikTok

  // refreshToken:
  // - Late gerencia refresh automaticamente
  // - Retornar os mesmos tokens sem alteração

  // post:
  // - accessToken = Late API key
  // - id = Late account ID
  // - Criar cliente: new Late({ apiKey: accessToken })
  // - Verificar usage ANTES de postar: late.usage.getUsageStats()
  //   Se usage.posts >= limits.posts: lançar erro claro "Limite mensal Late atingido"
  //   Cache em memória (Map com TTL de 5 minutos) para não chamar a cada post
  // - Chamar: late.posts.createPost({ content, mediaItems, platforms: [{ platform: 'tiktok', accountId: id }] })
  // - Retornar PostResponse com o ID do post Late
}
```

### 4. LatePinterestProvider

Criar `libraries/nestjs-libraries/src/integrations/social/late-pinterest.provider.ts`

Idêntico ao LateTikTokProvider com as diferenças:
- identifier = 'late-pinterest'
- name = 'Pinterest (via Late)'
- maxLength = () => 500
- platform = 'pinterest' nas chamadas Late
- Pinterest requer seleção de board (isBetweenSteps = true se quiser suportar isso)
  Para Fase 1, deixar isBetweenSteps = false e postar sem board específico

### 5. Registrar os providers no IntegrationManager

Em `libraries/nestjs-libraries/src/integrations/integration.manager.ts`:
- Importar e adicionar LateTikTokProvider e LatePinterestProvider ao array socialIntegrationList

### 6. Endpoints de Settings para Late API Key

Em `apps/backend/src/api/routes/settings.controller.ts`, adicionar:

```
GET  /settings/late         → retorna { configured: boolean, usage: {...} | null }
POST /settings/late         → salva lateApiKey na Organization (criptografado com AuthService.fixedEncryption)
DELETE /settings/late       → remove lateApiKey
```

O GET deve:
- Se lateApiKey configurada, chamar Late API para pegar usage stats
- Retornar usage: { planName, postsUsed, postsLimit, profilesUsed, profilesLimit }
- NUNCA retornar a lateApiKey em claro no response (retornar apenas configured: true/false)

O POST deve:
- Receber { apiKey: "sk_..." }
- Validar formato (começa com "sk_")
- Testar conexão com Late antes de salvar (chamar late.usage.getUsageStats())
- Salvar criptografado: AuthService.fixedEncryption(apiKey)
- Retornar { configured: true, usage: {...} }

Criar o service correspondente em:
`libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts`
(ou no repositório existente — seguir o padrão do projeto)

### 7. Modificação em integrations.controller.ts

No método getIntegrationUrl, para providers Late (identifier começa com 'late-'):
- Ler `org.lateApiKey` do banco
- Descriptografar: AuthService.fixedDecryption(org.lateApiKey)
- Passar como `externalUrl` para que chegue em generateAuthUrl via ClientInformation.instanceUrl

Usar o mecanismo existente de externalUrl ou adicionar lógica específica para providers Late.

## SDK do Late

Instalar na raiz do monorepo:
```bash
pnpm add @getlatedev/node --filter @gitroom/nestjs-libraries
```

Usar `new Late({ apiKey })` do SDK `@getlatedev/node`.

## Erros e tratamento

O provider deve capturar erros do Late e traduzir para mensagens claras:
- 401 → "Late API key inválida ou expirada. Reconfigure em Configurações > Late"
- 429 → "Limite de requisições Late atingido. Aguarde alguns minutos"
- Erro de quota → "Limite mensal de posts Late atingido (X/Y). Atualize seu plano em getlate.dev"

## Regras obrigatórias

- NÃO modificar providers nativos existentes (pinterest.provider.ts, tiktok.provider.ts)
- NÃO quebrar a interface SocialProvider existente
- Seguir exatamente o padrão Controller → Service → Repository
- Rodar `pnpm lint` ao final e corrigir erros
- NÃO commitar — apenas implementar

## Contrato de API para o Agente 1B (Frontend)

Os seguintes endpoints estarão disponíveis para o frontend consumir:

GET  /api/settings/late
Response: { configured: boolean, usage: { planName, postsUsed, postsLimit } | null }

POST /api/settings/late
Body: { apiKey: string }
Response: { configured: true, usage: { planName, postsUsed, postsLimit } }

DELETE /api/settings/late
Response: { configured: false }

Os providers 'late-tiktok' e 'late-pinterest' aparecem no
GET /api/integrations (lista de integrações disponíveis)
```

---

## AGENTE 1B — Late: Frontend

```
Você é um agente de desenvolvimento sênior trabalhando no Robô MultiPost,
um fork do Postiz (NestJS + Next.js 14 + React 18 + Tailwind CSS 3).

## Missão
Implementar a UI de configuração da integração Late nas Configurações do workspace.

## Leia estes arquivos ANTES de qualquer implementação

1. apps/frontend/src/app/(app)/(site)/settings/page.tsx
2. apps/frontend/src/app/(app)/(site)/layout.tsx (para entender navegação)
3. apps/frontend/src/components/ (explorar padrões de componentes existentes)
4. libraries/helpers/src/utils/custom.fetch.tsx (hook useFetch obrigatório)
5. apps/frontend/src/app/colors.scss (variáveis de cor)
6. apps/frontend/src/app/global.scss
7. apps/frontend/tailwind.config.js

## Contrato de API disponível (implementado pelo Agente 1A)

GET  /api/settings/late
Response: { configured: boolean, usage: { planName: string, postsUsed: number, postsLimit: number } | null }

POST /api/settings/late
Body: { apiKey: string }
Response: { configured: true, usage: { planName, postsUsed, postsLimit } }

DELETE /api/settings/late
Response: { configured: false }

## O que implementar

### 1. Hook SWR para Late settings

Criar hook separado (obrigatório pelas regras do projeto):
`apps/frontend/src/hooks/use-late-settings.hook.ts`

```typescript
// Cada hook SWR deve ser uma função separada — regra obrigatória do projeto
export const useLateSettings = () => {
  return useSWR('/settings/late', ...);
};
```

### 2. Componente LateSettingsSection

Criar `apps/frontend/src/components/settings/late-settings.component.tsx`

Comportamento:
- Estado "não configurado": mostrar campo de input para Late API key + botão "Conectar"
  - Placeholder: "sk_..."
  - Texto explicativo: "Obtenha sua API key em getlate.dev/settings/api-keys"
  - Link externo: "Criar conta no Late (gratuito)" → https://getlate.dev
- Estado "configurado": mostrar
  - Badge verde "Late conectado"
  - Plano atual: ex. "Plano: Free"
  - Barra de progresso de uso: "17 / 20 posts utilizados este mês"
  - Quando uso >= 80%: barra laranja com aviso "Você está próximo do limite mensal"
  - Quando uso = 100%: barra vermelha com aviso "Limite atingido. Atualize em getlate.dev"
  - Botão "Remover conexão" (com confirmação)

### 3. Integrar na página de Settings

Em `apps/frontend/src/app/(app)/(site)/settings/page.tsx`:
- Adicionar seção "Integração Late" após as seções existentes
- Título da seção: "Late — TikTok e Pinterest"
- Subtítulo: "Configure sua API key do Late para publicar no TikTok e Pinterest sem precisar de aprovação de app."

## Regras obrigatórias

- Usar APENAS o hook useFetch de `libraries/helpers/src/utils/custom.fetch.tsx` para fetch
- Cada hook SWR em função separada (react-hooks/rules-of-hooks)
- NÃO instalar componentes de npm — usar componentes nativos do projeto
- Verificar componentes existentes em apps/frontend/src/components/ui antes de criar novos
- NÃO usar variáveis --color-custom* (depreciadas)
- Rodar `pnpm lint` ao final e corrigir erros
- NÃO commitar
```

---

## AGENTE 2A — Sistema de Credenciais: Backend

```
Você é um agente de desenvolvimento sênior trabalhando no Robô MultiPost,
um fork do Postiz (NestJS + Prisma + PostgreSQL).

## Contexto
Este é o sistema de credenciais de providers por workspace — pré-requisito para
multi-tenant. Permite que cada workspace configure seus próprios OAuth apps
(FACEBOOK_APP_ID, TIKTOK_CLIENT_ID, etc.) pela UI em vez de variáveis de ambiente.

## Leia estes arquivos ANTES de qualquer implementação

1. libraries/helpers/src/auth/auth.service.ts (criptografia legacy AES-256-CBC)
2. libraries/nestjs-libraries/src/database/prisma/schema.prisma (modelos existentes)
3. libraries/nestjs-libraries/src/integrations/integration.manager.ts
4. libraries/nestjs-libraries/src/integrations/social/pinterest.provider.ts
5. apps/backend/src/api/routes/settings.controller.ts (padrão de settings existente)
6. .context/plano-credenciais-por-workspace.md (plano completo)

## Problema de segurança a corrigir

Os tokens OAuth dos usuários (accessToken, refreshToken) na tabela Integration estão em
plain text. Corrigir isso FAZ PARTE desta tarefa.

## O que implementar

### 1. EncryptionService (novo, substitui o legacy para credenciais)

Criar `libraries/nestjs-libraries/src/crypto/encryption.service.ts`

Usar AES-256-GCM com nonce aleatório por registro (mais seguro que o CBC com IV fixo):

```typescript
// Formato do ciphertext armazenado: base64([version:1][nonce:12][tag:16][data:N])
// version = 1 (para futura rotação de chave)
// Master key: process.env.ENCRYPTION_KEY ?? process.env.JWT_SECRET (fallback)

@Injectable()
export class EncryptionService {
  encrypt(plaintext: string): string { ... }  // retorna base64
  decrypt(ciphertext: string): string { ... }  // aceita novo formato e legacy (detecta pelo prefixo)
  encryptJson(obj: Record<string, any>): string { ... }
  decryptJson(ciphertext: string): Record<string, any> { ... }
}
```

O `decrypt` deve detectar automaticamente se é formato novo (AES-256-GCM) ou legacy
(AES-256-CBC do AuthService.fixedEncryption) para compatibilidade retroativa.

### 2. Prisma Schema — nova tabela ProviderCredential

Adicionar em `libraries/nestjs-libraries/src/database/prisma/schema.prisma`:

```prisma
model ProviderCredential {
  id             String       @id @default(cuid())
  organizationId String
  provider       String
  encryptedData  String       @db.Text
  keyVersion     Int          @default(1)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, provider])
  @@index([organizationId])
}
```

Adicionar o relation em Organization:
```prisma
providerCredentials ProviderCredential[]
```

Após modificar schema: `pnpm run prisma-db-push`

### 3. CredentialRepository e CredentialService

Criar em `libraries/nestjs-libraries/src/database/prisma/credentials/`:

**credential.repository.ts:**
```typescript
// Métodos: upsert(orgId, provider, data), findByProvider(orgId, provider),
//          findAllByOrg(orgId), delete(orgId, provider)
// Todos os dados são armazenados/recuperados via EncryptionService
```

**credential.service.ts:**
```typescript
const SENTINEL = '__REDACTED__';

// redact(data): substitui valores por SENTINEL (nunca retornar segredos para frontend)
// unredact(incoming, currentEncrypted): preserva segredos quando valor == SENTINEL
// save(orgId, provider, data): unredact + encrypt + upsert
// getRedacted(orgId, provider): decrypt + redact (para UI)
// getRaw(orgId, provider): decrypt sem redact (uso interno por providers)
// delete(orgId, provider)
// test(orgId, provider): instanciar Late client ou testar OAuth credentials
```

### 4. CredentialController (endpoints)

Em `apps/backend/src/api/routes/` criar `credentials.controller.ts`:

```
GET    /api/credentials                    → lista providers configurados { provider, configured, updatedAt }[]
GET    /api/credentials/:provider          → dados redigidos por sentinela
POST   /api/credentials/:provider          → cria/sobrescreve (body: { clientId, clientSecret, ... })
PATCH  /api/credentials/:provider          → atualiza parcialmente com suporte a sentinela
DELETE /api/credentials/:provider          → remove credencial
POST   /api/credentials/:provider/test     → testa conexão (retorna { ok: boolean, error?: string })
```

Todos os endpoints protegidos por autenticação e escopados ao org do usuário via
`@GetOrgFromRequest()`.

### 5. Atualizar IntegrationManager — ler credenciais do DB com fallback para env

Em `integration.manager.ts`, adicionar método:

```typescript
// getProviderCredentials(provider: string, organizationId: string): Promise<ClientInformation | undefined>
// 1. Tenta CredentialService.getRaw(organizationId, provider)
// 2. Se não encontrado, lê variáveis de ambiente (FACEBOOK_APP_ID, etc.)
// 3. Retorna ClientInformation { client_id, client_secret, instanceUrl }
```

Injetar CredentialService no IntegrationManager via NestJS DI.

Atualizar `integrations.controller.ts` para passar credenciais da organização ao
chamar `generateAuthUrl(clientInformation)` e ao fazer `authenticate()`.

### 6. Migrar OAuth tokens de plain text para criptografado

Na tabela Integration, os campos `token` e `refreshToken` estão em plain text.
Estratégia de migração lazy (zero-downtime):
- Adicionar campo `tokenEncrypted Boolean @default(false)` na tabela Integration
- Na leitura (integration.repository.ts), se `tokenEncrypted = false`, retornar plain + marcar para migrar
- Na escrita de novo token (refresh), sempre salvar criptografado e marcar `tokenEncrypted = true`
- Criar script de migração batch opcional: `pnpm run migrate:encrypt-tokens`

### 7. Variável de ambiente nova

Adicionar ao `.env.example`:
```
# Chave mestra para criptografia de credenciais (separada do JWT_SECRET)
# Gere com: openssl rand -base64 32
ENCRYPTION_KEY=""
```

## Schema de dados por provider

```typescript
// facebook:     { clientId, clientSecret }
// tiktok:       { clientId, clientSecret }
// pinterest:    { clientId, clientSecret }
// linkedin:     { clientId, clientSecret }
// twitter/x:    { clientId, clientSecret }
// youtube:      { clientId, clientSecret }
// reddit:       { clientId, clientSecret }
// discord:      { clientId, clientSecret, botToken }
// slack:        { clientId, clientSecret, signingSecret }
// late:         { apiKey }  ← também gerenciado aqui (migrar de Organization.lateApiKey)
```

## Regras obrigatórias

- NÃO quebrar integrações existentes (fallback para env vars obrigatório)
- NÃO retornar segredos em claro em nenhum endpoint
- Seguir padrão Controller → Service → Repository do projeto
- EncryptionService como @Injectable() no módulo correto
- Rodar `pnpm lint` ao final e corrigir erros
- NÃO commitar

## Contrato de API para o Agente 2B (Frontend)

GET /api/credentials
Response: [{ provider: string, configured: boolean, updatedAt: string }]

GET /api/credentials/:provider
Response: { provider, data: { clientId: "__REDACTED__", clientSecret: "__REDACTED__", ... }, updatedAt }

POST /api/credentials/:provider
Body: { clientId: string, clientSecret: string, ... }
Response: { provider, data: { clientId: "__REDACTED__", ... }, updatedAt }

POST /api/credentials/:provider/test
Response: { ok: boolean, error?: string }

DELETE /api/credentials/:provider
Response: 204 No Content
```

---

## AGENTE 2B — Sistema de Credenciais: Frontend

```
Você é um agente de desenvolvimento sênior trabalhando no Robô MultiPost,
um fork do Postiz (Next.js 14 + React 18 + Tailwind CSS 3).

## Contexto
Implementar a UI de gerenciamento de credenciais de providers OAuth por workspace.
Permite que cada workspace configure seus próprios FACEBOOK_APP_ID, TIKTOK_CLIENT_ID,
etc. pela interface, sem precisar de variáveis de ambiente.

## Leia estes arquivos ANTES de qualquer implementação

1. apps/frontend/src/app/(app)/(site)/settings/page.tsx
2. apps/frontend/src/components/ (explorar componentes existentes, especialmente forms)
3. libraries/helpers/src/utils/custom.fetch.tsx (hook useFetch obrigatório)
4. apps/frontend/src/app/colors.scss
5. apps/frontend/tailwind.config.js
6. apps/frontend/src/app/(app)/(site)/layout.tsx

## Contrato de API disponível (implementado pelo Agente 2A)

GET  /api/credentials
Response: [{ provider: string, configured: boolean, updatedAt: string }]

GET  /api/credentials/:provider
Response: { provider, data: { clientId: "__REDACTED__", clientSecret: "__REDACTED__" }, updatedAt }

POST /api/credentials/:provider
Body: { clientId: string, clientSecret: string }
Response: { provider, data: {...} }

POST /api/credentials/:provider/test
Response: { ok: boolean, error?: string }

DELETE /api/credentials/:provider
Response: 204

## O que implementar

### 1. Hook SWR para lista de credenciais

`apps/frontend/src/hooks/use-credentials.hook.ts`

```typescript
// Dois hooks separados (regra obrigatória):
export const useCredentialsList = () => useSWR('/credentials', ...);
export const useCredential = (provider: string) => useSWR(`/credentials/${provider}`, ...);
```

### 2. Componente ProviderCredentialForm

Criar `apps/frontend/src/components/settings/provider-credential-form.component.tsx`

Props: `{ provider: string, fields: FieldDef[], label: string }`
Onde FieldDef = `{ key: string, label: string, placeholder: string }`

Comportamento:
- Estado "não configurado": form com campos, botão "Salvar credenciais"
- Estado "configurado": mostra campos com valor mascarado ("••••••••")
  - Botão "Editar" — abre form para substituir
  - Botão "Testar conexão" — chama /test e mostra resultado
  - Botão "Remover" — delete com confirmação
- Ao salvar: preserva campos com "••••••••" enviando o SENTINEL "__REDACTED__"
- Feedback visual de loading, sucesso e erro

### 3. Página de Credenciais de Apps

Criar nova rota: `apps/frontend/src/app/(app)/(site)/settings/credentials/page.tsx`

Lista de providers a gerenciar (com label, campos e link de documentação):

| Provider | Label UI | Campos | Link docs |
|---|---|---|---|
| facebook | Facebook / Instagram | Client ID, Client Secret | developers.facebook.com |
| tiktok | TikTok | Client Key, Client Secret | developers.tiktok.com |
| pinterest | Pinterest | App ID, App Secret | developers.pinterest.com |
| linkedin | LinkedIn | Client ID, Client Secret | linkedin.com/developers |
| twitter | Twitter / X | API Key, API Secret | developer.twitter.com |
| youtube | YouTube / Google | Client ID, Client Secret | console.cloud.google.com |
| reddit | Reddit | Client ID, Client Secret | reddit.com/prefs/apps |
| discord | Discord | Client ID, Client Secret, Bot Token | discord.com/developers |
| slack | Slack | Client ID, Client Secret, Signing Secret | api.slack.com |

Cada provider aparece como card expansível com:
- Ícone/nome da rede social
- Badge "Configurado" (verde) ou "Usando variável de ambiente" (cinza)
- Ao expandir: formulário ProviderCredentialForm
- Link "Como obter estas credenciais →" abrindo docs da plataforma

### 4. Adicionar link de navegação nas Settings

Em `apps/frontend/src/app/(app)/(site)/settings/page.tsx` ou no layout de settings,
adicionar link para a nova página "Credenciais de Apps".

## Regras obrigatórias

- Usar APENAS useFetch de `libraries/helpers/src/utils/custom.fetch.tsx`
- Cada hook SWR em função separada
- NÃO instalar componentes de npm
- NÃO usar variáveis --color-custom* (depreciadas)
- Verificar componentes existentes antes de criar novos
- Rodar `pnpm lint` ao final e corrigir erros
- NÃO commitar
```

---

## Contexto e motivação

Hoje todas as credenciais de OAuth apps (FACEBOOK_APP_ID, TIKTOK_CLIENT_ID, etc.) são
variáveis de ambiente globais. Isso funciona para instalação single-tenant mas é um
bloqueio direto para multi-tenant: não é possível ter dois workspaces com apps Facebook
diferentes se a credencial é global.

Este plano resolve isso **antes** de implementar multi-tenant, tornando o multi-tenant
uma consequência natural em vez de uma refatoração dolorosa.

---

## Diagnóstico do estado atual

### O que Postiz já tem

| O que existe | Onde | Estado |
|---|---|---|
| Criptografia AES-256-CBC | `helpers/src/auth/auth.service.ts` | **Legacy** — IV fixo derivado do JWT_SECRET |
| OAuth user tokens (access/refresh) | tabela `Integration` | **Sem criptografia** — plain text |
| Org API keys criptografadas | `organization.repository.ts` | AES-256-CBC legacy |
| Custom credentials (Bluesky, Lemmy) | campo `customInstanceDetails` | AES-256-CBC legacy |

### O que está em env vars (precisamos mover para DB)

```
X_API_KEY / X_API_SECRET
LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET
REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET
FACEBOOK_APP_ID / FACEBOOK_APP_SECRET
YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET
TIKTOK_CLIENT_ID / TIKTOK_CLIENT_SECRET
PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET
DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_BOT_TOKEN_ID
SLACK_ID / SLACK_SECRET / SLACK_SIGNING_SECRET
```

### Problema de segurança identificado

Os tokens OAuth dos usuários (access_token, refresh_token do Facebook, LinkedIn, etc.)
estão armazenados **em plain text** na tabela `Integration`. Isso precisa ser corrigido
na mesma iniciativa.

---

## Avaliação do modelo n8n

O dossiê do n8n é a referência certa. O que aproveitamos e o que simplificamos:

### O que aproveitamos do n8n

- Credencial como **recurso de primeiro nível** no DB (não campo espalhado)
- **Redaction na leitura** — UI nunca recebe o secret em claro, só sentinela
- **Unredact no update** — preserva o secret quando usuário não altera o campo
- **Nunca logar payload de credencial**
- Escopo por workspace (organization no Postiz)

### O que simplificamos (sem perder segurança)

| n8n | Nosso caso (fase atual) |
|---|---|
| KMS/HSM | Env var como master key (suficiente para self-hosted) |
| Per-tenant encryption key | Uma master key, IV aleatório por registro |
| RBAC complexo (owner/sharee) | Scoped por organizationId |
| Credencial compartilhada entre projetos | Sem compartilhamento por ora |

### Upgrade de criptografia necessário

O AES-256-CBC com IV fixo (atual) tem uma fraqueza: mesma entrada sempre gera mesma
saída. Isso não é aceitável para credenciais sensíveis.

Para o novo sistema: **AES-256-GCM com nonce aleatório por registro**.

```
[versão:1 byte][nonce:12 bytes][tag:16 bytes][ciphertext:N bytes]
→ codificado em base64 como string única no DB
```

Mantemos a função legacy apenas para decriptar dados antigos durante a migração.

---

## Arquitetura proposta

### Nova entidade: `ProviderCredential`

```prisma
model ProviderCredential {
  id             String       @id @default(cuid())
  organizationId String
  provider       String       // "facebook" | "tiktok" | "late" | "linkedin" | ...
  encryptedData  String       @db.Text   // JSON criptografado (AES-256-GCM)
  keyVersion     Int          @default(1) // suporte futuro a rotação de chave
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, provider])
}
```

O campo `encryptedData` armazena JSON como:
```json
{ "clientId": "...", "clientSecret": "...", "botToken": "..." }
```

Para o Late:
```json
{ "apiKey": "sk_..." }
```

### Camada de serviço: `CredentialService`

```
Controller (Settings)
    ↓
CredentialService
    ├── create(organizationId, provider, data) → encripta → salva
    ├── get(organizationId, provider) → decripta → redact → retorna para UI
    ├── update(organizationId, provider, data) → unredact → reencripta → salva
    ├── delete(organizationId, provider)
    ├── getRaw(organizationId, provider) → decripta sem redact (uso interno/providers)
    └── test(organizationId, provider) → valida credencial com plataforma
        ↓
    EncryptionService (novo, substitui AuthService.fixedEncryption para credenciais)
        ├── encrypt(plaintext, organizationId?) → AES-256-GCM, retorna base64
        └── decrypt(ciphertext) → plaintext
```

### Redaction (padrão n8n adaptado)

```typescript
const SENTINEL = '__REDACTED__';

// Leitura para UI
function redact(data: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v ? SENTINEL : ''])
  );
}

// Escrita: preserva valores que o usuário não alterou
function unredact(
  incoming: Record<string, string>,
  current: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(incoming).map(([k, v]) => [
      k,
      v === SENTINEL ? current[k] : v,
    ])
  );
}
```

### Como os providers lêem as credenciais (compatibilidade retroativa)

```typescript
// IntegrationManager.getCredentials(provider, organizationId?)
async getCredentials(provider: string, organizationId?: string) {
  // 1. Tenta DB (per-workspace)
  if (organizationId) {
    const cred = await this.credentialService.getRaw(organizationId, provider);
    if (cred) return cred;
  }
  // 2. Fallback para env vars (instalações existentes não quebram)
  return this.getFromEnv(provider);
}
```

Isso garante: **instalações existentes continuam funcionando sem alteração**.

---

## Sequenciamento: o que fazer e quando

### Etapa 0 — Já em andamento (Fase 1 do PRD)

- [x] Branding Robô MultiPost
- [x] pt-BR como padrão
- [x] README atualizado
- [ ] Late integration (simples — só `lateApiKey` no campo da Organization por ora)

> **O Late pode ser implementado ANTES do sistema de credenciais** usando um campo
> temporário `lateApiKey String?` na tabela `Organization`. Quando o sistema de
> credenciais estiver pronto, migra para `ProviderCredential` com provider = "late".

### Etapa 1 — Sistema de credenciais (pré-requisito para multi-tenant)

**Duração estimada:** Feature média/grande — 2 a 3 sessões de desenvolvimento

1. **`EncryptionService`** — AES-256-GCM, nonce aleatório, versionamento de chave
2. **Migration Prisma** — nova tabela `ProviderCredential`
3. **`CredentialService`** — CRUD + redact/unredact + getRaw para providers
4. **Atualizar `IntegrationManager`** — ler credenciais via DB com fallback para env
5. **UI nas Settings** — página "Credenciais de Aplicativos" por workspace
6. **Migrar OAuth tokens** da tabela `Integration` de plain text para criptografado
7. **`docs/credential-management.md`** — document-first

### Etapa 2 — Multi-tenant

Com credenciais já isoladas por `organizationId`, o multi-tenant é:
- Múltiplas Organizations por conta de usuário
- UI de switcher de workspace
- Isolamento já garantido pelo `organizationId` nas queries

### Etapa 3 — Migração de env vars (opcional, gradual)

Usuários existentes continuam usando env vars (fallback). Novos usuários configuram
pela UI. Eventual deprecation das env vars em versão futura com aviso antecipado.

---

## Contratos de API (API-First)

### Endpoints de credencial

```
GET    /api/credentials                    → lista providers configurados (sem secrets)
GET    /api/credentials/:provider          → retorna dados redigidos por sentinela
POST   /api/credentials/:provider          → cria/sobrescreve credencial
PATCH  /api/credentials/:provider          → atualiza parcialmente (suporte a sentinela)
DELETE /api/credentials/:provider          → remove credencial
POST   /api/credentials/:provider/test     → testa se a credencial é válida
```

Todos os endpoints escopados ao workspace do usuário autenticado via JWT.

**Exemplo de response GET (redigido):**
```json
{
  "provider": "facebook",
  "configured": true,
  "data": {
    "clientId": "__REDACTED__",
    "clientSecret": "__REDACTED__"
  },
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

**Nunca retornar valores reais** — nem para owner, nem em nenhuma rota.

---

## Checklist de segurança (baseado no dossiê n8n)

- [ ] Segredo criptografado em repouso (AES-256-GCM, nonce aleatório por registro)
- [ ] Master key fora do banco (env var `ENCRYPTION_KEY`, separada do `JWT_SECRET`)
- [ ] Redaction em toda leitura para frontend
- [ ] Unredact em toda atualização (preserva secret quando usuário não alterou)
- [ ] Sem segredo em logs ou stack traces
- [ ] Scoped por organizationId (sem cross-workspace access)
- [ ] Versionamento de chave (`keyVersion`) para rotação futura
- [ ] Fallback para env vars (compatibilidade retroativa)
- [ ] Testes unitários de criptografia e redact/unredact
- [ ] Testes de autorização (outro workspace não acessa)
- [ ] OAuth tokens da tabela Integration migrados para criptografado

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Perda da `ENCRYPTION_KEY` em produção | Documentar backup obrigatório da key no onboarding |
| Quebra de instalações existentes | Fallback para env vars garante compatibilidade |
| Migration de OAuth tokens em plain text | Migração batch com zero-downtime (reencripta no next access) |
| Complexidade de implementação | Entregar EncryptionService + CredentialService como módulo isolado e testável |

---

## Referências

- Dossiê n8n: `n8n-credential-architecture-dossier.md`
- PRD: `PRD.md` (Fase 2 — Multi-workspace)
- Padrão de providers atual: `libraries/nestjs-libraries/src/integrations/social.abstract.ts`
- Criptografia legacy: `libraries/helpers/src/auth/auth.service.ts`
- prisma-field-encryption: https://github.com/47ng/prisma-field-encryption
