# Relatorio de Reconstrucao: Persona de IA + Knowledge Base + Tab Agente de IA

**Branch:** `claude/analyze-agent-profiles-0Zst1`
**Commits:** a2aaf11..f8fd0a6 (6 commits de feature + 2 fixes + 1 merge)
**PR:** #1 em maiconramos/robo-multipost
**Data:** 2026-04-04 a 2026-04-06

## Prompt para Claude Code

Use este prompt para reconstruir tudo do zero:

---

**PROMPT INICIO:**

Implemente a feature "Persona de IA + Knowledge Base (RAG) + Tab Agente de IA" para o Robo MultiPost. A implementacao tem 4 partes:

### PARTE 1: Persona de IA por Perfil

Cada perfil (cliente) pode ter uma persona configuravel que controla como o agente de IA escreve. A persona e injetada em 3 lugares: agente Mastra (chat CopilotKit), Generator LangGraph (/posts/generator), e prompts DALL-E 3.

**1.1 Schema Prisma** — Adicione ao `libraries/nestjs-libraries/src/database/prisma/schema.prisma`:

No model `Profile`, adicione relacao:
```
persona        ProfilePersona?
knowledgeDocuments ProfileKnowledgeDocument[]
```

Adicione novos models:

```prisma
model ProfilePersona {
  id                  String   @id @default(uuid())
  profileId           String   @unique
  brandDescription    String?
  toneOfVoice         String?
  writingInstructions String?
  preferredCtas       String[] @default([])
  contentRestrictions String?
  imageStyle          String?
  targetAudience      String?
  examplePosts        String[] @default([])
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  profile             Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@index([profileId])
}
```

**1.2 Repository** — Em `libraries/nestjs-libraries/src/database/prisma/profiles/profile.repository.ts`:

- Adicione `ProfilePersonaData` interface com os 8 campos
- Adicione 3o parametro construtor: `private _profilePersona: PrismaRepository<'profilePersona'>`
- Adicione metodos:
  - `getPersona(profileId)`: findUnique por profileId
  - `upsertPersona(profileId, data)`: trim CTAs, filter empty, slice examples a 5, upsert
  - `deletePersona(profileId)`: deleteMany por profileId

**1.3 Service** — Em `libraries/nestjs-libraries/src/database/prisma/profiles/profile.service.ts`:

- `getPersona(orgId, profileId)` — valida perfil pertence a org, 404 se nao
- `getPersonaForAgent(profileId)` — sem validacao de org (uso interno)
- `upsertPersona(orgId, profileId, data)` — valida org, chama repo
- `deletePersona(orgId, profileId)` — valida org, chama repo

**1.4 DTO** — Crie `libraries/nestjs-libraries/src/dtos/settings/update.profile-persona.dto.ts`:

```typescript
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfilePersonaDto {
  @IsOptional() @IsString() @MaxLength(2000) brandDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(500) toneOfVoice?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) writingInstructions?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(100, { each: true }) preferredCtas?: string[];
  @IsOptional() @IsString() @MaxLength(2000) contentRestrictions?: string | null;
  @IsOptional() @IsString() @MaxLength(500) imageStyle?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) targetAudience?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(5000, { each: true }) examplePosts?: string[];
}
```

**1.5 Endpoints no Settings Controller** — Em `apps/backend/src/api/routes/settings.controller.ts`, adicione 3 endpoints (todos ADMIN only via CheckPolicies):

```
GET    /settings/profiles/:profileId/persona        → { persona }
PUT    /settings/profiles/:profileId/persona        → { persona } (body: UpdateProfilePersonaDto)
DELETE /settings/profiles/:profileId/persona        → { success: true }
```

Injete `ProfileService` no construtor do controller.

**1.6 Persona prompt helper** — Crie `libraries/nestjs-libraries/src/chat/helpers/persona.prompt.ts`:

Interface `PersonaLike` com os 8 campos opcionais. Funcao `sanitize()` que escapa backticks (` → '), `${` → `$ {`, e remove tags `<script>/<style>/<iframe>`. Funcao `renderPersonaPrompt()` que monta bloco formatado com headers === PROFILE PERSONA === / === END ===.

**1.7 Injecao no agente Mastra** — Em `apps/backend/src/api/routes/copilot.controller.ts`:

- Import ProfileService
- Apos ter o profile, chamar `_profileService.getPersonaForAgent(profile.id)`
- Serializar persona como JSON e setar `runtimeContext.set('persona', personaPayload)`

Em `libraries/nestjs-libraries/src/chat/load.tools.service.ts`:

- Na funcao `instructions` do agente, ler `runtimeContext.get('persona')`, parsear JSON, chamar `renderPersonaPrompt()` e concatenar no system prompt
- Adicionar instrucao: "Before writing any post that references specific products, prices, features or factual claims about the brand, ALWAYS call 'knowledgeBaseQuery' first..."

Em `libraries/nestjs-libraries/src/chat/tools/generate.image.tool.ts`:

- Ler `runtimeContext.get('persona')`, parsear, e se tiver `imageStyle`, prefixar no prompt DALL-E: `Style: ${persona.imageStyle}. ${prompt}`

**1.8 Injecao no Generator LangGraph** — Em `libraries/nestjs-libraries/src/agent/agent.graph.service.ts`:

- Adicionar `PersonaData` interface e campo `persona` no `WorkflowChannelsState`
- IMPORTANTE: criar funcao `escapeTemplateBraces(s)` que escapa `{` → `{{` e `}` → `}}` para LangChain ChatPromptTemplate
- `renderPersonaForPrompt()` local usando escapeTemplateBraces em todos os campos
- Nos metodos `generateHook` e `generateContent`, criar `personaTone` com escape: `escapeTemplateBraces(state.persona.toneOfVoice)` — NUNCA concatenar diretamente no template sem escape!
- Em `generatePictures`, prefixar `state.persona.imageStyle` no prompt DALL-E (aqui NAO precisa escape pois nao vai em ChatPromptTemplate)
- Adicionar metodo `loadPersona(profileId)` que chama `_profileService.getPersonaForAgent`
- No metodo `start()`, tornar async, carregar persona e passar no initial state

Em `apps/backend/src/api/routes/posts.controller.ts`:
- Ajustar chamada de `start()` para `const stream = await ...start(); for await (const event of stream)`

**1.9 Frontend — Persona hooks** — Crie `apps/frontend/src/components/settings/profile-persona.hooks.ts`:

```typescript
'use client';
import useSWR from 'swr';
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface ProfilePersona { /* 8 campos + id + profileId */ }
export interface ProfileListItem { id: string; name: string; isDefault: boolean; }

export const useProfilesList = () => { /* SWR fetching /profiles */ };
export const useProfilePersona = (profileId: string | null) => { /* SWR fetching /settings/profiles/{id}/persona */ };
```

**1.10 Frontend — Persona component** — Crie `apps/frontend/src/components/settings/profile-persona.settings.component.tsx`:

- Sub-components: LabeledTextarea, LabeledInput, SelectPreset (dropdown + custom input), TagInput (tags com Enter), MultiTextarea (lista ate 5)
- TONE_PRESETS: custom, professional, friendly, playful, inspirational, technical, casual
- STYLE_PRESETS: custom, photorealistic, flat, 3D, watercolor, corporate, cartoon
- Componente principal `ProfilePersonaSettingsSection` com prop opcional `profileId?: string | null`
  - Se profileId fornecido via prop: nao mostra seletor interno, nao mostra titulo (modo embedded na tab Agente de IA)
  - Se profileId undefined: mostra titulo, descricao e seletor interno (modo standalone)
- Botoes Save (PUT) e Clear (DELETE)

### PARTE 2: Knowledge Base (RAG) com pgvector

**2.1 Schema Prisma** — Adicione:

```prisma
enum KnowledgeDocumentStatus { PROCESSING; READY; FAILED }

model ProfileKnowledgeDocument {
  id          String                  @id @default(uuid())
  profileId   String
  filename    String
  mimeType    String
  sizeBytes   Int
  status      KnowledgeDocumentStatus @default(PROCESSING)
  chunkCount  Int                     @default(0)
  errorMessage String?
  createdAt   DateTime                @default(now())
  updatedAt   DateTime                @updatedAt
  profile     Profile                 @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@index([profileId])
  @@index([status])
}
```

**2.2 Dependencias** — Adicione ao `package.json` raiz:
- `"@mastra/rag": "^2.1.3"`
- `"pdf-parse": "^2.4.5"`

**2.3 PgVector store** — Edite `libraries/nestjs-libraries/src/chat/mastra.store.ts`:

- Import `PgVector` de `@mastra/pg`
- Adicione funcao `knowledgeBaseEnabled()` que le `ENABLE_KNOWLEDGE_BASE` (default true, false se env = "false" ou "0")
- Exporte `isKnowledgeBaseEnabled` e `pgVector: PgVector | null`

**2.4 Vector init** — Crie `libraries/nestjs-libraries/src/chat/vector/vector.init.service.ts`:

```typescript
@Injectable()
export class VectorInitService implements OnModuleInit {
  async onModuleInit() {
    // Se KB enabled E DATABASE_URL setado: roda CREATE EXTENSION IF NOT EXISTS vector
    // Usa Pool direto (pg), nao Prisma
  }
}
```

**2.5 Knowledge repository** — Crie `libraries/nestjs-libraries/src/database/prisma/knowledge/knowledge.repository.ts`:

Metodos: `listByProfile`, `getById`, `create`, `updateStatus`, `delete`

**2.6 Knowledge service** — Crie `libraries/nestjs-libraries/src/database/prisma/knowledge/knowledge.service.ts`:

- `enabled` getter — `isKnowledgeBaseEnabled && !!pgVector`
- `assertEnabled()` — 403 se disabled
- `assertOwnership(orgId, profileId)` — valida perfil pertence a org
- `list(orgId, profileId)` — lista documentos por perfil
- `upload(orgId, profileId, file)` — valida mime (PDF/TXT/MD), max 10MB, cria record PROCESSING, dispara `processDocument` em background (fire-and-forget)
- `delete(orgId, profileId, documentId)` — remove chunks do pgVector + deleta record
- `extractText(file)` — PDF via `require('pdf-parse')` (CJS!), TXT/MD via buffer.toString
- `processDocument(documentId, profileId, file)` — extrair texto → MDocument.fromText → chunk recursive (maxSize:512, overlap:50) → embedMany (openai text-embedding-3-small, cast as any por EmbeddingModelV2/V1) → pgVector.upsert → READY. Erros marcam FAILED com errorMessage.
- `query(profileId, queryText, topK=4)` — embed query → pgVector.query com filter {profileId}
- Index name: `kb_${profileId.replace(/-/g, '')}`

**2.7 Knowledge query tool** — Crie `libraries/nestjs-libraries/src/chat/tools/knowledge.query.tool.ts`:

- Registre em `tool.list.ts`
- Le `runtimeContext.get('profileId')`
- Chama `_knowledgeService.query(profileId, query, topK)`

**2.8 Database module** — Registre em `libraries/nestjs-libraries/src/database/prisma/database.module.ts`:
- `VectorInitService`, `KnowledgeRepository`, `KnowledgeService`

**2.9 Endpoints KB** — Em `settings.controller.ts`, adicione (todos ADMIN):

```
GET    /settings/profiles/:profileId/knowledge              → { documents, enabled }
POST   /settings/profiles/:profileId/knowledge/upload       → { document } (multipart, FileInterceptor)
DELETE /settings/profiles/:profileId/knowledge/:documentId  → { success }
```

NAO implemente endpoint de reindex (buffer nao e persistido, nao funciona).

**2.10 Frontend — KB hooks** — Crie `apps/frontend/src/components/settings/knowledge-base.hooks.ts`:

```typescript
export const useKnowledgeDocuments = (profileId: string | null) => {
  // SWR com refreshInterval de 2s quando algum doc esta PROCESSING
  // IMPORTANTE: checar res.ok antes de res.json() — 403 retorna {documents:[], enabled:false}
};
```

**2.11 Frontend — KB component** — Crie `apps/frontend/src/components/settings/knowledge-base.settings.component.tsx`:

- StatusBadge component (READY verde, PROCESSING amarelo, FAILED vermelho)
- Upload via FormData + FileInterceptor
- Tabela de documentos com filename, size, status, delete
- Banner quando KB desabilitada
- Aceitar prop opcional `profileId?: string | null` (mesmo padrao da Persona — se fornecido, esconde seletor interno)

### PARTE 3: Tab Unificada "Agente de IA"

**3.1 Componente wrapper** — Crie `apps/frontend/src/components/settings/ai-agent.settings.component.tsx`:

- Titulo "Agente de IA" (traduzido)
- Seletor de perfil compartilhado no topo
- 3 secoes colapsiveis (CollapsibleSection com +/- toggle):
  1. **Persona** — renderiza `<ProfilePersonaSettingsSection profileId={selectedProfileId} />`
  2. **Base de Conhecimento** — renderiza `<KnowledgeBaseSettingsSection profileId={selectedProfileId} />`
  3. **Creditos** (fechado por padrao) — renderiza `<AiCreditsSettingsSection />`

**3.2 Settings layout** — Em `apps/frontend/src/components/layout/settings.component.tsx`:

- Substituir as 3 tabs (`ai_persona`, `knowledge_base`, `ai_credits`) por 1 tab (`ai_agent`)
- Substituir os 3 blocos de render por 1: `<AiAgentSettingsSection />`
- Atualizar imports

### PARTE 4: Traducoes

Adicione chaves em `libraries/react-shared-libraries/src/translation/locales/en/translation.json` e `pt/translation.json`:

**Chaves da tab Agente de IA:**
- `ai_agent_tab`: "AI Agent" / "Agente de IA"
- `ai_agent_description`: "Configure how the AI agent generates content for each profile." / "Configure como o agente de IA gera conteudo para cada perfil."
- `ai_agent_section_persona`: "Persona" / "Persona"
- `ai_agent_section_kb`: "Knowledge Base" / "Base de Conhecimento"
- `ai_agent_section_credits`: "Credits" / "Creditos"
- `ai_agent_credits_description`: "Manage AI image and video generation credits per profile." / "Gerencie creditos de geracao de imagem e video por perfil."

**Chaves da Persona** (prefixo `persona_`): tab, title, description, select_profile, brand_description, brand_placeholder, target_audience, audience_placeholder, tone, tone_placeholder, tone_professional, tone_friendly, tone_playful, tone_inspirational, tone_technical, tone_casual, custom_blank, custom_option, writing_instructions, writing_placeholder, preferred_ctas, ctas_placeholder, restrictions, restrictions_placeholder, image_style, style_placeholder, style_photoreal, style_flat, style_3d, style_watercolor, style_corporate, style_cartoon, example_posts, example_placeholder, add, add_example, remove, save, clear, saved, cleared, save_error, loading

**Chaves da Knowledge Base** (prefixo `kb_`): tab, title, description, upload, upload_hint, uploaded, upload_error, delete, deleted, filename, size, status, ready, processing, failed, empty, disabled_banner

### PARTE 5: .env.example

Adicione:
```
ENABLE_KNOWLEDGE_BASE="true"
```

### PARTE 6: Docker

Atualize a imagem do PostgreSQL nos docker-compose para `pgvector/pgvector:pg17` (necessario para a extensao vector).

### PARTE 7: CHANGELOG.md

Adicione em `## [Unreleased] > ### Adicionado`:
- Tab unificada "Agente de IA" nas configuracoes — consolida Persona, Base de Conhecimento e Creditos em uma unica view com secoes colapsiveis e seletor de perfil compartilhado
- Persona de IA por perfil — agencias podem configurar tom de voz, publico-alvo, CTAs preferidos, restricoes de conteudo e estilo de imagem por cliente
- Knowledge Base por perfil via RAG com pgvector — usuarios enviam PDFs, TXT ou MD e o agente pode citar fatos desses documentos ao gerar posts

### PARTE 8: Documentacao

Crie:
- `docs/architecture/profile-ai-persona.md` — documentacao da persona
- `docs/architecture/knowledge-base-rag.md` — documentacao da KB

Atualize `CLAUDE.md` com secoes sobre Persona de IA e Knowledge Base.

---

## Armadilhas e bugs conhecidos — LEIA ANTES DE IMPLEMENTAR

1. **CRITICO — Escape de chaves no LangChain**: `ChatPromptTemplate.fromTemplate()` interpreta `{`/`}` como placeholders. Se `toneOfVoice` ou qualquer campo da persona contiver chaves, DEVE ser escapado com `escapeTemplateBraces()` ANTES de concatenar no template string. Nao escapar nos `.invoke({})` — so no template literal.

2. **pdf-parse e CJS**: `pdf-parse` v2 nao funciona com `import()` dinamico. Use `require('pdf-parse')`.

3. **EmbeddingModel V1 vs V2**: `openai.embedding('text-embedding-3-small')` retorna EmbeddingModelV2 mas `embedMany` espera V1 em algumas versoes. Cast `as any` resolve.

4. **start() async no LangGraph**: `AgentGraphService.start()` retorna StreamEvents. Quando tornar async, o chamador (`posts.controller.ts`) precisa `const stream = await start(); for await (const event of stream)`.

5. **SWR hooks**: cada hook SWR deve estar em funcao separada (regra do projeto). Nunca retornar multiplos SWR de um unico hook.

6. **res.ok no frontend**: Sempre checar `res.ok` antes de `res.json()` nos hooks de KB — 403 quando KB desabilitada deve retornar fallback, nao quebrar a UI.

7. **Endpoint reindex NAO funciona**: O buffer do upload nao e persistido. Nao implemente endpoint de reindex — usuarios devem re-fazer upload.

8. **t() com chave dinamica**: `t(\`video_provider_${p.identifier}\`, p.title)` retorna tipo incompativel com React children. Wrap com `String()`.

**PROMPT FIM**

---

## Arvore de arquivos criados/modificados

```
CRIADOS:
  apps/frontend/src/components/settings/ai-agent.settings.component.tsx
  apps/frontend/src/components/settings/knowledge-base.hooks.ts
  apps/frontend/src/components/settings/knowledge-base.settings.component.tsx
  apps/frontend/src/components/settings/profile-persona.hooks.ts
  apps/frontend/src/components/settings/profile-persona.settings.component.tsx
  libraries/nestjs-libraries/src/chat/helpers/persona.prompt.ts
  libraries/nestjs-libraries/src/chat/tools/knowledge.query.tool.ts
  libraries/nestjs-libraries/src/chat/vector/vector.init.service.ts
  libraries/nestjs-libraries/src/database/prisma/knowledge/knowledge.repository.ts
  libraries/nestjs-libraries/src/database/prisma/knowledge/knowledge.service.ts
  libraries/nestjs-libraries/src/dtos/settings/update.profile-persona.dto.ts
  docs/architecture/profile-ai-persona.md
  docs/architecture/knowledge-base-rag.md

MODIFICADOS:
  libraries/nestjs-libraries/src/database/prisma/schema.prisma
  libraries/nestjs-libraries/src/database/prisma/profiles/profile.repository.ts
  libraries/nestjs-libraries/src/database/prisma/profiles/profile.service.ts
  libraries/nestjs-libraries/src/database/prisma/database.module.ts
  libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  libraries/nestjs-libraries/src/chat/load.tools.service.ts
  libraries/nestjs-libraries/src/chat/mastra.store.ts
  libraries/nestjs-libraries/src/chat/tools/generate.image.tool.ts
  libraries/nestjs-libraries/src/chat/tools/tool.list.ts
  apps/backend/src/api/routes/settings.controller.ts
  apps/backend/src/api/routes/copilot.controller.ts
  apps/backend/src/api/routes/posts.controller.ts
  apps/frontend/src/components/layout/settings.component.tsx
  apps/frontend/src/components/launches/ai.video.tsx
  libraries/react-shared-libraries/src/translation/locales/en/translation.json
  libraries/react-shared-libraries/src/translation/locales/pt/translation.json
  package.json
  pnpm-lock.yaml
  .env.example
  CLAUDE.md
  CHANGELOG.md
```

## Dependencias adicionadas

```json
"@mastra/rag": "^2.1.3",
"pdf-parse": "^2.4.5"
```

## Resumo dos testes que passavam

- 18 unit tests (persona prompt, repository, service)
- Frontend typecheck limpo (exceto erros pre-existentes de automacoes/@xyflow)
- Backend typecheck limpo (exceto erros pre-existentes de wallet/empty providers)
- `prisma-generate` sem erros
- CI `build-and-publish` (Docker) e `build (22.12.0)` passando
