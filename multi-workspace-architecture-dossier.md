# Dossie Tecnico: Arquitetura Multi-Workspace/Multi-Perfil para o Robo MultiPost

## Objetivo

Este documento compila um estudo aprofundado de como 4 plataformas open-source consolidadas implementam multi-tenancy, multi-workspace e gestao de credenciais, mapeando para a realidade do Robo MultiPost. O objetivo e fornecer base tecnica completa para que um agente de IA (ou desenvolvedor) possa implementar o sistema de multi-perfil no MultiPost com seguranca e consistencia.

---

## Modelo Proposto para o MultiPost

```
Workspace (agencia)
   |
   +-- Profile (cliente)
   |      |
   |      +-- Account (instagram, threads, tiktok...)
   |      +-- Account (facebook page)
   |      +-- Calendar (agenda propria)
   |      +-- Media Library (midias do cliente)
   |      +-- Posts (conteudo agendado)
   |      +-- Settings (preferencias do cliente)
   |      +-- Tags (etiquetas do cliente)
   |
   +-- Profile (outro cliente)
          +-- ...

Exemplo concreto:
  Workspace: Agencia XP
  Profiles:
    +-- Cliente Nike
    |     +-- Instagram Nike (@nike)
    |     +-- Instagram Nike Sport (@nikesport)
    |     +-- Threads Nike
    |
    +-- Cliente Adidas
          +-- Instagram Adidas
          +-- Facebook Adidas
```

### Hierarquia de 3 niveis vs 2 niveis

A maioria das plataformas usa **2 niveis** (Workspace > Resources). O MultiPost propoe **3 niveis** (Workspace > Profile > Resources) porque:

1. **Caso de uso de agencia**: Uma agencia gerencia N clientes, cada um com suas proprias contas sociais, calendario e midias
2. **Isolamento por cliente**: O cliente Nike nao deve ver posts da Adidas, mesmo estando na mesma agencia
3. **Login do cliente**: O cliente pode ter acesso restrito apenas ao seu perfil, sem ver outros perfis do workspace
4. **Billing futuro**: Possibilidade de cobrar por perfil/cliente

---

## 1. ESTADO ATUAL DO MULTIPOST (Postiz)

### Arquitetura Existente

O Postiz ja possui um conceito de **Organization** que funciona como tenant. A estrutura atual:

```
User (conta global)
  |
  +-- UserOrganization (join table, many-to-many)
        +-- Organization (tenant atual)
              +-- Integration (contas sociais com tokens OAuth)
              +-- Post (conteudo agendado)
              +-- Media (midias)
              +-- Tags (etiquetas)
              +-- Comments
              +-- Notifications
              +-- Signatures
              +-- Webhooks
              +-- AutoPost
              +-- ThirdParty
              +-- ProviderCredential (credenciais OAuth criptografadas)
              +-- Customer (agrupamento leve de integracoes)
              +-- Subscription (1:1)
```

### Tabelas com `organizationId` (scoping atual)

| Tabela | FK | Proposito |
|--------|----|-----------|
| Integration | organizationId | Conexoes de redes sociais (tokens OAuth) |
| Post | organizationId | Posts agendados/publicados |
| Media | organizationId | Arquivos de midia |
| Tags | orgId | Etiquetas |
| Comments | organizationId | Comentarios em posts |
| Notifications | organizationId | Notificacoes in-app |
| Signatures | organizationId | Assinaturas de posts |
| Plugs | organizationId | Plugins de automacao |
| Webhooks | organizationId | Configuracoes de webhook |
| AutoPost | organizationId | RSS/auto-post |
| Sets | organizationId | Templates de conteudo |
| ThirdParty | organizationId | Conexoes terceiros |
| Credits | organizationId | Creditos IA |
| Subscription | organizationId (unique) | Assinatura (1:1) |
| Customer | orgId | Agrupamento de integracoes |
| Errors | organizationId | Logs de erro |
| GitHub | organizationId | Integracao GitHub |
| ProviderCredential | organizationId | Credenciais OAuth app (criptografadas) |

### Tabelas Globais (sem scoping)

- `User` — contas de usuario
- `Trending`, `TrendingLog` — dados de trending
- `PopularPosts` — templates de conteudo
- `Mentions` — autocomplete de mencoes
- `mastra_*` — infraestrutura IA

### Como o Contexto de Organizacao e Resolvido

**Backend (NestJS):**

1. JWT extraido de `req.headers.auth` ou `req.cookies.auth`
2. JWT verificado para extrair objeto `User`
3. Cookie/header `showorg` determina a organizacao ativa
4. Todas as organizacoes do usuario carregadas via `getOrgsByUserId(user.id)`
5. Org ativa = a que corresponde ao `showorg`, ou a primeira se nao especificado
6. Org selecionada anexada a `req.org`
7. Decorator `@GetOrgFromRequest()` extrai `req.org` nos controllers

**Frontend (Next.js):**

- Dropdown de organizacao quando usuario tem >1 org
- Switch via `POST /user/change-org` com org ID
- Backend seta cookie `showorg`, frontend recarrega a pagina
- React Context fornece `orgId`, `tier`, `role`, `publicApi`, `totalChannels`

### Sistema de Credenciais Atual

**Dois sistemas distintos:**

#### A. Tokens OAuth de Integracao (por canal social)

Tabela `Integration`:
- `token`: token OAuth (armazenado em **texto plano** por padrao)
- `refreshToken`: refresh token (texto plano)
- `tokenExpiration`: expiracao do access token
- `tokenEncrypted`: flag boolean (default `false`)
- Refresh automatico via `IntegrationService.refreshTokens()`

#### B. Credenciais de App OAuth (por org, por provider)

Tabela `ProviderCredential`:
- `provider`: ex: "facebook", "twitter"
- `encryptedData`: JSON criptografado com **AES-256-GCM** (12-byte nonce)
- `keyVersion`: para rotacao futura (atualmente versao 1)
- Unique constraint: `[organizationId, provider]`

**EncryptionService** (`libraries/nestjs-libraries/src/crypto/encryption.service.ts`):
- AES-256-GCM com nonce de 12 bytes
- Master key derivada de `ENCRYPTION_KEY` (fallback para `JWT_SECRET`)
- Suporte a formato legado AES-256-CBC
- Metodos: `encryptJson()` / `decryptJson()`

#### C. Criptografia Fixa (Legada)

`AuthService.fixedEncryption()` / `fixedDecryption()`:
- AES-256-CBC com chave derivada de `JWT_SECRET`
- Usada para: `Organization.apiKey`, `lateApiKey`
- Deterministica (mesma entrada = mesma saida)

### RBAC Atual

**Roles** (enum no schema):
- `SUPERADMIN` — criador/dono da org
- `ADMIN` — administrador
- `USER` — membro

**`User.isSuperAdmin`** — flag de super admin da plataforma (pode impersonar)

**Permissoes** via [CASL](https://casl.js.org/):
- Sections: CHANNEL, POSTS_PER_MONTH, VIDEOS_PER_MONTH, TEAM_MEMBERS, COMMUNITY_FEATURES, AI, ADMIN, WEBHOOKS
- Se nao tem `STRIPE_PUBLISHABLE_KEY` (self-hosted): todas as permissoes concedidas
- ADMIN section requer role ADMIN ou SUPERADMIN

### Modelo `Customer` — Base para "Profile"

O modelo `Customer` (linha 299 do schema) ja fornece um mecanismo leve de agrupamento:
- Integracoes podem ser associadas a Customers dentro de uma org
- Atualmente e apenas visual, sem isolamento de dados
- **Pode servir como base para expandir em "Profile"**

### Observacoes Criticas

1. **Tokens OAuth em texto plano** — `Integration.token` nao e criptografado por padrao
2. **Isolamento por query** — cada repository filtra por `orgId`, sem RLS no banco
3. **Sem audit trail** — nao ha log de quem fez o que dentro da org
4. **Deteccao cross-org** — `checkPreviousConnections` verifica se mesma conta social esta conectada em outra org
5. **1:1 Subscription por Org** — sem billing compartilhado
6. **Sem tabela de settings dedicada** — configuracoes estao em colunas do modelo Organization ou em env vars

---

## 2. CHATWOOT — Referencia de Multi-Tenancy Consolidada

### Resumo

| Aspecto | Detalhe |
|---------|---------|
| **Stack** | Ruby on Rails, PostgreSQL, Redis, Sidekiq |
| **Modelo** | Single shared DB, `account_id` em todas as tabelas |
| **Hierarquia** | Installation > Account > (Teams, Inboxes, Contacts, Conversations) |
| **Open-source** | Sim (MIT) — github.com/chatwoot/chatwoot |

### Hierarquia de Dados

```
Installation (Super Admin)
  +-- Account (tenant raiz)
        +-- AccountUser (join: User <-> Account, com role)
        +-- Inbox (1 inbox = 1 canal, polimorfismo via channel_type/channel_id)
        |     +-- Channel::WebWidget, Channel::Email, Channel::Whatsapp...
        |     +-- InboxMember (Agent <-> Inbox)
        |     +-- ContactInbox (Contact por canal)
        +-- Team (grupo de agentes)
        |     +-- TeamMember
        +-- Contact (cliente/visitante, 1 account)
        +-- Conversation (Contact + Inbox)
        |     +-- Message
        +-- Label, CannedResponse, AutomationRule, Macro, Campaign
        +-- Webhook, Integration (Slack, etc.)
        +-- Portal (Help Center / Knowledge Base)
        |     +-- Category, Article
        +-- CustomAttributeDefinition, CustomFilter, Dashboard
        +-- WorkingHour, Notification, AgentBot
        +-- features (coluna JSONB na tabela accounts)
```

### Pontos-Chave de Design

- O modelo `Account` tem **40+ associacoes `has_many`**
- `account_id` presente em **virtualmente toda tabela de negocio**
- **Sem foreign keys no banco** — relacionamentos enforced apenas no Rails
- Conversation `display_id` e um counter auto-incrementante **por account** (via PostgreSQL sequence)
- JSONB extensivo para settings, features, custom_attributes

### Autenticacao e Acesso

**Stack de auth:** DeviseTokenAuth (token-based, JWT-like). Suporta OAuth2 e SAML SSO (enterprise).

**Multi-account:**
- Um User autentica uma vez (identidade unica) e pode pertencer a **multiplos accounts**
- Join table `account_users` com `role` (integer enum: 0=agent, 1=administrator) e `custom_role_id`
- Roles **diferentes por account** (admin no Account A, agent no Account B)

**Switching de account:**
- Contexto determinado pela **URL**: `/api/v1/accounts/{account_id}/*`
- Frontend permite trocar entre accounts via dropdown

**Super Admin:**
- Nivel de **instalacao**, acima de todos os accounts
- Primeiro usuario criado no onboarding se torna super admin
- Acessa console `/super_admin` (interface tipo Rails Admin)
- Pode criar/gerenciar accounts, users, roles, ver filas Sidekiq
- Emite Platform API tokens

**Login de cliente/contato:**
- Contatos **NAO tem login proprio**. Nao ha dashboard de cliente
- Identificacao via HMAC no widget de chat
- Portal e Help Center publico, nao area logada

**Modelo de agencia:**
- Suportado nativamente: um usuario (operador da agencia) e adicionado como admin/agent em multiplos accounts
- Platform API permite provisionamento programatico de accounts
- **Nao ha conceito first-class de "agencia"** — e simplesmente um usuario em N accounts
- Requests da comunidade pedem melhor suporte (Issues #7490, #11109)

### RBAC

**Roles built-in:**

| Role | Valor | Permissoes |
|------|-------|-----------|
| Agent | 0 | Ver/responder conversas em inboxes atribuidas. Acesso limitado a settings. |
| Administrator | 1 | Acesso total: settings, inboxes, integracoes, agentes, teams. |

**Custom Roles (Enterprise):**
- Via `custom_role_id` na `account_users`
- Permissoes granulares: "Gerenciar Todas Conversas" vs "Gerenciar Nao Atribuidas e Proprias"

**Autorizacao:** [Pundit](https://github.com/varvet/pundit) 2.3.0 com policies por recurso.

### Isolamento de Settings

| Nivel | Escopo | Storage | Exemplos |
|-------|--------|---------|----------|
| Global | Toda instalacao | YAML + env vars + Redis cache | SMTP, storage, branding, FRONTEND_URL |
| Account | Por account | Colunas da tabela + JSONB `settings` + JSONB `features` | Auto-resolve, horarios, feature flags, locale |
| User | Por usuario (cross-account) | Tabela users + localStorage | Notificacoes, tema, preferencias de editor |

**Gaps conhecidos:**
- SMTP e global, nao per-account
- Frontend URL e global
- Preferencias de notificacao sao per-user globalmente, nao per-inbox

### Credenciais de Canal

- Cada tipo de canal tem **sua propria tabela**: `channel_email`, `channel_whatsapp`, `channel_facebook_page`, `channel_twitter_profile`, etc.
- `Inbox` usa **associacao polimorfica** (`channel_type` + `channel_id`)
- **Active Record Encryption** para campos sensiveis (chaves via env vars)
- Webhooks **totalmente scoped per account** com signing secret

**Tipos de token:**

| Tipo | Escopo | Uso |
|------|--------|-----|
| User Access Token | Per-user, funciona cross-accounts | API do dashboard |
| Platform API Token | Nivel de instalacao (super admin) | Provisionamento cross-account |
| Bot/Widget Token | Per-inbox | Identidade do chat widget (HMAC) |
| Webhook Secret | Per-webhook (per-account) | Verificacao de assinatura |

### Feature Flags

- Definidos em `config/features.yml` (YAML, ordem fixa)
- Armazenados **per account** em `accounts.features` (JSONB)
- Verificados em runtime (backend Rails e frontend Vue.js)
- Categorias: Core (sempre on), Channel Support, Automation, Premium (pago), Internal/Beta

### Patterns Tecnicos

**Scoping de controller:**

```
ApplicationController
  +-- Api::BaseController (authenticate_access_token!)
        +-- Api::V1::Accounts::BaseController
              +-- set_current_account (from route params[:account_id])
              +-- Current.account (Rails CurrentAttributes, thread-local)
              +-- Todos controllers account-scoped herdam daqui
```

**Query scoping — MANUAL:**
```ruby
current_account.conversations.find(params[:id])
current_account.inboxes.where(...)
```
- Nao ha `default_scope` automatico — cada controller deve explicitamente filtrar pela account
- Pundit Scopes adicionam filtragem extra (agentes so veem inboxes atribuidas)

**Background jobs (Sidekiq):**
- `account_id` passado como argumento do job
- Jobs carregam a account e fazem query scoped
- **Sem middleware Sidekiq para auto-tenant switching**

### Licoes para o MultiPost

1. **`account_id` em toda tabela** — pattern simples mas requer disciplina em cada query
2. **JSONB para settings e features** — flexivel, mas mais dificil de validar
3. **Scoping manual e mais seguro que default_scope** — evita bugs de escopo vazado
4. **Canais polimorficos** — cada tipo de canal tem schema proprio (bom para credenciais diferentes)
5. **Feature flags per-account** — otimo para tiers/planos diferenciados
6. **Sem conceito de "perfil" dentro do account** — gap que o MultiPost pode preencher

---

## 3. TOOLJET — Referencia de Workspace com Credenciais Isoladas

### Resumo

| Aspecto | Detalhe |
|---------|---------|
| **Stack** | NestJS (TypeScript), TypeORM, PostgreSQL, React |
| **Modelo** | Single shared DB, `organizationId` em todas as tabelas |
| **Hierarquia** | Instance > Organization (Workspace) > Apps/Data Sources |
| **Open-source** | Sim — github.com/ToolJet/ToolJet |

### Hierarquia de Dados

```
Instance (Super Admin)
  +-- Organization/Workspace (tenant)
        +-- OrganizationUser (join: User <-> Org, com role)
        +-- App (aplicacao low-code)
        +-- DataSource (conexao de dados, com credenciais)
        |     +-- DataSourceOptions (credenciais per-environment)
        +-- Folder (organizacao de apps)
        +-- GroupPermission (RBAC granular)
        +-- SSOConfigs (auth per-workspace)
        +-- AppEnvironment (Dev/Staging/Prod)
        +-- InternalTable (ToolJet DB)
        +-- OrganizationThemes (branding)
        +-- OrganizationGitSync (1:1)
        +-- WhiteLabelling (1:1)
```

### Autenticacao — Modelo de 2 Niveis

**Nivel de instancia:**
- Configurado pelo Super Admin
- Aplica como default para todos os workspaces
- Suporta Google, GitHub, OpenID Connect SSO

**Nivel de workspace:**
- Pode **herdar** do instance OU **sobrescrever** com configs proprias
- Cada workspace pode ter seus proprios providers SSO (SAML, OIDC, LDAP, Google, GitHub)
- Multiplos providers OIDC simultaneamente (ex: Okta + Azure AD + Auth0)

**Tabela `SSOConfigs`:**
- `organizationId` (nullable — null = instance-scope)
- `configScope` enum: `organization` | `instance`
- `sso` enum: Google, Git, Form, OpenID, LDAP, SAML
- `configs` (JSON blob com dados especificos do provider)
- `enabled` boolean

**Multi-workspace:**
- User pode pertencer a multiplos workspaces via `OrganizationUser`
- `User.defaultOrganizationId` determina qual workspace carrega no login
- Switching via navegacao; deep links roteiam pelo workspace-specific login

### RBAC — Roles + Custom Groups

**3 roles predefinidos por workspace:**

| Role | Editavel? | Capacidades |
|------|-----------|-------------|
| Admin | Nao | Acesso total: users, groups, SSO, apps, data sources, settings, constants |
| Builder | Sim | Construir/editar apps, criar data sources, gerenciar pastas |
| End User | Nao | Apenas visualizar e usar apps publicados |

**Custom Groups (camada de granularidade):**
- Admins criam grupos nomeados (ex: "RH", "Vendas", "Engenharia")
- Permissoes granulares por grupo:
  - **App**: Edit ou View (todos ou apps especificos)
  - **Data source**: Create, Delete, Configure (todos ou especificos)
  - **Folder**: Create, Update, Delete
  - **Workspace constants**: Create, Delete
  - **Environment variables**: Create, Update, Delete

**Enterprise:** Row-level, component-level, page-level e query-level security. SCIM e group sync.

### Credenciais e Data Sources — DESTAQUE

**Este e o modelo mais relevante para o MultiPost em termos de credenciais isoladas.**

**Escopo de data source:**
- Cada `DataSource` tem `organizationId` + `scope` (local vs global)
- Global = qualquer app no workspace pode usar
- **Credenciais NAO podem ser compartilhadas entre workspaces**

**Criptografia:**
- **Lockbox** com **AES-256-GCM**
- Master key: `LOCKBOX_MASTER_KEY` (32-byte hex string)
- Key derivation: **HKDF com SHA-384**, derivando chaves per-coluna
- `computeAttributeKey(tableName, columnName, masterKey)` → chave derivada especifica
- Credenciais em `data_source_options` como JSON criptografado, chaveado por `(dataSourceId, environmentId)`

**Credenciais NUNCA expostas ao frontend:**
- Servidor age como proxy — queries executam server-side
- Apenas resultados sao enviados ao cliente

**Credenciais per-environment:**
- `DataSourceOptions` liga `dataSourceId` a `environmentId`
- Permite credenciais diferentes para Dev, Staging e Production

**Workspace Constants & Secrets:**
- Vault embutido para API keys, credenciais de banco, etc.
- Dois tipos:
  - **Global Constants**: valores reutilizaveis (visiveis)
  - **Secrets**: criptografados, mascarados no frontend, acessiveis via `{{secrets.secret_name}}`
- Constants podem ter **valores diferentes por environment**

### Patterns Tecnicos

- **NestJS backend** (mesma stack do MultiPost!)
- TypeORM como ORM
- JWT com context de organizacao
- Guards validam que usuario pertence a organizacao solicitada
- `@CurrentUser()` decorator + JWT auth guard + organization guard
- **BullMQ** para background jobs (migrou do Temporal)
- Jobs carregam `organizationId` no payload

### Licoes para o MultiPost

1. **SSO per-workspace** — modelo maduro para agencias com clientes que usam SSO diferentes
2. **Credenciais per-environment** — util para dev/staging/prod
3. **HKDF para derivacao de chaves** — melhor que usar mesma key para tudo
4. **Servidor como proxy** — credenciais nunca saem do backend
5. **Constants + Secrets** — vault embutido sem depender de servico externo
6. **Mesmo stack (NestJS)** — patterns podem ser adaptados diretamente

---

## 4. N8N — Referencia de Gestao de Credenciais Criptografadas

### Resumo

| Aspecto | Detalhe |
|---------|---------|
| **Stack** | Node.js, TypeScript, TypeORM, PostgreSQL/SQLite |
| **Modelo** | Instance > Projects > Workflows/Credentials |
| **Open-source** | Sim (Fair-code) — github.com/n8n-io/n8n |

### Sistema de Credenciais — DESTAQUE

#### Algoritmo: AES-256-CBC

**Fluxo de criptografia:**
1. Salt aleatorio de 8 bytes gerado por operacao
2. Key e IV derivados via `EVP_BytesToKey`-style KDF (master key + salt)
3. Criptografa com `createCipheriv('aes-256-cbc', derivedKey, derivedIV)`
4. Output em base64: `"Salted__"` (8 bytes) + salt (8 bytes) + ciphertext

**Fluxo de descriptografia:**
1. Base64-decode do valor armazenado
2. Verificar prefixo `Salted__`
3. Extrair salt dos bytes 8-16
4. Derivar key e IV com mesma KDF
5. Descriptografar com `createDecipheriv('aes-256-cbc', key, iv)` a partir do byte 16

**Master key:** `N8N_ENCRYPTION_KEY` (env var). Se nao setada, auto-gerada no primeiro boot. Se perdida, credenciais sao **irrecuperaveis**.

**Codigo fonte:** `packages/core/src/Cipher.ts`

#### Schema do Banco

**`credentials_entity`:**
- `id` — PK
- `name` — nome legivel
- `type` — tipo (ex: `githubApi`, `slackApi`)
- `data` — payload criptografado AES-256-CBC (base64)
- `createdAt` / `updatedAt`

**`shared_credentials`:** many-to-many entre credenciais e projects/users, com role info (ex: `credential:owner`)

#### Compartilhamento de Credenciais

- Credenciais podem ser compartilhadas com usuarios individuais (de projetos pessoais) ou com todos os membros de um team project
- Usuarios compartilhados podem **usar** a credencial mas **NAO podem ver/editar** os valores secretos
- **Redacao por campo**: campos de senha (`typeOptions.password = true`), tokens OAuth, e valores vazios sao substituidos por valores sentinela antes de enviar ao frontend
- Parametro `includeData` na API retorna dados decriptados apenas para usuarios com scope `credential:update`

#### Resolucao em Runtime

Quando um workflow executa:
1. Node chama `getCredentials(type: string)`
2. Sistema carrega a credencial do banco
3. `Cipher.decrypt()` descriptografa os dados
4. Expressoes de external secrets resolvidas: `{{ $secrets.awsSecretsManager.my_api_key }}`
5. Objeto decriptado passado ao contexto de execucao do node

```
[UI cria credencial] → [API encrypta] → [DB armazena encrypted]
       ↓
[Workflow executa] → [Node pede credencial] → [Cipher.decrypt()]
       ↓
[External secrets resolvidos] → [Dados decriptados passados ao node]
```

### Projects (Multi-Workspace)

| Aspecto | Personal Project | Team Project |
|---------|-----------------|--------------|
| Criado para | Todo usuario automaticamente | Por owners/admins |
| Membros | Unico dono | Multiplos membros com RBAC |
| Compartilhamento | Workflows individuais | Todos membros acessam todos recursos |
| Credenciais | Pessoais | Compartilhadas dentro do projeto |
| Disponibilidade | Todos os planos | Pro e Enterprise |

### RBAC

**Nivel de instancia:**

| Role | Capacidades |
|------|-------------|
| Owner | Acesso total. Um por instancia. |
| Admin | Criar projetos, gerenciar usuarios. |
| Member | Limitado a projetos atribuidos e recursos compartilhados. |

**Nivel de projeto:**

| Role | Capacidades | Plano |
|------|-------------|-------|
| Project Admin | Settings, membros, CRUD completo | Pro+ |
| Project Editor | CRUD em workflows/credenciais/execucoes | Pro+, Self-hosted Enterprise |
| Project Viewer | Read-only, sem executar workflows | Enterprise |
| Custom Roles | Permissoes granulares por tipo de recurso | Enterprise |

### External Secrets (Enterprise)

- Busca valores sensiveis de vault externo em runtime
- Providers: AWS Secrets Manager, Azure Key Vault, GCP Secrets Manager, HashiCorp Vault
- Multiplos vaults por provider (v2.10.0+)
- Expressao: `{{ $secrets.<providerName>.<secretName> }}`
- Vaults podem ser **restritos a um projeto especifico**
- Valor **nunca persiste** no banco do n8n

### Licoes para o MultiPost

1. **AES-256-CBC com salt aleatorio** — ja e similar ao que o MultiPost usa (GCM e melhor)
2. **Redacao por campo** — padrao excelente para API que retorna credenciais ao frontend
3. **External Secrets** — integracao com vaults externos e diferencial para enterprise
4. **Permissao de credencial separada de permissao de workflow** — usuario pode usar sem ver
5. **`N8N_ENCRYPTION_KEY` como unico segredo** — simplifica operacoes mas cria ponto unico de falha
6. **Projects como boundary de autorizacao** — similar ao "Profile" proposto para o MultiPost

---

## 5. MIXPOST — Referencia de Social Media com Workspaces

### Resumo

| Aspecto | Detalhe |
|---------|---------|
| **Stack** | Laravel (PHP), PostgreSQL/MySQL, Redis, Vue 3, Inertia.js |
| **Modelo** | Single DB, `workspace_id` em tabelas (Pro/Enterprise) |
| **Hierarquia** | Installation > Workspace > Social Accounts/Posts/Media |
| **Open-source** | Lite: MIT (sem workspaces) / Pro+Enterprise: proprietary |

### Hierarquia

```
Installation
  +-- Workspace (UUID + integer id)
        +-- Social Accounts (OAuth, encrypted tokens)
        +-- Posts
        |     +-- Post Versions (variantes per-account)
        |     +-- Post Activities (comentarios, aprovacoes)
        +-- Media Library
        +-- Tags
        +-- Settings (preferencias do workspace)
        +-- Metrics / Analytics (per-account)
        +-- Audience (historico de followers)
        +-- Team Members (users com roles)
```

### Autenticacao e Acesso

- **Package de auth separado** (`inovector/mixpost-auth`)
- Login em `/mixpost/login`
- User pode pertencer a **multiplos workspaces** (many-to-many via `mixpost_workspace_user`)
- Por default, cada user pode **own** apenas 1 workspace (configuravel no Enterprise)
- Contexto de workspace via **parametro de rota UUID**: `/mixpost/api/{workspaceUuid}/*`
- Switching = mudar a URL (SPA com Inertia.js)

**Super Admin (Enterprise):**
- Acessa "Enterprise Console" (menu inferior esquerdo)
- Gerencia workspaces, subscriptions, config global

### RBAC

Via `WorkspaceUserRole` enum na pivot table `mixpost_workspace_user`:

| Role | Capacidades |
|------|-------------|
| Admin | Controle total: accounts, posts, settings, team, aprovar conteudo |
| Member | Criar/editar posts, gerenciar midia. Nao pode aprovar ou gerenciar settings |
| Viewer | Acesso read-only |

**Approval Workflow (Pro v3+):**
- Coluna `can_approve` (boolean) na pivot table
- Posts com status "Needs Approval"
- Cadeia de aprovacao multi-nivel
- Comentarios de revisao via `mixpost_post_activities`

### Credenciais de Conta Social

**Tabela `mixpost_accounts`:**

| Coluna | Tipo | Notas |
|--------|------|-------|
| uuid | string, unique | Identificador externo |
| name | string | Nome display |
| provider | string | "facebook", "twitter", "mastodon" |
| provider_id | string | ID da conta na plataforma |
| authorized | boolean | Se o token ainda e valido |
| access_token | longText, **encrypted** | Cast `EncryptArrayObject`, hidden da serializacao |

- Unique constraint em `[provider, provider_id]`
- Em Pro/Enterprise, `workspace_id` adicionado para scoping
- Evento `AccountUnauthorized` disparado quando token expira

**Credenciais de servico (API keys):**
- Tabela `mixpost_services` — normalmente **global**
- Excecao: Twitter/X permite **override per-workspace** via `WorkspaceServiceManager`

### Schema do Banco (Lite)

1. `mixpost_services` — configs globais de servico
2. `mixpost_accounts` — contas sociais conectadas
3. `mixpost_posts` — posts com status e agendamento
4. `mixpost_post_accounts` — pivot: posts <-> accounts
5. `mixpost_post_versions` — variantes de conteudo per-account
6. `mixpost_tags` — etiquetas coloridas
7. `mixpost_tag_post` — pivot: tags <-> posts
8. `mixpost_media` — arquivos (disk, path, mime_type, conversions)
9. `mixpost_settings` — key-value store
10. `mixpost_imported_posts` — posts importados de plataformas
11. `mixpost_facebook_insights` — analytics Facebook
12. `mixpost_metrics` — metricas gerais per-account
13. `mixpost_audience` — historico de followers

**Pro/Enterprise adiciona:**
14. `mixpost_workspaces` — definicoes de workspace
15. `mixpost_workspace_user` — pivot com `role` enum e `can_approve` boolean
16. `mixpost_post_activities` — comentarios e aprovacoes
17. `mixpost_user_tokens` — tokens de API per-user

### Fluxo de Contexto

```
HTTP Request → Route: /mixpost/api/{workspaceUuid}/posts
  → Global Middleware (Auth, CSRF, Inertia)
    → Workspace Middleware (resolve workspace do UUID, bind no container)
      → Controller (acessa workspace atual, queries auto-scoped)
        → Model queries usam workspace_id do contexto
```

### Licoes para o MultiPost

1. **UUID para workspace** — melhor que integer IDs em URLs (seguranca, previsibilidade)
2. **Contexto via rota, nao cookie** — mais RESTful e stateless que o `showorg` cookie do Postiz
3. **Approval workflow** — funcionalidade critica para agencias
4. **Post Versions per-account** — adaptar conteudo por rede social
5. **Service keys global com override per-workspace** — bom modelo hibrido
6. **Tokens encrypted com cast nativo do framework** — simples e seguro

---

## 6. ANALISE COMPARATIVA

### Modelo de Tenancy

| Plataforma | Abordagem | Tenant Key | Nivel de Hierarquia |
|------------|-----------|-----------|---------------------|
| Chatwoot | Single DB, application-scoped | `account_id` | 2 (Account > Resources) |
| ToolJet | Single DB, application-scoped | `organizationId` | 2 (Org > Resources) |
| n8n | Single DB, application-scoped | Project membership | 2 (Project > Resources) |
| Mixpost | Single DB, application-scoped | `workspace_id` | 2 (Workspace > Resources) |
| **Postiz atual** | Single DB, application-scoped | `organizationId` | 2 (Org > Resources) |
| **MultiPost proposto** | Single DB, application-scoped | `workspaceId` + `profileId` | **3 (Workspace > Profile > Resources)** |

### Autenticacao e SSO

| Plataforma | Multi-tenant login | SSO per-tenant | Client login |
|------------|-------------------|----------------|-------------|
| Chatwoot | Sim (URL-based) | Enterprise (SAML) | Nao (HMAC widget) |
| ToolJet | Sim (JWT + guards) | **Sim, per-workspace** | N/A |
| n8n | Sim (project membership) | Enterprise (SAML, OIDC) | N/A |
| Mixpost | Sim (URL-based UUID) | Nao documentado | Nao |
| **MultiPost** | Sim (cookie-based) | A implementar | **Sim (proposto)** |

### Criptografia de Credenciais

| Plataforma | Algoritmo | Key Management | Per-tenant keys? |
|------------|-----------|---------------|------------------|
| Chatwoot | Active Record Encryption | Env vars (3 keys) | Nao |
| ToolJet | **AES-256-GCM via Lockbox** | `LOCKBOX_MASTER_KEY` + **HKDF per-column** | Nao (derivadas) |
| n8n | AES-256-CBC | `N8N_ENCRYPTION_KEY` + salt aleatorio | Nao |
| Mixpost | Laravel Encryption (AES-256-CBC) | `APP_KEY` | Nao |
| **Postiz atual** | AES-256-GCM (ProviderCredential) / plaintext (Integration) | `ENCRYPTION_KEY` / `JWT_SECRET` | Nao |

### RBAC

| Plataforma | Roles Built-in | Custom Roles | Granularidade |
|------------|---------------|-------------|---------------|
| Chatwoot | Agent, Admin | Enterprise (custom_role_id) | Por recurso (Pundit policies) |
| ToolJet | Admin, Builder, End User | **Custom Groups com permissoes granulares** | App, DataSource, Folder, Constants |
| n8n | Owner, Admin, Member | Enterprise (por tipo de recurso) | Instance + Project level |
| Mixpost | Admin, Member, Viewer | Nao | Workspace level + can_approve |
| **Postiz** | SuperAdmin, Admin, User | Nao | Subscription-based (CASL) |

---

## 7. RECOMENDACOES DE IMPLEMENTACAO PARA O MULTIPOST

### 7.1. Hierarquia de Dados Proposta

```prisma
// Workspace = Agencia
model Workspace {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  settings    Json?    // JSONB para settings flexiveis
  features    Json?    // Feature flags per-workspace
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members     WorkspaceMember[]
  profiles    Profile[]
  credentials WorkspaceCredential[]  // API keys de providers (Facebook App, etc.)
}

// WorkspaceMember = Quem pertence ao workspace e com qual role
model WorkspaceMember {
  id          String   @id @default(uuid())
  userId      String
  workspaceId String
  role        WorkspaceRole  // OWNER, ADMIN, MEMBER
  status      MemberStatus   // ACTIVE, INVITED, DISABLED
  createdAt   DateTime @default(now())

  user        User      @relation(fields: [userId])
  workspace   Workspace @relation(fields: [workspaceId])

  @@unique([userId, workspaceId])
}

// Profile = Cliente da agencia
model Profile {
  id          String   @id @default(uuid())
  workspaceId String
  name        String   // "Nike", "Adidas"
  slug        String
  avatar      String?
  settings    Json?    // Settings especificos do perfil
  timezone    String?  // Timezone do cliente
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace   Workspace @relation(fields: [workspaceId])
  members     ProfileMember[]
  accounts    Integration[]  // Contas sociais
  posts       Post[]
  media       Media[]
  tags        Tags[]
  signatures  Signatures[]
  // ... demais entidades

  @@unique([workspaceId, slug])
}

// ProfileMember = Acesso granular por perfil
model ProfileMember {
  id          String   @id @default(uuid())
  userId      String
  profileId   String
  role        ProfileRole  // MANAGER, EDITOR, VIEWER, CLIENT
  canApprove  Boolean  @default(false)
  createdAt   DateTime @default(now())

  user        User    @relation(fields: [userId])
  profile     Profile @relation(fields: [profileId])

  @@unique([userId, profileId])
}

enum WorkspaceRole {
  OWNER       // Dono da agencia
  ADMIN       // Administrador
  MEMBER      // Membro da equipe
}

enum ProfileRole {
  MANAGER     // Gerencia tudo do perfil
  EDITOR      // Cria e edita posts
  VIEWER      // Apenas visualiza
  CLIENT      // O proprio cliente — ve apenas seu perfil
}
```

### 7.2. Migracao do `Organization` Existente

**Estrategia: Transformacao gradual**

1. **Fase 1 — Renomear Organization para Workspace**
   - `Organization` → `Workspace` (nova tabela ou rename)
   - `UserOrganization` → `WorkspaceMember`
   - Manter compatibilidade com `organizationId` durante transicao
   - Todos os dados existentes migram 1:1

2. **Fase 2 — Introduzir Profile**
   - Criar tabela `Profile`
   - Criar `ProfileMember`
   - Para cada workspace existente, criar um Profile default "General"
   - Migrar FK: `Integration.organizationId` → `Integration.profileId`
   - Migrar FK: `Post.organizationId` → `Post.profileId`
   - Migrar FK: `Media.organizationId` → `Media.profileId`
   - E assim por diante para todas as tabelas scoped

3. **Fase 3 — Credenciais de Provider**
   - `ProviderCredential` fica no nivel de **Workspace** (uma config de Facebook App por agencia)
   - `Integration` (tokens OAuth de conta social) fica no nivel de **Profile**
   - Criptografar tokens de Integration (hoje estao em plaintext)

4. **Fase 4 — Login de Cliente**
   - Criar fluxo de convite para cliente (`ProfileRole.CLIENT`)
   - Cliente ve apenas seu Profile (contas, posts, calendario, midias)
   - Agencia ve todos os Profiles do Workspace

### 7.3. Resolucao de Contexto

**Abordagem recomendada: URL-based (como Chatwoot e Mixpost)**

```
/api/v1/workspaces/:workspaceId/profiles/:profileId/posts
/api/v1/workspaces/:workspaceId/profiles/:profileId/integrations
/api/v1/workspaces/:workspaceId/settings
/api/v1/workspaces/:workspaceId/credentials  (provider credentials)
```

**Backend middleware chain:**

```typescript
// 1. AuthMiddleware — JWT → User
// 2. WorkspaceMiddleware — resolve workspace do URL, verifica membership
// 3. ProfileMiddleware — resolve profile do URL, verifica acesso
// 4. PermissionGuard — verifica role e permissoes

@Controller('workspaces/:workspaceId/profiles/:profileId/posts')
@UseGuards(AuthGuard, WorkspaceGuard, ProfileGuard)
export class PostController {
  @Get()
  @CheckPolicies(Action.Read, Section.POSTS)
  async list(
    @GetWorkspaceFromRequest() workspace: Workspace,
    @GetProfileFromRequest() profile: Profile,
  ) {
    return this.postService.findAll(profile.id);
  }
}
```

**Vantagens sobre cookie-based (atual):**
- Stateless — nao depende de estado no servidor
- Bookmarkable — URLs diretas para profiles especificos
- Cache-friendly — URLs diferentes por contexto
- Multi-tab — tabs diferentes com profiles diferentes
- REST-compliant

### 7.4. Credenciais — Modelo de Seguranca

**Nivel Workspace (ProviderCredential):**
- API keys de aplicativos OAuth (Facebook App ID/Secret, Twitter API keys)
- Criptografadas com AES-256-GCM (ja existente)
- Visivel apenas para OWNER e ADMIN do workspace
- Compartilhadas entre todos os profiles do workspace

**Nivel Profile (Integration tokens):**
- Access tokens e refresh tokens de contas sociais
- **DEVEM ser criptografados** (hoje estao em plaintext!)
- Usar mesmo EncryptionService existente
- Visiveis para MANAGER do profile e ADMIN+ do workspace

**Modelo de derivacao de chaves (inspirado no ToolJet):**
```typescript
// Derivar chave especifica por tabela+coluna usando HKDF
const integrationTokenKey = hkdf(masterKey, 'integration:token');
const providerCredentialKey = hkdf(masterKey, 'provider_credential:encryptedData');
```

**Redacao no frontend (inspirado no n8n):**
- API retorna campos sensiveis como `__REDACTED__`
- Frontend mostra `••••••••` para valores existentes
- Ao salvar, backend preserva valores `__REDACTED__` sem alterar

### 7.5. Login e Acesso do Cliente

**Fluxo proposto:**

```
1. Agencia cria Profile "Nike" no workspace
2. Agencia conecta contas sociais (Instagram, Threads) ao profile
3. Agencia convida cliente@nike.com com role CLIENT
4. Cliente recebe email com link de convite
5. Cliente cria conta ou loga (mesmo sistema de auth)
6. Cliente ve apenas:
   - Calendario do seu profile
   - Posts do seu profile (pode aprovar/rejeitar se can_approve=true)
   - Analytics do seu profile
   - NAO ve outros profiles do workspace
   - NAO ve settings do workspace
   - NAO ve credenciais
```

**Implementacao tecnica:**
- `ProfileMember` com `role=CLIENT`
- Middleware filtra: se role=CLIENT, usuario so acessa seu profile
- UI adaptativa: menu lateral mostra apenas profile do cliente
- Workspace-level routes (settings, credentials, billing) bloqueados para CLIENT

### 7.6. Settings Isoladas

| Setting | Nivel | Storage |
|---------|-------|---------|
| Credenciais de Provider (Facebook App, etc.) | Workspace | `WorkspaceCredential` (encrypted) |
| Plano/Billing | Workspace | `Subscription` |
| Branding customizado | Workspace | `Workspace.settings` (JSONB) |
| Feature flags | Workspace | `Workspace.features` (JSONB) |
| Timezone | Profile | `Profile.timezone` |
| Horarios de postagem | Profile | `Profile.settings` (JSONB) |
| Tags/etiquetas | Profile | `Tags.profileId` |
| Assinaturas de post | Profile | `Signatures.profileId` |
| Auto-post/RSS | Profile | `AutoPost.profileId` |
| Webhooks | Workspace ou Profile | Depende do caso de uso |
| Notificacoes email | User (global) | `User` model |

### 7.7. Calendario e Agendamento

- Posts pertencem a um Profile
- Calendario mostra posts de um Profile especifico
- Agencia pode ter visao consolidada (todos os profiles de um workspace)
- Temporal workflows recebem `profileId` como contexto
- `RunScheduledPosts` filtra por profile

### 7.8. Media Library

- Cada Profile tem sua propria biblioteca de midias
- `Media.profileId` como FK
- Upload de midia sempre associado ao profile ativo
- Possibilidade futura: compartilhar midias entre profiles do mesmo workspace

### 7.9. Audit Trail (Novo)

Nenhuma das plataformas pesquisadas tem audit trail robusto. Recomendacao:

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  workspaceId String
  profileId   String?  // null = acao no workspace
  userId      String
  action      String   // CREATE_POST, CONNECT_ACCOUNT, APPROVE_POST, etc.
  resource    String   // Post, Integration, Settings, etc.
  resourceId  String?
  metadata    Json?    // Detalhes adicionais
  ipAddress   String?
  createdAt   DateTime @default(now())

  @@index([workspaceId, createdAt])
  @@index([profileId, createdAt])
}
```

---

## 8. RISCOS E CONSIDERACOES

### 8.1. Complexidade da Migracao

- Todas as tabelas com `organizationId` precisam ser migradas
- Dados existentes precisam de migration script (criar profile default)
- APIs existentes precisam ser versionadas ou ter rotas de compatibilidade
- Frontend precisa de refactor significativo para suportar 3 niveis

### 8.2. Performance

- Queries com 2 JOINs (workspace → profile → resource) podem ser mais lentas
- Considerar: desnormalizar `workspaceId` nas tabelas de recurso alem de `profileId`
- Indexes compostos: `@@index([profileId, createdAt])` em tabelas frequentes
- Cache: Redis por profile para dados quentes (settings, account list)

### 8.3. Seguranca

- **Criptografar Integration.token** — prioridade critica (hoje e plaintext)
- Row-Level Security no PostgreSQL como camada adicional (nao depender apenas da aplicacao)
- Rate limiting per-workspace e per-profile
- Tokens de API scoped por workspace (nao globais)

### 8.4. Compatibilidade com Upstream

- O Postiz upstream usa `Organization` — mudancas profundas podem dificultar merge
- Estrategia: manter `organizationId` como alias de `workspaceId` no banco
- Ou: aceitar divergencia e gerenciar conflitos manualmente

### 8.5. Billing Futuro

- Billing por workspace (agencia paga pelo plano)
- Ou billing por profile (agencia paga por cliente)
- Ou hibrido: plano do workspace define limite de profiles
- Mixpost Enterprise usa este modelo: planos com limite de workspaces

---

## 9. FONTES E REFERENCIAS

### Chatwoot
- [GitHub Repository](https://github.com/chatwoot/chatwoot)
- [Core Data Models (DeepWiki)](https://deepwiki.com/chatwoot/chatwoot/3-core-data-models)
- [Authorization with Pundit](https://deepwiki.com/chatwoot/chatwoot/11.2-authorization-with-pundit)
- [Configuration & Feature Management](https://deepwiki.com/chatwoot/chatwoot/10-configuration-and-feature-management)
- [Inboxes and Channels](https://deepwiki.com/chatwoot/chatwoot/3.5-inboxes-and-channels)
- [Multi-org request #7490](https://github.com/chatwoot/chatwoot/issues/7490)
- [Chatwoot APIs docs](https://developers.chatwoot.com/contributing-guide/chatwoot-apis)

### ToolJet
- [GitHub Repository](https://github.com/ToolJet/ToolJet)
- [Workspaces Documentation](https://docs.tooljet.ai/docs/tj-setup/workspaces/)
- [User Roles](https://docs.tooljet.ai/docs/user-management/role-based-access/user-roles/)
- [Custom Groups](https://docs.tooljet.com/docs/user-management/role-based-access/custom-groups/)
- [Workspace Login (Self-Hosted)](https://docs.tooljet.com/docs/user-management/authentication/self-hosted/workspace-login/)
- [Workspace Constants & Secrets](https://docs.tooljet.com/docs/3.0.0-lts/tooljet-concepts/workspace-constants/)
- [Security & Compliance](https://docs.tooljet.com/docs/security/compliance/)
- [Multi-Environment](https://docs.tooljet.com/docs/development-lifecycle/environment/self-hosted/multi-environment/)

### n8n
- [GitHub Repository](https://github.com/n8n-io/n8n)
- [Database Structure](https://docs.n8n.io/hosting/architecture/database-structure/)
- [External Secrets](https://docs.n8n.io/external-secrets/)
- [RBAC Projects](https://docs.n8n.io/user-management/rbac/projects/)
- [Role Types](https://docs.n8n.io/user-management/rbac/role-types/)
- [Custom Roles](https://docs.n8n.io/user-management/rbac/custom-roles/)
- [Credential Sharing](https://docs.n8n.io/credentials/credential-sharing/)
- [Cipher.ts Source](https://github.com/n8n-io/n8n/blob/master/packages/core/src/Cipher.ts)
- [credentials.service.ts Source](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/credentials/credentials.service.ts)

### Mixpost
- [GitHub Repository (Lite)](https://github.com/inovector/mixpost)
- [Documentation](https://docs.mixpost.app/)
- [Multiple Workspaces](https://docs.mixpost.app/enterprise/configuration/multiple-workspaces/)
- [Features](https://mixpost.app/features)
- [Pro Release Notes](https://mixpost.app/releases/pro)

### MultiPost/Postiz
- Schema Prisma: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
- Auth Middleware: `apps/backend/src/services/auth/auth.middleware.ts`
- Org Selector: `apps/frontend/src/components/layout/organization.selector.tsx`
- EncryptionService: `libraries/nestjs-libraries/src/crypto/encryption.service.ts`
- CredentialService: `libraries/nestjs-libraries/src/database/prisma/credentials/credential.service.ts`
- Permissions: `apps/backend/src/services/auth/permissions/permissions.service.ts`
