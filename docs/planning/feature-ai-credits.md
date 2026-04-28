# Feature: Sistema de Creditos de IA Configuravel

**Status:** Implementada (Ondas 1-4 concluidas)  
**Prioridade:** Alta  
**Data:** 2026-04-03

---

## Contexto

O Postiz original foi construido como SaaS com planos pagos (FREE, STANDARD, TEAM, PRO, ULTIMATE). Cada plano define limites de creditos para geracao de imagens (`image_generation_count`) e videos (`generate_videos`). No modelo self-hosted do Robo MultiPost, esse sistema de creditos impede o uso de IA mesmo com as API keys configuradas.

### Problema Atual

1. Sem subscription no banco, `checkCredits()` retorna tier `FREE` = **0 creditos**
2. O bypass existente (`STRIPE_PUBLISHABLE_KEY` ausente = tier PRO) **nao cobre creditos de IA** — ele so libera permissoes (canais, posts, team members)
3. Nao existe forma de configurar creditos por workspace/organizacao
4. Nao existe modo "ilimitado" para self-hosted

### Arquivos Envolvidos

| Arquivo | Papel |
|---------|-------|
| `libraries/nestjs-libraries/src/database/prisma/subscriptions/pricing.ts` | Define limites por tier |
| `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.service.ts` | `checkCredits()` e `useCredit()` |
| `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts` | Queries de creditos no banco |
| `apps/backend/src/api/routes/copilot.controller.ts` | Endpoint `/copilot/credits` |
| `apps/backend/src/api/routes/media.controller.ts` | Endpoints de geracao de imagem/video |
| `apps/backend/src/services/auth/permissions/permissions.service.ts` | Verificacao de permissoes por tier |
| `apps/frontend/src/components/launches/ai.image.tsx` | UI de geracao de imagem (checa creditos) |
| `apps/frontend/src/components/launches/ai.video.tsx` | UI de geracao de video (checa creditos) |

---

## Casos de Uso

### Caso 1: Self-Hosted Pessoal (Ilimitado)

> "Eu instalei o Robo MultiPost para minha agencia. Quero que todos os perfis/workspaces tenham acesso ilimitado a IA. Nao quero me preocupar com creditos."

- **Comportamento esperado:** Todos os workspaces e perfis geram imagens/videos sem limite
- **Configuracao:** Uma variavel de ambiente ou flag global
- **Quem usa:** Agencias, criadores de conteudo, equipes internas

### Caso 2: SaaS Multi-Tenant (Creditos Gerenciados)

> "Eu oferto o Robo MultiPost como servico para meus clientes. Cada cliente tem um workspace. Quero definir quantas imagens e videos cada um pode gerar por mes."

- **Comportamento esperado:** Creditos configurados por organizacao, controlados pelo admin
- **Configuracao:** Painel administrativo com gestao por workspace
- **Quem usa:** Agencias digitais que revendem, infoprodutores, plataformas white-label

### Caso 3: Hibrido (Admin Ilimitado, Clientes Limitados)

> "Meu perfil default (admin) tem creditos ilimitados. Os workspaces dos meus clientes tem creditos conforme o plano que eu defino."

- **Comportamento esperado:** Perfil/org do admin sem limites; demais orgs com creditos configurados individualmente
- **Configuracao:** Combinacao de flag global + override por organizacao

---

## Proposta de Arquitetura

### Variaveis de Ambiente

```env
# Modo de creditos de IA
# "unlimited" = sem limites para todos (default para self-hosted)
# "managed"  = creditos gerenciados por perfil (modo SaaS/agencia)
AI_CREDITS_MODE="unlimited"

# Default de creditos para novos perfis no modo managed (opcional)
# Se nao definido, novos perfis tem creditos ilimitados
# AI_CREDITS_DEFAULT_IMAGES=50
# AI_CREDITS_DEFAULT_VIDEOS=10
```

### Logica de Decisao (fluxo `checkCredits`)

```
checkCredits(organization, type) {
  // 1. Se AI_CREDITS_MODE=unlimited → retorna creditos infinitos
  if (AI_CREDITS_MODE === 'unlimited') {
    return { credits: Infinity }
  }

  // 2. Se modo managed, verifica override por organizacao
  const orgCredits = getOrgCreditConfig(organization.id)
  
  if (orgCredits) {
    // 3a. Se org tem config propria, usa ela
    const limit = type === 'ai_images' 
      ? orgCredits.imageCredits 
      : orgCredits.videoCredits
    const used = getCreditsUsedThisMonth(organization.id, type)
    
    if (limit === -1) return { credits: Infinity }  // -1 = ilimitado para esta org
    return { credits: limit - used }
  }

  // 3b. Fallback: usa pricing do tier (comportamento atual)
  return checkCreditsFromSubscription(organization, type)
}
```

### Modelo de Dados (nova tabela ou campo)

**Campos na tabela Profile (creditos por perfil):**

```prisma
model Profile {
  // ... campos existentes
  aiImageCredits    Int?    @default(null)  // null = usar default da env, -1 = ilimitado
  aiVideoCredits    Int?    @default(null)  // null = usar default da env, -1 = ilimitado
}
```

**Nota:** Os creditos sao por **perfil**, nao por organizacao. O perfil default (admin/agencia) sempre tem acesso ilimitado e gerencia os limites dos outros perfis. A tabela `Credits` existente precisa registrar `profileId` alem de `organizationId`.

### Valores Especiais

| Valor | Significado |
|-------|-------------|
| `null` | Usar padrao do tier/subscription (comportamento atual) |
| `-1` | Ilimitado para esta organizacao |
| `0` | Bloqueado (sem creditos de IA) |
| `N > 0` | N creditos por mes |

---

## Implementacao: Backend

### 1. Nova env var `AI_CREDITS_MODE`

**Arquivo:** `.env.example`, `docker-compose.yaml`

```env
AI_CREDITS_MODE="unlimited"  # "unlimited" ou "managed"
```

### 2. Alterar `checkCredits()` em `subscription.service.ts`

```typescript
async checkCredits(organization: Organization, checkType = 'ai_images') {
  // Modo ilimitado global
  if (process.env.AI_CREDITS_MODE === 'unlimited') {
    return { credits: 999999 };
  }

  // Modo managed: verificar config especifica da org
  const orgConfig = organization.aiImageCredits !== null || organization.aiVideoCredits !== null;
  
  if (orgConfig) {
    const limit = checkType === 'ai_images' 
      ? organization.aiImageCredits 
      : organization.aiVideoCredits;
    
    // -1 = ilimitado para esta org
    if (limit === -1) return { credits: 999999 };
    // 0 = bloqueado
    if (limit === 0) return { credits: 0 };
    
    // Calcular uso do mes
    const totalUse = await this._subscriptionRepository.getCreditsFrom(
      organization.id,
      dayjs().startOf('month'),  // ou usar resetDay customizado
      checkType
    );
    
    return { credits: (limit ?? 0) - totalUse };
  }

  // Fallback: comportamento atual (tier-based)
  // ... codigo existente
}
```

### 3. Alterar `useCredit()` para respeitar modo ilimitado

No modo `unlimited`, ainda registrar o uso (para analytics), mas nunca bloquear.

### 4. Endpoint de gestao (modo managed)

```
GET    /settings/ai-credits              → retorna config da org atual
PUT    /settings/ai-credits              → atualiza config da org atual (SUPERADMIN only)
GET    /admin/organizations/:id/credits  → retorna config de uma org (SUPERADMIN global)
PUT    /admin/organizations/:id/credits  → atualiza config de uma org (SUPERADMIN global)
```

---

## Implementacao: Frontend

### 1. Tela de Settings (modo managed)

Adicionar secao "Creditos de IA" na pagina de configuracoes do workspace (`/settings`):

- Exibir creditos restantes (imagens e videos) no mes
- Historico de uso (grafico simples)
- Para SUPERADMIN: campo para definir limite por org

### 2. Feedback no componente de geracao

Os componentes `AiImage` e `AiVideo` ja verificam creditos. No modo `unlimited`, o badge de creditos pode:
- Exibir "Ilimitado" em vez de um numero
- Ou simplesmente esconder o indicador de creditos

### 3. Painel Admin (modo SaaS)

Se `AI_CREDITS_MODE=managed`:
- Listar todas as organizacoes com seus limites
- Permitir editar creditos por org
- Dashboard com uso agregado (custo com APIs externas)

---

## Migracao de Dados

### Como funciona o deploy de schema neste projeto

O projeto **nao usa `prisma migrate`** (migrations versionadas). Usa `prisma db push` com sync direto.

A cadeia de execucao no Docker e:

```
Container start
  → pnpm run pm2
    → pnpm run pm2-run
      → "pm2 delete all || true && pnpm run prisma-db-push && ..."
        → prisma db push --accept-data-loss --schema ./libraries/.../schema.prisma
          → Aplica mudancas no banco automaticamente
            → Inicia backend, frontend, orchestrator via PM2
```

**Ou seja: toda vez que o container inicia, o schema e sincronizado automaticamente.**

### Para instancias existentes em producao

**Nao e necessaria nenhuma migration manual.** O fluxo e:

1. Adicionar campos `aiImageCredits` e `aiVideoCredits` no `schema.prisma`
2. Rebuildar a imagem Docker (`pnpm docker-build` ou CI/CD)
3. Ao subir o novo container, `prisma db push` aplica automaticamente:
   ```sql
   ALTER TABLE "Organization" ADD COLUMN "aiImageCredits" INTEGER;
   ALTER TABLE "Organization" ADD COLUMN "aiVideoCredits" INTEGER;
   ```
4. Default `null` = sem mudanca de comportamento (retrocompatibilidade)
5. Se `AI_CREDITS_MODE` nao estiver definido, **default para `unlimited`**

### Riscos

- **Adicionar campos:** Seguro. `prisma db push` faz `ALTER TABLE ADD COLUMN` sem perda de dados
- **Remover campos:** Perigoso. O flag `--accept-data-loss` permite drops automaticos. Nunca remover campos do schema sem verificar impacto
- **Renomear campos:** Perigoso. Prisma interpreta como drop + create, perdendo dados. Sempre criar campo novo e migrar dados antes de remover o antigo

---

## Matriz de Comportamento

| AI_CREDITS_MODE | Subscription | orgCredits | Resultado |
|-----------------|-------------|------------|-----------|
| `unlimited` | qualquer | qualquer | **Sem limite** |
| `managed` | FREE | null | 0 creditos (tier FREE) |
| `managed` | PRO | null | 300 img / 30 vid (tier PRO) |
| `managed` | qualquer | -1 | **Sem limite** (override) |
| `managed` | qualquer | 50 | 50 creditos/mes (override) |
| `managed` | qualquer | 0 | Bloqueado |
| nao definido | qualquer | qualquer | **Sem limite** (default self-hosted) |

---

## Ondas de Implementacao

> Cada onda e independente e entregavel. A onda seguinte so deve comecar apos a anterior estar testada e funcionando.

---

### Onda 1: Infraestrutura de Testes + Modo Ilimitado

**Objetivo:** Criar a base de testes do projeto e implementar o bypass de creditos para self-hosted.

**Pre-requisito:** Nenhum. Esta e a primeira onda.

#### 1.1 Setup de testes (backend)

Criar configuracao Jest para o modulo de subscriptions que sera testado.

**Arquivos a criar:**

```
libraries/nestjs-libraries/src/database/prisma/subscriptions/__tests__/
  subscription.service.spec.ts
  subscription.repository.spec.ts
```

**Setup necessario:**
- Configurar mocks do Prisma (`jest-mock-extended` ja esta instalado)
- Criar factory helpers para gerar objetos `Organization` e `Profile` de teste
- Nao precisa de banco real — testes unitarios com mocks

#### 1.2 Implementacao do modo unlimited

**Arquivos a alterar:**

| Arquivo | Mudanca |
|---------|---------|
| `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.service.ts` | Alterar `checkCredits()` para respeitar `AI_CREDITS_MODE` |
| `.env.example` | Adicionar `AI_CREDITS_MODE` |
| `docker-compose.yaml` | Adicionar `AI_CREDITS_MODE` |

**Codigo — `subscription.service.ts` alteracao em `checkCredits()`:**

```typescript
async checkCredits(organization: Organization, checkType = 'ai_images') {
  // Modo ilimitado: env var tem precedencia absoluta
  const mode = process.env.AI_CREDITS_MODE ?? 'unlimited';
  if (mode === 'unlimited') {
    return { credits: 999999 };
  }

  // ... resto do codigo existente (modo managed, sera implementado na Onda 2)
}
```

**Codigo — `subscription.service.ts` alteracao em `useCredit()`:**

```typescript
useCredit<T>(organization: Organization, type = 'ai_images', func: () => Promise<T>): Promise<T> {
  const mode = process.env.AI_CREDITS_MODE ?? 'unlimited';
  if (mode === 'unlimited') {
    // Modo ilimitado: executa sem controle de credito, mas registra uso para analytics
    return this._subscriptionRepository.useCredit(organization, type, func);
  }
  return this._subscriptionRepository.useCredit(organization, type, func);
}
```

**Envs a adicionar:**

```env
# .env.example e docker-compose.yaml
AI_CREDITS_MODE="unlimited"  # "unlimited" (default) ou "managed"
```

#### 1.3 Testes da Onda 1

**Arquivo:** `subscription.service.spec.ts`

```
Testes para checkCredits():

TEST 1: "deve retornar 999999 creditos quando AI_CREDITS_MODE=unlimited"
  - Setup: process.env.AI_CREDITS_MODE = 'unlimited'
  - Input: organization qualquer, checkType = 'ai_images'
  - Expected: { credits: 999999 }

TEST 2: "deve retornar 999999 creditos quando AI_CREDITS_MODE nao esta definido (default)"
  - Setup: delete process.env.AI_CREDITS_MODE
  - Input: organization qualquer, checkType = 'ai_images'
  - Expected: { credits: 999999 }

TEST 3: "deve retornar 999999 para ai_videos no modo unlimited"
  - Setup: process.env.AI_CREDITS_MODE = 'unlimited'
  - Input: organization qualquer, checkType = 'ai_videos'
  - Expected: { credits: 999999 }

TEST 4: "modo managed sem subscription deve retornar 0 (comportamento original FREE)"
  - Setup: process.env.AI_CREDITS_MODE = 'managed'
  - Input: organization sem subscription, checkType = 'ai_images'
  - Expected: { credits: 0 }

TEST 5: "modo managed com subscription PRO deve retornar creditos do tier"
  - Setup: process.env.AI_CREDITS_MODE = 'managed'
  - Input: organization com subscription PRO, checkType = 'ai_images'
  - Expected: { credits: 300 } (pricing PRO.image_generation_count)
```

**Arquivo:** `subscription.repository.spec.ts`

```
Testes para useCredit():

TEST 1: "deve registrar credito e executar funcao com sucesso"
  - Setup: mock do prisma credits.create e credits.delete
  - Input: org, 'ai_images', () => Promise.resolve('image_url')
  - Expected: retorna 'image_url', credits.create chamado 1x, credits.delete NAO chamado

TEST 2: "deve fazer rollback do credito quando funcao falha"
  - Setup: mock do prisma
  - Input: org, 'ai_images', () => Promise.reject(new Error('API error'))
  - Expected: credits.create chamado 1x, credits.delete chamado 1x, erro propagado

TEST 3: "deve registrar credito com type correto (ai_images vs ai_videos)"
  - Setup: mock do prisma
  - Input: org, 'ai_videos', () => Promise.resolve('video_url')
  - Expected: credits.create chamado com type = 'ai_videos'
```

#### 1.4 Documentacao da Onda 1

| Arquivo | O que documentar |
|---------|-----------------|
| `CLAUDE.md` | Adicionar secao "Sistema de Creditos de IA" explicando: a env var `AI_CREDITS_MODE`, os dois modos (`unlimited`/`managed`), a cadeia de precedencia, e que testes rodam com `pnpm test` |
| `CHANGELOG.md` | Adicionar em `[Unreleased]` > `### Adicionado`: "Modo ilimitado para creditos de IA via variavel AI_CREDITS_MODE (default: unlimited)" |
| `.env.example` | Documentar com comentario explicativo a nova env var |
| `docker-compose.yaml` | Documentar com comentario explicativo a nova env var |
| `docs/planning/feature-ai-credits.md` | Atualizar status da Onda 1 para "Concluida" |

#### Criterio de aceite da Onda 1

- [ ] `pnpm test` roda sem erros
- [ ] Todos os 8 testes passam
- [ ] Instancia com `AI_CREDITS_MODE=unlimited` (ou sem a env) permite gerar imagem/video sem limite
- [ ] Instancia com `AI_CREDITS_MODE=managed` mantem comportamento original (tier-based)
- [ ] Env var adicionada no `.env.example` e `docker-compose.yaml`
- [ ] `CLAUDE.md` atualizado com secao sobre creditos de IA
- [ ] `CHANGELOG.md` atualizado com entrada da feature

---

### Onda 2: Schema + Creditos por Perfil (Backend)

**Objetivo:** Adicionar campos de creditos no modelo Profile e implementar a logica de verificacao por perfil no modo managed.

**Pre-requisito:** Onda 1 completa e testada.

#### 2.1 Alteracao no Prisma Schema

**Arquivo:** `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

```prisma
model Profile {
  // ... campos existentes (manter todos)
  aiImageCredits    Int?    // null = usar default env, -1 = ilimitado, 0 = bloqueado, N = limite
  aiVideoCredits    Int?    // null = usar default env, -1 = ilimitado, 0 = bloqueado, N = limite
}
```

**Arquivo:** `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

Adicionar `profileId` opcional na tabela Credits para rastreamento por perfil:

```prisma
model Credits {
  // ... campos existentes
  profileId     String?
  profile       Profile?  @relation(fields: [profileId], references: [id])
}
```

Rodar `pnpm prisma-generate` apos alteracao.

#### 2.2 Alterar checkCredits para receber profile

**Arquivo:** `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.service.ts`

```typescript
async checkCredits(
  organization: Organization,
  checkType = 'ai_images',
  profile?: { id: string; isDefault: boolean; aiImageCredits: number | null; aiVideoCredits: number | null }
) {
  // 1. Modo ilimitado global
  const mode = process.env.AI_CREDITS_MODE ?? 'unlimited';
  if (mode === 'unlimited') {
    return { credits: 999999 };
  }

  // 2. Perfil default (admin) → sempre ilimitado
  if (profile?.isDefault) {
    return { credits: 999999 };
  }

  // 3. Perfil tem config propria
  if (profile) {
    const limit = checkType === 'ai_images'
      ? profile.aiImageCredits
      : profile.aiVideoCredits;

    if (limit !== null && limit !== undefined) {
      if (limit === -1) return { credits: 999999 };
      if (limit === 0) return { credits: 0 };

      const totalUse = await this._subscriptionRepository.getCreditsFrom(
        organization.id,
        dayjs().startOf('month'),
        checkType,
        profile.id
      );
      return { credits: limit - totalUse };
    }
  }

  // 4. Fallback: default da env var
  const defaultLimit = checkType === 'ai_images'
    ? parseInt(process.env.AI_CREDITS_DEFAULT_IMAGES ?? '-1', 10)
    : parseInt(process.env.AI_CREDITS_DEFAULT_VIDEOS ?? '-1', 10);

  if (defaultLimit === -1) return { credits: 999999 };

  const totalUse = await this._subscriptionRepository.getCreditsFrom(
    organization.id,
    dayjs().startOf('month'),
    checkType,
    profile?.id
  );
  return { credits: defaultLimit - totalUse };
}
```

#### 2.3 Alterar getCreditsFrom para filtrar por profile

**Arquivo:** `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts`

```typescript
async getCreditsFrom(
  organizationId: string,
  from: dayjs.Dayjs,
  type = 'ai_images',
  profileId?: string
) {
  const load = await this._credits.model.credits.groupBy({
    by: ['organizationId'],
    where: {
      organizationId,
      type,
      ...(profileId ? { profileId } : {}),
      createdAt: { gte: from.toDate() },
    },
    _sum: { credits: true },
  });
  return load?.[0]?._sum?.credits || 0;
}
```

#### 2.4 Alterar useCredit para registrar profileId

**Arquivo:** `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts`

```typescript
async useCredit<T>(
  org: Organization,
  type = 'ai_images',
  func: () => Promise<T>,
  profileId?: string
) {
  const data = await this._credits.model.credits.create({
    data: {
      organizationId: org.id,
      credits: 1,
      type,
      ...(profileId ? { profileId } : {}),
    },
  });
  // ... resto igual (try/catch com rollback)
}
```

#### 2.5 Alterar controllers que chamam checkCredits/useCredit

**Arquivos a alterar:**

| Arquivo | Mudanca |
|---------|---------|
| `apps/backend/src/api/routes/copilot.controller.ts` | Passar profile para `checkCredits()` |
| `apps/backend/src/api/routes/media.controller.ts` | Passar profile para `checkCredits()` e `useCredit()` |

Esses controllers ja recebem `@GetProfileFromRequest()` — basta repassar o profile para os metodos.

#### 2.6 Novas env vars

```env
# .env.example e docker-compose.yaml
# AI_CREDITS_DEFAULT_IMAGES=50   # default para novos perfis no modo managed
# AI_CREDITS_DEFAULT_VIDEOS=10   # default para novos perfis no modo managed
```

#### 2.7 Testes da Onda 2

**Arquivo:** `subscription.service.spec.ts` (adicionar aos testes da Onda 1)

```
Testes para checkCredits com profile:

TEST 6: "perfil default deve retornar ilimitado mesmo no modo managed"
  - Setup: AI_CREDITS_MODE = 'managed'
  - Input: org, 'ai_images', profile com isDefault=true
  - Expected: { credits: 999999 }

TEST 7: "perfil com aiImageCredits=50 deve retornar creditos restantes"
  - Setup: AI_CREDITS_MODE = 'managed', mock getCreditsFrom retorna 10
  - Input: org, 'ai_images', profile com aiImageCredits=50
  - Expected: { credits: 40 }

TEST 8: "perfil com aiImageCredits=-1 deve retornar ilimitado"
  - Setup: AI_CREDITS_MODE = 'managed'
  - Input: org, 'ai_images', profile com aiImageCredits=-1
  - Expected: { credits: 999999 }

TEST 9: "perfil com aiImageCredits=0 deve retornar bloqueado"
  - Setup: AI_CREDITS_MODE = 'managed'
  - Input: org, 'ai_images', profile com aiImageCredits=0
  - Expected: { credits: 0 }

TEST 10: "perfil sem config deve usar AI_CREDITS_DEFAULT_IMAGES da env"
  - Setup: AI_CREDITS_MODE = 'managed', AI_CREDITS_DEFAULT_IMAGES = '100', mock getCreditsFrom retorna 25
  - Input: org, 'ai_images', profile com aiImageCredits=null
  - Expected: { credits: 75 }

TEST 11: "perfil sem config e sem env default deve retornar ilimitado"
  - Setup: AI_CREDITS_MODE = 'managed', sem AI_CREDITS_DEFAULT_IMAGES
  - Input: org, 'ai_images', profile com aiImageCredits=null
  - Expected: { credits: 999999 }

TEST 12: "ai_videos deve usar aiVideoCredits do perfil"
  - Setup: AI_CREDITS_MODE = 'managed', mock getCreditsFrom retorna 3
  - Input: org, 'ai_videos', profile com aiVideoCredits=10
  - Expected: { credits: 7 }

TEST 13: "unlimited mode ignora config do perfil"
  - Setup: AI_CREDITS_MODE = 'unlimited'
  - Input: org, 'ai_images', profile com aiImageCredits=0 (bloqueado)
  - Expected: { credits: 999999 } (env var vence)
```

**Arquivo:** `subscription.repository.spec.ts` (adicionar)

```
TEST 4: "getCreditsFrom deve filtrar por profileId quando fornecido"
  - Setup: mock do prisma groupBy
  - Input: orgId, from, 'ai_images', 'profile-123'
  - Expected: where inclui { profileId: 'profile-123' }

TEST 5: "getCreditsFrom sem profileId nao deve filtrar por perfil"
  - Setup: mock do prisma groupBy
  - Input: orgId, from, 'ai_images', undefined
  - Expected: where NAO inclui profileId

TEST 6: "useCredit deve registrar profileId quando fornecido"
  - Setup: mock do prisma
  - Input: org, 'ai_images', func, 'profile-123'
  - Expected: credits.create chamado com { profileId: 'profile-123' }
```

#### 2.8 Documentacao da Onda 2

| Arquivo | O que documentar |
|---------|-----------------|
| `CLAUDE.md` | Atualizar secao "Sistema de Creditos de IA": documentar que creditos sao por perfil (nao por org), o papel do perfil default como admin, a cadeia de fallback (perfil → env default → ilimitado), e as novas envs `AI_CREDITS_DEFAULT_IMAGES`/`AI_CREDITS_DEFAULT_VIDEOS` |
| `CHANGELOG.md` | Adicionar em `[Unreleased]` > `### Adicionado`: "Creditos de IA configuraveis por perfil no modo gerenciado (AI_CREDITS_MODE=managed)" |
| `.env.example` | Adicionar `AI_CREDITS_DEFAULT_IMAGES` e `AI_CREDITS_DEFAULT_VIDEOS` com comentarios |
| `docker-compose.yaml` | Adicionar as mesmas envs acima |
| `docs/planning/feature-ai-credits.md` | Atualizar status da Onda 2 para "Concluida" |
| `docs/architecture/` | Criar ou atualizar doc de arquitetura explicando o modelo de creditos por perfil, a relacao Profile ↔ Credits, e o fluxo `checkCredits()` completo com diagrama de decisao |

#### Criterio de aceite da Onda 2

- [ ] `pnpm prisma-generate` roda sem erros
- [ ] Schema atualizado com campos no Profile e Credits
- [ ] Todos os 19 testes passam (8 da Onda 1 + 11 novos)
- [ ] Perfil default sempre tem creditos ilimitados no modo managed
- [ ] Perfil com config propria respeita o limite
- [ ] Perfil sem config usa fallback da env var
- [ ] Fallback da env var nao definido = ilimitado
- [ ] `useCredit` registra profileId para rastreamento
- [ ] `CLAUDE.md` atualizado com modelo por perfil
- [ ] `CHANGELOG.md` atualizado
- [ ] Envs default documentadas no `.env.example` e `docker-compose.yaml`

---

### Onda 3: API de Gestao de Creditos

**Objetivo:** Criar endpoints REST para o perfil default gerenciar creditos dos outros perfis.

**Pre-requisito:** Onda 2 completa e testada.

#### 3.1 Novo endpoint no settings controller

**Arquivo:** `apps/backend/src/api/routes/settings.controller.ts`

```
GET  /settings/profiles/:profileId/ai-credits
  - Retorna: { aiImageCredits, aiVideoCredits, usedImages, usedVideos, mode }
  - Permissao: perfil default (SUPERADMIN/ADMIN) da org

PUT  /settings/profiles/:profileId/ai-credits
  - Body: { aiImageCredits?: number | null, aiVideoCredits?: number | null }
  - Permissao: perfil default (SUPERADMIN/ADMIN) da org
  - Validacao: nao permitir editar o proprio perfil default (sempre ilimitado)

GET  /settings/ai-credits/summary
  - Retorna: lista de perfis da org com creditos configurados e uso do mes
  - Permissao: perfil default (SUPERADMIN/ADMIN) da org
```

#### 3.2 Verificacao de API key antes de consumir credito

**Arquivos a alterar:**

| Arquivo | Mudanca |
|---------|---------|
| `apps/backend/src/api/routes/media.controller.ts` | Verificar `OPENAI_API_KEY` antes de `useCredit` para imagens |
| `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts` | Verificar keys relevantes antes de gerar |

```typescript
// Antes de qualquer geracao
if (type === 'ai_images' && !process.env.OPENAI_API_KEY) {
  throw new HttpException('AI image generation is not configured on this server', 503);
}
```

#### 3.3 Testes da Onda 3

**Arquivo:** `apps/backend/src/api/routes/__tests__/settings.controller.spec.ts`

```
TEST 1: "GET /settings/profiles/:id/ai-credits retorna config do perfil"
  - Setup: perfil com aiImageCredits=50, aiVideoCredits=10
  - Expected: { aiImageCredits: 50, aiVideoCredits: 10, usedImages: 0, usedVideos: 0, mode: 'managed' }

TEST 2: "PUT /settings/profiles/:id/ai-credits atualiza creditos"
  - Setup: perfil existente
  - Input: { aiImageCredits: 100, aiVideoCredits: 20 }
  - Expected: perfil atualizado no banco

TEST 3: "PUT nao permite editar perfil default"
  - Setup: perfil default
  - Input: { aiImageCredits: 50 }
  - Expected: 403 Forbidden

TEST 4: "PUT requer permissao SUPERADMIN/ADMIN"
  - Setup: usuario com role USER
  - Expected: 403 Forbidden

TEST 5: "GET /settings/ai-credits/summary retorna todos os perfis com uso"
  - Setup: 3 perfis na org, cada um com creditos diferentes
  - Expected: array com 3 perfis, cada um com credits + usage

TEST 6: "geracao de imagem sem OPENAI_API_KEY retorna 503"
  - Setup: OPENAI_API_KEY vazio
  - Expected: HttpException 503

TEST 7: "geracao de imagem sem OPENAI_API_KEY nao consome credito"
  - Setup: OPENAI_API_KEY vazio, mock useCredit
  - Expected: useCredit NAO chamado
```

#### 3.4 Documentacao da Onda 3

| Arquivo | O que documentar |
|---------|-----------------|
| `CLAUDE.md` | Atualizar secao "Sistema de Creditos de IA": documentar os novos endpoints REST (`GET/PUT /settings/profiles/:id/ai-credits`, `GET /settings/ai-credits/summary`), permissoes necessarias (SUPERADMIN/ADMIN), e a regra de validacao de API key antes de consumir credito |
| `CHANGELOG.md` | Adicionar em `[Unreleased]` > `### Adicionado`: "API de gestao de creditos de IA por perfil" e "Validacao de API key antes de consumir credito de IA" |
| `docs/planning/feature-ai-credits.md` | Atualizar status da Onda 3 para "Concluida" |

#### Criterio de aceite da Onda 3

- [ ] Todos os 26 testes passam (19 anteriores + 7 novos)
- [ ] Perfil default consegue ver e editar creditos de outros perfis
- [ ] Nao e possivel limitar creditos do perfil default
- [ ] API key ausente retorna 503 e nao consome credito
- [ ] Summary retorna uso correto do mes
- [ ] `CLAUDE.md` atualizado com endpoints REST
- [ ] `CHANGELOG.md` atualizado

---

### Onda 4: Frontend — UI de Creditos

**Objetivo:** Implementar a interface de gestao de creditos e feedback visual para o usuario.

**Pre-requisito:** Onda 3 completa e testada.

#### 4.1 Tela de gestao (perfil default)

**Arquivo a criar:** `apps/frontend/src/components/settings/ai-credits.settings.component.tsx`

**Localizacao na UI:** Dentro de `/settings`, nova tab/secao "Creditos de IA" (visivel apenas para perfil default no modo managed)

**Conteudo:**
- Tabela com todos os perfis da org
- Colunas: Nome do perfil | Creditos Imagem (config/usado) | Creditos Video (config/usado) | Acoes
- Botao "Editar" abre inline edit com inputs numericos
- Indicadores visuais: verde (bastante), amarelo (>80% usado), vermelho (esgotado)

#### 4.2 Campos na tela de edicao de perfil

**Arquivo a alterar:** componente de edicao de perfil existente

**Adicionar:** Dois campos numericos (Creditos Imagem / Creditos Video) com placeholder "Ilimitado" quando vazio.

#### 4.3 Feedback nos componentes de geracao

**Arquivos a alterar:**

| Arquivo | Mudanca |
|---------|---------|
| `apps/frontend/src/components/launches/ai.image.tsx` | Badge de creditos + botao disabled quando zerado |
| `apps/frontend/src/components/launches/ai.video.tsx` | Badge de creditos + botao disabled quando zerado |

**Regras de exibicao:**
- `AI_CREDITS_MODE=unlimited` → nenhum indicador
- `managed` + perfil default → nenhum indicador
- `managed` + perfil cliente → badge "Restam X creditos este mes"
- `managed` + creditos = 0 → botao disabled + tooltip "Limite atingido"

#### 4.4 Traducoes

**Arquivos a alterar:**

| Arquivo | Chaves a adicionar |
|---------|-------------------|
| `libraries/react-shared-libraries/src/translation/locales/pt/translation.json` | Todas as chaves abaixo |
| `libraries/react-shared-libraries/src/translation/locales/en/translation.json` | Todas as chaves abaixo |

```json
{
  "ai_credits_title": "Creditos de IA",
  "ai_credits_images": "Creditos de Imagem",
  "ai_credits_videos": "Creditos de Video",
  "ai_credits_remaining": "Restam {{count}} creditos este mes",
  "ai_credits_unlimited": "Ilimitado",
  "ai_credits_blocked": "Bloqueado",
  "ai_credits_exhausted": "Voce atingiu o limite de geracoes este mes. Entre em contato com o administrador.",
  "ai_credits_per_month": "por mes",
  "ai_credits_used": "{{used}} de {{total}} utilizados",
  "ai_credits_edit": "Editar creditos",
  "ai_credits_save": "Salvar",
  "ai_credits_not_configured": "Geracao de IA indisponivel. Entre em contato com o administrador."
}
```

#### 4.5 Testes da Onda 4

**Arquivo a criar:** `apps/frontend/src/components/settings/__tests__/ai-credits.settings.spec.tsx`

```
TEST 1: "nao renderiza secao de creditos quando AI_CREDITS_MODE=unlimited"
  - Setup: mock useFetch retorna mode='unlimited'
  - Expected: secao de creditos nao esta no DOM

TEST 2: "renderiza tabela de perfis no modo managed"
  - Setup: mock useFetch retorna mode='managed', 3 perfis
  - Expected: tabela com 3 linhas

TEST 3: "nao exibe linha do perfil default na tabela"
  - Setup: 3 perfis, 1 default
  - Expected: tabela com 2 linhas (default excluido)

TEST 4: "exibe indicador verde/amarelo/vermelho baseado no uso"
  - Setup: perfil com 10/100 usado (verde), 85/100 (amarelo), 100/100 (vermelho)
  - Expected: classes CSS corretas aplicadas
```

**Arquivo a criar:** `apps/frontend/src/components/launches/__tests__/ai.image.spec.tsx`

```
TEST 5: "botao de geracao desabilitado quando creditos = 0"
  - Setup: mock checkCredits retorna { credits: 0 }
  - Expected: botao disabled, tooltip visivel

TEST 6: "badge de creditos visivel no modo managed"
  - Setup: mock checkCredits retorna { credits: 12 }
  - Expected: texto "Restam 12 creditos este mes" visivel

TEST 7: "badge de creditos oculto no modo unlimited"
  - Setup: mock checkCredits retorna { credits: 999999 }
  - Expected: badge nao esta no DOM

TEST 8: "mensagem de erro quando API nao configurada (503)"
  - Setup: mock fetch retorna 503
  - Expected: mensagem "Geracao de IA indisponivel" exibida
```

#### 4.6 Documentacao da Onda 4

| Arquivo | O que documentar |
|---------|-----------------|
| `CLAUDE.md` | Atualizar secao "Sistema de Creditos de IA": documentar os componentes frontend criados, as chaves de traducao adicionadas, e as regras de exibicao do badge (quando mostrar/esconder). Documentar que todo texto visivel usa `useT()` conforme regra existente |
| `CHANGELOG.md` | Adicionar em `[Unreleased]` > `### Adicionado`: "Tela de gestao de creditos de IA no painel de configuracoes" e "Indicador visual de creditos restantes nos componentes de geracao" |
| `docs/planning/feature-ai-credits.md` | Atualizar status da Onda 4 para "Concluida" e status geral da feature para "Implementada" |
| `docs/` | Criar `docs/features/ai-credits.md` — documentacao voltada ao usuario final explicando: como configurar creditos, os modos unlimited/managed, como gerenciar creditos por perfil, e screenshots da UI |

#### Criterio de aceite da Onda 4

- [ ] Todos os 34 testes passam (26 anteriores + 8 novos)
- [ ] Perfil default ve e gerencia creditos de outros perfis em /settings
- [ ] Badge de creditos aparece corretamente nos componentes de geracao
- [ ] Botao desabilitado + tooltip quando creditos zerados
- [ ] Nenhum indicador no modo unlimited
- [ ] Traducoes pt e en adicionadas
- [ ] Consistencia visual com o resto do sistema (verificar colors.scss e global.scss)
- [ ] `CLAUDE.md` atualizado com componentes frontend e regras de exibicao
- [ ] `CHANGELOG.md` atualizado
- [ ] Documentacao de usuario criada em `docs/features/ai-credits.md`

---

### Resumo das Ondas

| Onda | Escopo | Testes | Docs |
|------|--------|--------|------|
| **1** | Setup testes + modo unlimited | 8 | CLAUDE.md, CHANGELOG.md, .env.example, docker-compose.yaml |
| **2** | Schema Profile + logica por perfil | +11 = 19 | CLAUDE.md, CHANGELOG.md, .env.example, docker-compose.yaml, docs/architecture/ |
| **3** | API REST de gestao + validacao API key | +7 = 26 | CLAUDE.md, CHANGELOG.md |
| **4** | Frontend: UI + feedback + traducoes | +8 = 34 | CLAUDE.md, CHANGELOG.md, docs/features/ai-credits.md |

**Total: 34 testes automatizados + documentacao atualizada em cada onda.**

### Regra geral de documentacao (aplicavel a todas as ondas)

> **Toda onda deve atualizar a documentacao ANTES de ser considerada concluida.** Nenhuma onda esta "pronta" ate que:
> 1. `CLAUDE.md` reflita o estado atual do sistema (para que o Claude Code e agents tenham contexto)
> 2. `CHANGELOG.md` tenha a entrada descritiva em `[Unreleased]`
> 3. Comentarios nas env vars estejam claros no `.env.example` e `docker-compose.yaml`
> 4. Este documento (`feature-ai-credits.md`) tenha o status da onda atualizado

---

## Edge Cases e Decisoes

### EC-1: Retry automatico

**Cenario:** A geracao falha (timeout do provider, erro 500 da API) e o sistema tenta novamente.

**Decisao:** O `useCredit()` atual ja faz rollback se a funcao interna lanca excecao (deleta o registro de credito). Manter esse comportamento:
- Se falhou e fez retry → o credito do primeiro attempt ja foi devolvido
- Somente a tentativa que **efetivamente retorna resultado** consome 1 credito
- Se todas as tentativas falharem → 0 creditos consumidos

**Implementacao:** Nenhuma mudanca necessaria no `useCredit()`. O wrapper try/catch do repository ja cobre:
```typescript
// subscription.repository.ts — comportamento atual
async useCredit(org, type, func) {
  const data = await credits.create({ ... });  // debita
  try {
    return await func();                        // executa geracao
  } catch (err) {
    await credits.delete({ id: data.id });      // devolve se falhou
    throw err;
  }
}
```

---

### EC-2: Creditos por perfil (modelo agencia)

**Cenario:** Uma agencia tem 1 organizacao com o perfil default (admin) e varios perfis de clientes. O admin quer definir creditos individuais por perfil de cliente.

**Decisao:** Os creditos sao configurados **por perfil**, nao por organizacao. O perfil default (agencia) gerencia os limites dos outros perfis.

**Modelo:**
- O **perfil default** (`isDefault: true`) tem acesso a configuracao global e pode definir creditos para cada perfil
- Os **perfis de clientes** tem limites individuais configurados pelo perfil default
- A configuracao acontece na **tela de edicao de perfil** (ja existente em `/settings`)

**Mudanca no modelo de dados:**

```prisma
model Profile {
  // ... campos existentes
  aiImageCredits    Int?    @default(null)  // null = usar default da env/org
  aiVideoCredits    Int?    @default(null)  // null = usar default da env/org
}
```

**Logica atualizada de `checkCredits`:**

```
checkCredits(organization, profile, type) {
  // 1. AI_CREDITS_MODE=unlimited → sem limite (env var sempre vence)
  if (AI_CREDITS_MODE === 'unlimited') return { credits: Infinity }

  // 2. Perfil default → sempre ilimitado dentro da org (e o admin)
  if (profile.isDefault) return { credits: Infinity }

  // 3. Perfil tem config propria?
  if (profile.aiImageCredits !== null || profile.aiVideoCredits !== null) {
    const limit = type === 'ai_images' ? profile.aiImageCredits : profile.aiVideoCredits
    if (limit === -1) return { credits: Infinity }
    if (limit === 0) return { credits: 0 }
    const used = getCreditsUsedThisMonth(organization.id, profile.id, type)
    return { credits: limit - used }
  }

  // 4. Fallback: usar default da env AI_CREDITS_DEFAULT_IMAGES / AI_CREDITS_DEFAULT_VIDEOS
  //    Se nao definido → ilimitado
  const defaultLimit = type === 'ai_images'
    ? (process.env.AI_CREDITS_DEFAULT_IMAGES ?? -1)
    : (process.env.AI_CREDITS_DEFAULT_VIDEOS ?? -1)
  if (defaultLimit == -1) return { credits: Infinity }
  const used = getCreditsUsedThisMonth(organization.id, profile.id, type)
  return { credits: defaultLimit - used }
}
```

**UI:** Na tela de edicao de perfil (acessivel pelo perfil default/admin), adicionar campos:
- "Creditos de imagem por mes" (input numerico, vazio = default, -1 = ilimitado, 0 = bloqueado)
- "Creditos de video por mes" (input numerico, vazio = default, -1 = ilimitado, 0 = bloqueado)

**Impacto:** A tabela `Credits` no banco precisa tambem registrar o `profileId` para contagem por perfil, nao so por organizacao.

---

### EC-3: Default para novas organizacoes/perfis

**Cenario:** Um novo perfil e criado no modo `managed`. Quantos creditos ele tem?

**Decisao:** Cadeia de fallback:

```
1. Valor configurado no perfil (aiImageCredits / aiVideoCredits)
   ↓ se null
2. Valor default da env var (AI_CREDITS_DEFAULT_IMAGES / AI_CREDITS_DEFAULT_VIDEOS)
   ↓ se nao definido
3. Ilimitado (-1)
```

**Novas env vars:**

```env
# Default de creditos para novos perfis no modo managed (opcional)
# Se nao definido, novos perfis tem creditos ilimitados
# AI_CREDITS_DEFAULT_IMAGES=50
# AI_CREDITS_DEFAULT_VIDEOS=10
```

**Racional:** Isso permite que o admin do self-hosted defina um padrao razoavel sem precisar configurar perfil por perfil. Ex: `AI_CREDITS_DEFAULT_IMAGES=100` faz todo novo perfil comecar com 100 creditos de imagem/mes, mas o admin pode override individualmente.

---

### EC-4: Precedencia da env var (unlimited sobrescreve tudo)

**Cenario:** `AI_CREDITS_MODE=unlimited` esta definido, mas um perfil tem `aiImageCredits=50` configurado no banco.

**Decisao:** A env var `AI_CREDITS_MODE=unlimited` tem **precedencia absoluta**. Ignora qualquer valor no banco.

**Ordem de precedencia (modo unlimited):**
```
AI_CREDITS_MODE=unlimited → SEMPRE ilimitado, independente de qualquer config
```

**Ordem de precedencia (modo managed):**
```
1. Perfil default → sempre ilimitado (e o admin)
2. Config do perfil (banco) → se preenchido, usa
3. Config default (env var) → se preenchido, usa
4. Fallback → ilimitado
```

---

### EC-5: API key ausente com creditos disponiveis

**Cenario:** O perfil tem 50 creditos de imagem, mas `OPENAI_API_KEY` nao esta configurado no servidor.

**Decisao:**
- **Nao consumir credito** — a geracao nem deve ser tentada
- **Mostrar mensagem clara** no frontend: "Geracao de imagem indisponivel. Entre em contato com o administrador."
- No backend, verificar a presenca da API key **antes** de chamar `useCredit()`

**Implementacao:**
```typescript
// Antes de gerar
if (!process.env.OPENAI_API_KEY) {
  throw new HttpException('AI image generation is not configured', 503);
}
// Somente depois debitar credito e gerar
return this._subscriptionService.useCredit(org, 'ai_images', () => generate());
```

---

### EC-6: DISABLE_BILLING + AI_CREDITS_MODE=managed

**Cenario:** Admin quer controlar creditos de IA por perfil, mas nao quer cobrar via Stripe.

**Decisao:** Funciona normalmente. Os dois sistemas sao **independentes**:
- `DISABLE_BILLING=true` → desativa Stripe, pagamentos, UI de billing
- `AI_CREDITS_MODE=managed` → ativa gestao de creditos de IA por perfil

**Combinacoes validas:**

| DISABLE_BILLING | AI_CREDITS_MODE | Cenario |
|-----------------|-----------------|---------|
| `true` | `unlimited` | Self-hosted pessoal, tudo liberado |
| `true` | `managed` | Agencia gerenciando creditos sem cobrar |
| `false` | `unlimited` | SaaS com Stripe mas IA ilimitada |
| `false` | `managed` | SaaS completo com billing + creditos |

---

### EC-7: Creditos zerados (UX)

**Cenario:** O perfil usou todos os creditos do mes.

**Decisao:**
- **Botao de geracao desabilitado** (disabled state)
- **Tooltip no hover:** "Voce atingiu o limite de {N} geracoes de imagem este mes. Entre em contato com o administrador para liberar mais creditos."
- **Nao mostrar modal** — tooltip e menos intrusivo
- O perfil default (admin) **nunca** ve essa mensagem

---

### EC-8: Indicador de creditos restantes (UX)

**Cenario:** O usuario esta prestes a gerar uma imagem no modo managed.

**Decisao:**
- **Modo `managed`:** Exibir badge discreto antes de gerar: "1 credito de imagem (restam 12 este mes)"
- **Modo `unlimited`:** **Nao exibir nenhum indicador** — experiencia limpa, sem distracao
- **Perfil default (admin):** Nao exibir indicador (e sempre ilimitado)

**Implementacao no frontend:**
```typescript
const { credits } = useCreditCheck('ai_images');
const isUnlimited = credits >= 999999;
const isManaged = !isUnlimited;

// Somente exibir se managed E nao for perfil default
{isManaged && !profile.isDefault && (
  <span className="text-xs text-gray-500">
    {t('ai_credits_remaining', `1 credit (${credits} remaining this month)`)}
  </span>
)}
```

---

## Consideracoes

### Seguranca
- Somente SUPERADMIN da org pode ver/alterar creditos da propria org
- Somente `isSuperAdmin` (admin global) pode alterar creditos de outras orgs
- A env var `AI_CREDITS_MODE` so pode ser alterada no servidor (nao via API)

### Custos
- Mesmo no modo ilimitado, **os custos das APIs externas continuam** (OpenAI, FAL, KIE.AI, ElevenLabs, Transloadit)
- O registro de uso (`useCredit`) deve continuar funcionando para o admin acompanhar gastos
- Considerar adicionar no dashboard: estimativa de custo baseada no uso (ex: ~$0.04/imagem DALL-E 3)

### Retrocompatibilidade
- Default `AI_CREDITS_MODE=unlimited` garante que instancias existentes nao quebram
- Campos null na Organization = comportamento atual mantido
- Nenhuma mudanca no fluxo de Stripe/billing existente

### Relacao com DISABLE_BILLING
- `DISABLE_BILLING=true` + `AI_CREDITS_MODE=unlimited` = self-hosted completo sem limites
- `DISABLE_BILLING=false` + `AI_CREDITS_MODE=managed` = modo SaaS com Stripe + creditos
- Sao complementares, nao conflitantes

---

## Decisoes Tomadas

| Pergunta | Decisao |
|----------|---------|
| Resetar creditos | Dia 1 do mes (`dayjs().startOf('month')`) |
| Creditos acumulam? | Nao. Reset mensal, nao acumula |
| Creditos por perfil vs por org? | **Por perfil.** Perfil default = admin ilimitado, demais perfis = clientes com limite |
| Precedencia da env var? | `AI_CREDITS_MODE=unlimited` vence tudo, sempre |
| Default para novos perfis? | Cadeia: config perfil → env default → ilimitado |
| Billing vs Credits? | Independentes. `DISABLE_BILLING` e `AI_CREDITS_MODE` nao conflitam |

## Perguntas em Aberto

1. **Notificacoes:** Enviar email quando creditos estao acabando? (80%, 100%) — pode ser Onda futura
2. **Rate limiting:** Alem de creditos mensais, limitar requisicoes por minuto? (protecao contra abuse) — pode ser Onda futura
3. **Tipos de credito granulares:** Separar creditos de DALL-E vs FAL vs Veo3? Ou manter agrupado (imagem/video)? — manter agrupado por ora
