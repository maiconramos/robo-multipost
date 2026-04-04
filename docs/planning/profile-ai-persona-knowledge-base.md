# Profile AI Persona + Knowledge Base (RAG)

> Documento de plano de implementacao para o agente de IA que vai executar a tarefa.
> Este plano assume desenvolvimento na branch `claude/analyze-agent-profiles-0Zst1`.
> Idioma: portugues sem acentos (compatibilidade de arquivos) conforme CLAUDE.md.

## 1. Objetivo

Adicionar duas capacidades complementares ao agente de IA do Robo MultiPost:

1. **Profile AI Persona** - configuracao por perfil que define **como** o agente escreve
   (tom de voz, CTAs preferidos, restricoes de conteudo, estilo de imagem, publico alvo).
2. **Knowledge Base (RAG)** - base de conhecimento vetorial por perfil que define
   **sobre o que** o agente pode escrever (PDFs, textos de produtos, briefings, FAQ).

Cenario de uso: agencia tem multiplos perfis (cada um um cliente). Cada cliente tem
tom de voz unico, restricoes e catalogo de produtos. O agente precisa conhecer ambos
ao planejar e gerar conteudo.

## 2. Estado atual do codigo (referencia)

### 2.1 O que ja existe

- **Prisma Profile model** - `libraries/nestjs-libraries/src/database/prisma/schema.prisma:1004-1036`
  com apenas `name`, `slug`, `description`, `avatarUrl`, `isDefault`, `lateApiKey`,
  `shortlink`, `aiImageCredits`, `aiVideoCredits`.
- **Mastra Agent** - `libraries/nestjs-libraries/src/chat/load.tools.service.ts:43-103`
  - System prompt dinamico via `instructions: ({ runtimeContext }) => ...`
  - Modelo `openai('gpt-5.2')`
  - Memory com PostgreSQL (`pStore`) via `@mastra/memory`
  - Working memory schema: `AgentState = { proverbs: string[] }` (linha 11-13)
  - 8 tools em `libraries/nestjs-libraries/src/chat/tools/tool.list.ts`
- **RuntimeContext** - `apps/backend/src/api/routes/copilot.controller.ts:78-86`
  - Ja passa `integrations`, `organization` (JSON), `profileId`, `ui`
  - `ChannelsContext` type declarado na linha 28-33
- **Generator LangGraph** - `libraries/nestjs-libraries/src/agent/agent.graph.service.ts`
  - Pipeline de 11 nos
  - Aceita apenas `tone: 'personal' | 'company'` (linha 45)
  - Nos: `generateHook` (215), `generateContent` (257), `generatePictures` (318)
  - Metodo `start(orgId, body, profileId)` (linha 377)
- **ProfileRepository** - `libraries/nestjs-libraries/src/database/prisma/profiles/profile.repository.ts`
- **ProfileService** - `libraries/nestjs-libraries/src/database/prisma/profiles/profile.service.ts`
- **SettingsController** - `apps/backend/src/api/routes/settings.controller.ts`
  - Padrao estabelecido: `GET/PUT /settings/profiles/:profileId/ai-credits` (linhas 136-175)
- **Mastra store** - `libraries/nestjs-libraries/src/chat/mastra.store.ts:1-5`
  - **IMPORTANTE**: `PgVector` ja e importado de `@mastra/pg` mas nao e usado.
- **Docker compose** - `docker-compose.yaml:204` e `docker-compose.dev.yaml:8`
  - **Ja atualizado** nesta branch para `pgvector/pgvector:pg17`

### 2.2 O que NAO existe

- Campos de persona/instrucoes/restricoes no modelo Profile
- UI de configuracao de persona
- Injecao de contexto do perfil no system prompt do agente
- Injecao de contexto no Generator pipeline
- Vector store ativo (PgVector importado mas nao instanciado)
- Upload de documentos
- Chunking/embedding de textos
- Tool de busca semantica para o agente
- Extensao `pgvector` habilitada no postgres

## 3. Arquitetura

### 3.1 Separacao de responsabilidades

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Persona | Campos texto em nova tabela `ProfilePersona` | "Como" escrever |
| Knowledge Base | `@mastra/rag` + PgVector + `@mastra/pg` | "Sobre o que" escrever |
| Agente | Mastra + RuntimeContext | Usa Persona (prompt) + KB (tool) |
| Generator | LangGraph | Usa Persona (prompts dos nos) + KB (retrieval inicial) |

### 3.2 Feature flags

```env
# Habilita/desabilita Knowledge Base. Default: true (se nao definido)
ENABLE_KNOWLEDGE_BASE="true"

# Ja existente, nao mexer
OPENAI_API_KEY="..."
DATABASE_URL="..."
```

**Comportamento quando `ENABLE_KNOWLEDGE_BASE=false`:**
- Upload de documentos nao aparece na UI
- `knowledgeBaseQuery` tool nao e registrada no agente
- Extensao pgvector nao e necessaria
- Persona continua funcionando normalmente

### 3.3 Isolamento por perfil

- Cada perfil tem **seu proprio indice vetorial**: `kb_{profileId_hash}`
- Evita vazamento de informacao entre perfis de clientes diferentes
- Persona e 1:1 com Profile (tabela separada com `@unique` no `profileId`)


## 4. Schema de dados

### 4.1 Novo modelo `ProfilePersona`

Adicionar em `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
**apos o modelo Profile** (depois da linha 1036):

```prisma
model ProfilePersona {
  id                  String   @id @default(uuid())
  profileId           String   @unique
  brandDescription    String?  @db.Text
  toneOfVoice         String?
  writingInstructions String?  @db.Text
  preferredCtas       String[] @default([])
  contentRestrictions String?  @db.Text
  imageStyle          String?
  targetAudience      String?  @db.Text
  examplePosts        String[] @default([])
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  profile             Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId])
}
```

No modelo `Profile` existente, adicionar a relacao reversa (logo antes do fecha-chaves na linha 1036):

```prisma
  persona        ProfilePersona?
```

### 4.2 Novo modelo `ProfileKnowledgeDocument`

Armazena metadados dos documentos enviados pelo usuario (o conteudo vetorizado vai no PgVector).

```prisma
model ProfileKnowledgeDocument {
  id           String   @id @default(uuid())
  profileId    String
  filename     String
  mimeType     String
  sizeBytes    Int
  chunkCount   Int      @default(0)
  indexName    String
  status       KnowledgeDocumentStatus @default(PROCESSING)
  errorMessage String?  @db.Text
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  profile      Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId])
  @@index([status])
}

enum KnowledgeDocumentStatus {
  PROCESSING
  READY
  FAILED
}
```

Adicionar tambem no modelo Profile:

```prisma
  knowledgeDocuments ProfileKnowledgeDocument[]
```

### 4.3 Migration SQL complementar

O `prisma db push` cria tabelas/colunas mas **NAO instala extensoes**.
Criar arquivo `libraries/nestjs-libraries/src/database/prisma/migrations/pgvector-init.sql`:

```sql
-- Habilita a extensao pgvector para armazenar embeddings
CREATE EXTENSION IF NOT EXISTS vector;
```

**Como aplicar**: chamar este SQL no startup do app (antes do Mastra inicializar o PgVector),
via `PrismaClient.$executeRawUnsafe`. Se `ENABLE_KNOWLEDGE_BASE=false`, pular esta etapa.

### 4.4 Valores especiais nos campos

| Campo | `null` | String vazia | Valor valido |
|---|---|---|---|
| `brandDescription` | Nao configurado | Mesmo que null | Usar no prompt |
| `toneOfVoice` | Nao configurado | Mesmo que null | Usar no prompt |
| `preferredCtas` | `[]` | - | Usar lista no prompt |
| `examplePosts` | `[]` | - | Max 5 no prompt (truncar) |
| `contentRestrictions` | Sem restricoes | Mesmo que null | Injetar como "NEVER mention" |

## 5. Contratos de API (API-First)

Todos os endpoints usam `@CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])`
seguindo o padrao dos endpoints de ai-credits.

### 5.1 Persona endpoints

```
GET    /settings/profiles/:profileId/persona
PUT    /settings/profiles/:profileId/persona
DELETE /settings/profiles/:profileId/persona
```

**GET response:**
```json
{
  "brandDescription": "string | null",
  "toneOfVoice": "string | null",
  "writingInstructions": "string | null",
  "preferredCtas": ["string"],
  "contentRestrictions": "string | null",
  "imageStyle": "string | null",
  "targetAudience": "string | null",
  "examplePosts": ["string"]
}
```

**PUT body (`UpdateProfilePersonaDto`):** mesmos campos, todos opcionais.

**DELETE response:** `{ "ok": true }` (remove o registro inteiro).

### 5.2 Knowledge Base endpoints

```
GET    /settings/profiles/:profileId/knowledge
POST   /settings/profiles/:profileId/knowledge/upload
DELETE /settings/profiles/:profileId/knowledge/:documentId
POST   /settings/profiles/:profileId/knowledge/:documentId/reindex
```

**GET response:**
```json
{
  "enabled": true,
  "documents": [
    {
      "id": "uuid",
      "filename": "catalogo-2026.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 1234567,
      "chunkCount": 47,
      "status": "READY",
      "errorMessage": null,
      "createdAt": "2026-04-04T10:00:00Z"
    }
  ]
}
```

Se `ENABLE_KNOWLEDGE_BASE=false`, retorna `{ "enabled": false, "documents": [] }`.

**POST /upload body:** `multipart/form-data` com campo `file` (PDF ou TXT).
Response: `{ id, filename, status }` com status inicial `PROCESSING`.
Processamento e **assincrono** (via Temporal activity ou queue interno).

**DELETE:** remove o registro da tabela E o indice vetorial daquele documento.

**POST /reindex:** reprocessa o documento (util se upload falhou).

### 5.3 Erros padronizados

| Codigo | Quando |
|---|---|
| 400 | Arquivo invalido, tipo nao suportado, tamanho excedido |
| 403 | ENABLE_KNOWLEDGE_BASE=false (em endpoints de KB) |
| 404 | Profile nao encontrado, documento nao encontrado |
| 413 | Arquivo maior que 10MB |
| 503 | PgVector indisponivel (extensao nao instalada) |

## 6. Plano em Ondas (TDD)

**Metodologia**: cada onda segue o ciclo TDD:
1. Escrever teste que falha
2. Implementar minimo para passar
3. Refatorar se necessario
4. So entao passar para proxima tarefa da onda

Cada onda deve resultar em **1 commit funcional** (app builda e testes passam).


---

### Onda 1 - Schema de Persona (Base de dados)

**Objetivo**: criar tabela `ProfilePersona` no banco e gerar client Prisma.

**Arquivos a modificar:**
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

**Passos:**
1. Adicionar modelo `ProfilePersona` apos linha 1036
2. Adicionar relacao `persona ProfilePersona?` dentro do modelo Profile
3. Rodar `pnpm prisma-generate` para atualizar o client
4. Rodar `pnpm prisma-db-push` para aplicar no banco local

**Testes (nao aplicavel a schema puro)**: validar via query manual que a tabela
foi criada com `SELECT * FROM "ProfilePersona" LIMIT 1`.

**Criterio de conclusao:**
- [x] Client Prisma gerado sem erros de tipagem
- [x] Tabela criada no banco local
- [x] Build do backend passa: `pnpm build:backend`

**Edge cases:**
- Usuarios atualizando de versao anterior: tabela e criada automaticamente pelo
  `prisma-db-push` no startup (package.json:19). Zero downtime.
- Perfis existentes nao tem persona (relacao nullable). Sistema trata como "nao configurado".

---

### Onda 2 - Repository + Service de Persona (TDD)

**Objetivo**: camada de dados e logica de negocio para Persona.

**Arquivos a criar:**
- `libraries/nestjs-libraries/src/database/prisma/profiles/__tests__/profile.persona.service.spec.ts`
- `libraries/nestjs-libraries/src/database/prisma/profiles/__tests__/profile.persona.repository.spec.ts`

**Arquivos a modificar:**
- `libraries/nestjs-libraries/src/database/prisma/profiles/profile.repository.ts`
- `libraries/nestjs-libraries/src/database/prisma/profiles/profile.service.ts`

**Testes a escrever primeiro (TDD):**

Repository:
- `getPersona` retorna `null` quando nao existe
- `getPersona` retorna a persona quando existe
- `upsertPersona` cria registro se nao existir
- `upsertPersona` atualiza se ja existir (valida via `@unique profileId`)
- `upsertPersona` com campos parciais mantem os outros intactos
- `deletePersona` remove o registro
- `deletePersona` e idempotente (nao falha se nao existir)

Service:
- `getPersona(orgId, profileId)` valida que profile pertence ao org
- `getPersona(orgId, profileId)` retorna 404 se profile nao pertence ao org
- `updatePersona` valida ownership antes de delegar
- `updatePersona` trunca `examplePosts` a 5 items (regra de negocio)
- `updatePersona` rejeita `contentRestrictions` maior que 5000 chars
- `getPersonaForAgent(profileId)` retorna persona sem checagem de org (uso interno)
- `getPersonaForAgent` retorna null se nao existir

**Implementacao (metodos a adicionar):**

ProfileRepository:
```typescript
getPersona(profileId: string)
upsertPersona(profileId: string, data: PersonaData)
deletePersona(profileId: string)
```

ProfileService:
```typescript
getPersona(orgId: string, profileId: string)
updatePersona(orgId: string, profileId: string, data: PersonaData)
deletePersona(orgId: string, profileId: string)
getPersonaForAgent(profileId: string) // uso interno, sem org check
```

**Criterio de conclusao:**
- [x] Todos os testes passam: `pnpm jest profile.persona`
- [x] Coverage dos novos metodos > 90%
- [x] Build passa

**Edge cases cobertos:**
- Profile nao encontrado -> HttpException 404
- Profile de outro org -> HttpException 404 (nao 403, para nao vazar existencia)
- Payload vazio `{}` -> upsert com campos mantidos
- Arrays com items vazios `["", "abc"]` -> filtrar vazios antes de salvar
- `examplePosts` com 10 items -> truncar silenciosamente para 5

---

### Onda 3 - DTO + Controller endpoints de Persona (TDD)

**Objetivo**: expor API REST para CRUD de persona.

**Arquivos a criar:**
- `libraries/nestjs-libraries/src/dtos/settings/update.profile-persona.dto.ts`
- `apps/backend/src/api/routes/__tests__/settings.controller.persona.spec.ts`

**Arquivos a modificar:**
- `apps/backend/src/api/routes/settings.controller.ts` (adicionar 3 endpoints)

**DTO com class-validator:**

```typescript
import { IsArray, IsOptional, IsString, MaxLength, ArrayMaxSize } from 'class-validator';

export class UpdateProfilePersonaDto {
  @IsOptional() @IsString() @MaxLength(2000)
  brandDescription?: string;

  @IsOptional() @IsString() @MaxLength(100)
  toneOfVoice?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  writingInstructions?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true })
  preferredCtas?: string[];

  @IsOptional() @IsString() @MaxLength(5000)
  contentRestrictions?: string;

  @IsOptional() @IsString() @MaxLength(100)
  imageStyle?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  targetAudience?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true })
  examplePosts?: string[];
}
```

**Testes do controller:**
- GET retorna persona existente
- GET retorna objeto com todos campos null quando nao existe
- PUT com payload valido salva
- PUT com `contentRestrictions` > 5000 chars retorna 400
- PUT com `examplePosts` com 6+ items retorna 400 (validacao DTO)
- PUT em profile de outro org retorna 404
- DELETE remove persona
- DELETE em persona nao existente retorna 200 (idempotente)
- Usuario sem ADMIN e bloqueado (403)

**Criterio de conclusao:**
- [x] Testes passam
- [x] Swagger documenta os endpoints
- [x] Build backend passa

**Edge cases:**
- Body `null` ou vazio -> tratar como `{}` sem quebrar
- Campos com valor undefined vs null: undefined = nao atualiza, null = limpa campo
- Request com Content-Type errado -> 415


---

### Onda 4 - Injecao de Persona no Mastra Agent

**Objetivo**: agente passa a receber e usar a persona do perfil ativo no system prompt.

**Arquivos a modificar:**
- `apps/backend/src/api/routes/copilot.controller.ts`
- `libraries/nestjs-libraries/src/chat/load.tools.service.ts`
- `libraries/nestjs-libraries/src/chat/tools/generate.image.tool.ts`

**Arquivos a criar:**
- `libraries/nestjs-libraries/src/chat/__tests__/load.tools.service.spec.ts`
- `libraries/nestjs-libraries/src/chat/helpers/persona.prompt.ts`

**Passos:**

1. **Extender `ChannelsContext`** (`copilot.controller.ts:28-33`):
```typescript
export type ChannelsContext = {
  integrations: string;
  organization: string;
  profileId: string;
  ui: string;
  persona: string; // JSON stringified ou ""
};
```

2. **Injetar ProfileService** no CopilotController (constructor linha 37-40)

3. **No metodo `agent()` (linhas 62-110)**, apos linha 85 (`runtimeContext.set('profileId', ...)`):
```typescript
if (profile?.id) {
  const persona = await this._profileService.getPersonaForAgent(profile.id);
  runtimeContext.set('persona', persona ? JSON.stringify(persona) : '');
} else {
  runtimeContext.set('persona', '');
}
```

4. **Criar helper `persona.prompt.ts`**:
```typescript
export interface PersonaData {
  brandDescription?: string | null;
  toneOfVoice?: string | null;
  writingInstructions?: string | null;
  preferredCtas?: string[];
  contentRestrictions?: string | null;
  imageStyle?: string | null;
  targetAudience?: string | null;
  examplePosts?: string[];
}

export function renderPersonaPrompt(persona: PersonaData | null): string {
  if (!persona) return '';

  const lines: string[] = [];
  lines.push('', '  Profile AI Persona (use these guidelines for all content):');

  if (persona.brandDescription) {
    lines.push(`    - Brand/Business: ${persona.brandDescription}`);
  }
  if (persona.toneOfVoice) {
    lines.push(`    - Tone of voice: ${persona.toneOfVoice}`);
  }
  if (persona.writingInstructions) {
    lines.push(`    - Writing style: ${persona.writingInstructions}`);
  }
  if (persona.preferredCtas?.length) {
    lines.push(`    - Preferred CTAs (use one of these at the end): ${persona.preferredCtas.join(' | ')}`);
  }
  if (persona.targetAudience) {
    lines.push(`    - Target audience: ${persona.targetAudience}`);
  }
  if (persona.contentRestrictions) {
    lines.push(`    - HARD RESTRICTIONS (NEVER violate these): ${persona.contentRestrictions}`);
  }
  if (persona.examplePosts?.length) {
    lines.push('    - Example posts for style reference:');
    persona.examplePosts.slice(0, 5).forEach((p, i) => {
      lines.push(`        ${i + 1}. ${p}`);
    });
  }

  lines.push('  IMPORTANT: The persona guidelines above override generic instructions. Content restrictions are absolute.');
  return lines.join('\n');
}
```

5. **Atualizar `load.tools.service.ts:48-86`** - ler persona do runtimeContext e
   chamar `renderPersonaPrompt`, concatenando no system prompt apos o bloco de regras de plataforma.

6. **Atualizar `generate.image.tool.ts`** - ler persona.imageStyle do runtimeContext:
```typescript
const personaRaw = runtimeContext.get('persona' as never);
const persona = personaRaw ? JSON.parse(personaRaw as string) : null;
const stylePrefix = persona?.imageStyle ? `Style: ${persona.imageStyle}. ` : '';
const finalPrompt = stylePrefix + context.prompt;
```

**Testes a escrever:**
- `renderPersonaPrompt(null)` retorna string vazia
- `renderPersonaPrompt({})` retorna string minima (so IMPORTANT)
- Persona completa inclui todos campos no prompt
- `examplePosts` com 8 items mostra apenas 5
- `contentRestrictions` sempre renderizado como "HARD RESTRICTIONS"
- Injection safety: caracteres especiais em campos nao quebram o prompt
  (ex: valores com `${}`, backticks, aspas)

**Criterio de conclusao:**
- [x] Testes unitarios do helper passam
- [x] Teste de integracao: chamar `/copilot/agent` com persona configurada
      e verificar via log que system prompt contem os campos
- [x] Tool de imagem usa imageStyle quando presente
- [x] Build passa

**Edge cases:**
- Perfil sem persona configurada -> `renderPersonaPrompt` retorna string vazia,
  system prompt fica igual ao original
- Persona com TODOS campos null -> nao adicionar secao ao prompt (skip)
- Campos com strings muito longas -> ja limitado pelo DTO (MaxLength)
- Profile default com persona configurada -> **permitir** (agencia pode querer
  persona para seu proprio perfil)
- User.role !== ADMIN nao consegue criar/editar persona (mesmo pattern do ai-credits)

**Performance:**
- Persona e buscada 1x por request do copilot (nao por tool call)
- Campos limitados: prompt adicional ~500-1200 tokens
- Sem cache inicial (query simples indexada)


---

### Onda 5 - Injecao de Persona no Generator LangGraph

**Objetivo**: o Generator (`/posts/generator`) tambem respeita a persona do perfil.

**Arquivos a modificar:**
- `libraries/nestjs-libraries/src/agent/agent.graph.service.ts`

**Arquivos a criar:**
- `libraries/nestjs-libraries/src/agent/__tests__/agent.graph.persona.spec.ts`

**Passos:**

1. **Extender `WorkflowChannelsState`** (linha 34-55):
```typescript
interface WorkflowChannelsState {
  // ... campos existentes ...
  persona?: PersonaData | null;
}
```

2. **Adicionar ao state channels** (linha 113):
```typescript
persona: null,
```

3. **Injetar `ProfileService`** no constructor do `AgentGraphService`

4. **Modificar metodo `start()` (linha 377)**:
```typescript
async start(orgId: string, body: GeneratorDto, profileId?: string) {
  let persona = null;
  if (profileId) {
    persona = await this._profileService.getPersonaForAgent(profileId);
  }
  // ... passar persona no initial state
}
```

5. **Modificar `generateHook` (linha 215-255)** - injetar no prompt:
   - Substituir `Make sure it sounds ${state.tone}` por:
     - Se persona.toneOfVoice existe: usar esse valor
     - Senao: manter comportamento atual
   - Adicionar: `contentRestrictions` como constraint negativa

6. **Modificar `generateContent` (linha 257-...)** - adicionar:
   - Persona tone/writing instructions
   - Preferred CTAs: substituir generico "Try to put some call to action" por lista
   - Content restrictions
   - Target audience context

7. **Modificar `generatePictures`** - prefixar `persona.imageStyle` no prompt do DALL-E

**Testes:**
- Generator sem persona -> prompts usam comportamento atual
- Generator com persona -> prompts incluem tone, CTAs, restricoes
- `persona.preferredCtas` gera CTA real no texto (teste de snapshot)
- `persona.imageStyle` prefixa prompt do DALL-E
- `persona.contentRestrictions` aparece como constraint negativa

**Criterio de conclusao:**
- [x] Testes passam
- [x] Build passa
- [x] Endpoint `/posts/generator` funciona com e sem persona

**Edge cases:**
- `profileId` undefined -> `persona = null`, comportamento original
- Persona sem toneOfVoice mas com preferredCtas -> usar tone binario + CTAs
- Conflito: persona.toneOfVoice diz "casual" mas body.tone diz "company" ->
  **persona.toneOfVoice tem precedencia** para o tom; body.tone continua
  controlando 1a/3a pessoa
- Persona com examplePosts -> mencionar brevemente no prompt como "inspiration"
  (nao copiar)

---

### Onda 6 - UI de configuracao de Persona

**Objetivo**: tela nas Settings para configurar persona por perfil.

**Arquivos a criar:**
- `apps/frontend/src/components/settings/profile-persona.settings.component.tsx`
- `apps/frontend/src/components/settings/profile-persona.hooks.ts` (SWR hooks separados)

**Arquivos a modificar:**
- `apps/frontend/src/components/layout/settings.component.tsx`
- `libraries/react-shared-libraries/src/translation/locales/pt/translation.json`
- `libraries/react-shared-libraries/src/translation/locales/en/translation.json`

**Estrutura do componente:**

```
ProfilePersonaSettingsSection (componente principal)
├── Dropdown "Selecione o perfil" (nao-default)
├── Formulario com:
│   ├── Textarea: brandDescription
│   ├── Select + input custom: toneOfVoice
│   │   presets: formal | casual | humoristico | tecnico | inspirador | custom
│   ├── Textarea: writingInstructions
│   ├── TagInput nativo: preferredCtas (type+Enter para adicionar, click-X para remover)
│   ├── Textarea: contentRestrictions
│   ├── Select + input custom: imageStyle
│   │   presets: realista | ilustrado | minimalista | abstrato | fotografico | custom
│   ├── Textarea: targetAudience
│   └── MultiTextarea nativo: examplePosts (ate 5 items, add/remove)
├── Botoes: Salvar | Resetar | Cancelar
└── Toast de confirmacao
```

**Hooks SWR (arquivo separado, regra do CLAUDE.md):**

```typescript
// profile-persona.hooks.ts
export const useProfilesList = () => useSWR('profiles-list', loadProfiles);
export const useProfilePersona = (profileId: string | null) =>
  useSWR(profileId ? `profile-persona-${profileId}` : null, () => loadPersona(profileId!));
```

**Componentes nativos necessarios (NAO instalar de npm, conforme CLAUDE.md):**
- `TagInput`: estado local com array, input + botao X em cada chip
- `MultiTextarea`: array de textareas com botao "+Adicionar" e X em cada

**Padrao visual**: seguir exatamente `ai-credits.settings.component.tsx` para
classes Tailwind, cores, bordas (bg-sixth, border-fifth, etc).

**Traducoes a adicionar (minimo):**
```
persona_title = "AI Persona" / "Persona de IA"
persona_select_profile = "Select a profile to configure"
persona_brand_description / persona_tone_of_voice / persona_writing_instructions
persona_preferred_ctas / persona_content_restrictions / persona_image_style
persona_target_audience / persona_example_posts
persona_add_cta / persona_add_example / persona_save / persona_reset
persona_saved_success / persona_reset_confirm
persona_tone_preset_formal / _casual / _humorous / _technical / _inspirational / _custom
persona_image_preset_realistic / _illustrated / _minimalist / _abstract / _photographic
```

**Nova tab no `settings.component.tsx`**:
- Adicionar na lista apos `ai_credits` (linha 117):
```typescript
if (user?.role !== 'USER') {
  arr.push({ tab: 'ai_persona', label: t('persona_title', 'AI Persona') });
}
```
- Adicionar o render block apos o bloco `ai_credits` (linha 219-223):
```typescript
{tab === 'ai_persona' && user?.role !== 'USER' && (
  <div>
    <ProfilePersonaSettingsSection />
  </div>
)}
```

**Testes (Jest + React Testing Library se configurado):**
- Render inicial mostra dropdown vazio se sem perfis
- Selecionar perfil carrega persona existente
- Salvar envia PUT com payload correto
- TagInput adiciona/remove CTAs
- MultiTextarea bloqueia em 5 items
- Toast de sucesso aparece apos save OK
- Toast de erro aparece com mensagem da API em caso de 400

**Criterio de conclusao:**
- [x] Tab aparece apenas para role != USER
- [x] Formulario salva e carrega corretamente
- [x] Traducoes PT e EN adicionadas
- [x] Validacao visual coerente com restante do sistema
- [x] `pnpm lint` passa da raiz
- [x] `pnpm build:frontend` passa

**Edge cases UI:**
- Perfil selecionado deletado em outra aba -> SWR re-fetch, mostrar estado "nao existe"
- Tentar abrir em profile default -> permitir (agencia/matriz)
- Usuario edita e tenta sair sem salvar -> confirm dialog (opcional, v2)
- Colar string 10000 chars em textarea -> validacao client-side + server
- CTAs duplicados -> deduplicar no submit
- Network down -> toast erro, manter estado local


---

### Onda 7 - pgvector + @mastra/rag (infraestrutura)

**Objetivo**: habilitar extensao pgvector e adicionar dependencias do RAG.

**Pre-requisito**: imagem postgres ja foi trocada para `pgvector/pgvector:pg17`
em `docker-compose.yaml` e `docker-compose.dev.yaml` (ja feito nesta branch).

**Arquivos a criar:**
- `libraries/nestjs-libraries/src/database/prisma/migrations/pgvector-init.sql`
- `libraries/nestjs-libraries/src/chat/vector/vector.init.service.ts`
- `libraries/nestjs-libraries/src/chat/vector/__tests__/vector.init.service.spec.ts`

**Arquivos a modificar:**
- `package.json` (adicionar `@mastra/rag`)
- `libraries/nestjs-libraries/src/chat/mastra.store.ts`
- `libraries/nestjs-libraries/src/chat/mastra.service.ts`
- `apps/backend/src/main.ts` (ou bootstrap NestJS)

**Passos:**

1. **Adicionar dependencia:**
```bash
pnpm add @mastra/rag
```

2. **Criar `pgvector-init.sql`:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

3. **Criar `VectorInitService`**:
```typescript
@Injectable()
export class VectorInitService implements OnModuleInit {
  private _logger = new Logger(VectorInitService.name);

  constructor(private _prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.ENABLE_KNOWLEDGE_BASE === 'false') {
      this._logger.log('Knowledge Base disabled, skipping pgvector init');
      return;
    }

    try {
      await this._prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
      this._logger.log('pgvector extension enabled');
    } catch (err) {
      this._logger.error('Failed to enable pgvector. Knowledge Base will be unavailable.', err);
      // NAO travar o startup - degradar graciosamente
    }
  }
}
```

4. **Atualizar `mastra.store.ts`:**
```typescript
import { PostgresStore, PgVector } from '@mastra/pg';

export const pStore = new PostgresStore({
  connectionString: process.env.DATABASE_URL,
});

export const pVector = process.env.ENABLE_KNOWLEDGE_BASE !== 'false'
  ? new PgVector({ connectionString: process.env.DATABASE_URL! })
  : null;
```

5. **Atualizar `mastra.service.ts`** - registrar vectors no Mastra:
```typescript
MastraService.mastra = new Mastra({
  storage: pStore,
  vectors: pVector ? { pgVector: pVector } : undefined,
  agents: { postiz: await this._loadToolsService.agent() },
  logger: new ConsoleLogger({ level: 'info' }),
});
```

**Testes:**
- `VectorInitService` chama CREATE EXTENSION quando flag habilitada
- `VectorInitService` nao chama quando `ENABLE_KNOWLEDGE_BASE=false`
- `VectorInitService` nao trava app se CREATE EXTENSION falha (log only)
- `pVector` e null quando desabilitado

**Criterio de conclusao:**
- [x] App sobe com e sem a flag
- [x] `psql` mostra `\dx` com `vector` extension
- [x] Build passa

**Edge cases:**
- Usuario em producao com imagem `postgres:17-alpine` antiga ->
  `CREATE EXTENSION` falha. Log de erro claro. Knowledge Base desabilita
  automaticamente. App continua funcionando (Persona intacta).
- Permissao SUPERUSER ausente -> erro de permissao. Documentar no README:
  "pgvector requer SUPERUSER ou que extensao seja pre-instalada pelo admin".
- DB em pool manager (pgbouncer) -> CREATE EXTENSION roda via conexao direta.

---

### Onda 8 - Schema de Knowledge Documents + Service

**Objetivo**: tabela de metadados de documentos e logica de upload/chunking/embedding.

**Arquivos a modificar:**
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

**Arquivos a criar:**
- `libraries/nestjs-libraries/src/chat/vector/knowledge.repository.ts`
- `libraries/nestjs-libraries/src/chat/vector/knowledge.service.ts`
- `libraries/nestjs-libraries/src/chat/vector/__tests__/knowledge.service.spec.ts`

**Passos:**

1. **Adicionar ao schema.prisma** (ver secao 4.2):
   - `enum KnowledgeDocumentStatus`
   - `model ProfileKnowledgeDocument`
   - relacao no Profile

2. **Rodar migrations:**
```bash
pnpm prisma-generate
pnpm prisma-db-push
```

3. **Implementar Service:**
```typescript
@Injectable()
export class KnowledgeService {
  constructor(
    private _repo: KnowledgeRepository,
    private _mastraService: MastraService,
  ) {}

  async uploadDocument(profileId: string, file: Express.Multer.File) {
    // 1. Validar tipo (PDF, TXT) e tamanho (< 10MB)
    // 2. Criar registro ProfileKnowledgeDocument status=PROCESSING
    // 3. Extrair texto (pdf-parse para PDF, utf-8 para TXT)
    // 4. Criar MDocument do @mastra/rag
    // 5. Chunk(strategy: 'recursive', size: 512, overlap: 50)
    // 6. embedMany(model: 'text-embedding-3-small')
    // 7. Garantir indice no PgVector (createIndex se nao existir)
    // 8. Upsert embeddings com metadata {documentId, profileId, text}
    // 9. Update status=READY, chunkCount
    // Em erro: status=FAILED, errorMessage
  }

  async deleteDocument(profileId: string, documentId: string) {
    // 1. Validar ownership (document.profileId === profileId)
    // 2. Deletar chunks do vector store por metadata {documentId}
    // 3. Deletar registro
  }

  async listDocuments(profileId: string) {
    return this._repo.listByProfile(profileId);
  }

  getIndexName(profileId: string): string {
    // kb_<hash(profileId)> - normalizar pois pgvector tem limite de nome
    return `kb_${profileId.replace(/-/g, '')}`;
  }

  async queryRelevantChunks(profileId: string, query: string, topK: number = 5) {
    // Usado pela tool do agente
    // 1. Gerar embedding da query
    // 2. pVector.query(indexName, embedding, topK)
    // 3. Retornar chunks de texto
  }
}
```

**Testes:**
- Upload de PDF valido cria registro PROCESSING
- Upload excede 10MB -> 413
- Upload de tipo invalido (docx) -> 400
- Chunking gera N chunks maiores que 0
- Delete remove chunks do vector store
- List retorna apenas documentos do profile
- Query retorna top K chunks por similaridade
- Erro de embedding marca como FAILED com errorMessage

**Criterio de conclusao:**
- [x] Testes passam (com mock do PgVector)
- [x] Upload end-to-end de um PDF funciona em ambiente local
- [x] Build passa

**Edge cases:**
- PDF com texto em imagem (OCR-less) -> 0 chunks, erro amigavel
  "Documento sem texto extraivel"
- PDF corrompido -> status FAILED, errorMessage
- Upload interrompido (timeout) -> registro fica PROCESSING para sempre
  -> cron de cleanup (opcional, v2) ou reindex manual
- Mesmo arquivo subido 2x -> 2 registros diferentes (user controla dedup)
- Profile deletado com documentos -> cascade deletion (ja configurado no schema)
- Indice nao existe no primeiro upload -> `createIndex` antes do upsert
- OpenAI rate limit no embedMany -> retry com backoff exponencial
- Custo de embedding: ~$0.00002/1K tokens. 10MB PDF ~= $0.10-$0.50


---

### Onda 9 - Knowledge Base Controller endpoints

**Objetivo**: expor REST API para CRUD de documentos.

**Arquivos a modificar:**
- `apps/backend/src/api/routes/settings.controller.ts`

**Arquivos a criar:**
- `apps/backend/src/api/routes/__tests__/settings.controller.knowledge.spec.ts`

**Endpoints** (ver secao 5.2):
- GET `/settings/profiles/:profileId/knowledge` - listar documentos
- POST `/settings/profiles/:profileId/knowledge/upload` - multipart upload
- DELETE `/settings/profiles/:profileId/knowledge/:documentId`
- POST `/settings/profiles/:profileId/knowledge/:documentId/reindex`

**Implementacao**: usar `FileInterceptor` do NestJS:

```typescript
@Post('/profiles/:profileId/knowledge/upload')
@CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}))
async uploadKnowledgeDoc(
  @GetOrgFromRequest() org: Organization,
  @Param('profileId') profileId: string,
  @UploadedFile() file: Express.Multer.File,
) {
  if (process.env.ENABLE_KNOWLEDGE_BASE === 'false') {
    throw new HttpException('Knowledge base disabled', 403);
  }
  // Validar ownership via profileService.getProfileById(org.id, profileId)
  return this._knowledgeService.uploadDocument(profileId, file);
}
```

**Testes:**
- Upload sem arquivo -> 400
- Upload > 10MB -> 413
- Upload de mime type invalido -> 400
- Upload de profile de outro org -> 404
- List retorna array (vazio ou nao)
- Delete remove documento
- Delete de documento inexistente -> 404
- Reindex chama service novamente
- ENABLE_KNOWLEDGE_BASE=false -> todos endpoints retornam 403

**Criterio de conclusao:**
- [x] Endpoints testados via curl/postman
- [x] Testes unitarios passam
- [x] Build passa

**Edge cases:**
- Multipart com campo errado -> 400
- Multiple files no mesmo request -> aceitar apenas primeiro
- Content-Length header ausente -> 411
- Upload concorrente do mesmo arquivo -> permitir (2 registros)
- Profile deletado enquanto upload processa -> reprocessamento falha,
  status=FAILED com mensagem clara

---

### Onda 10 - Vector Query Tool para o Agente

**Objetivo**: agente Mastra tem nova tool para buscar contexto na KB do perfil ativo.

**Arquivos a criar:**
- `libraries/nestjs-libraries/src/chat/tools/knowledge.query.tool.ts`
- `libraries/nestjs-libraries/src/chat/tools/__tests__/knowledge.query.tool.spec.ts`

**Arquivos a modificar:**
- `libraries/nestjs-libraries/src/chat/tools/tool.list.ts`
- `libraries/nestjs-libraries/src/chat/load.tools.service.ts` (menciona a tool no system prompt)

**Implementacao:**

```typescript
@Injectable()
export class KnowledgeQueryTool implements AgentToolInterface {
  constructor(private _knowledgeService: KnowledgeService) {}
  name = 'knowledgeBaseQuery';

  run() {
    return createTool({
      id: 'knowledgeBaseQuery',
      description: `Search the profile's knowledge base for relevant information
        (products, brand guidelines, FAQ, technical docs, etc.).
        Use this tool BEFORE generating content when the user mentions specific
        products, facts, or domain-specific information that may be in uploaded documents.`,
      inputSchema: z.object({
        query: z.string().describe('Search query in natural language'),
        topK: z.number().min(1).max(10).default(5),
      }),
      outputSchema: z.object({
        results: z.array(z.object({
          text: z.string(),
          score: z.number(),
          documentName: z.string(),
        })),
      }),
      execute: async (args, options) => {
        const { context, runtimeContext } = args;
        checkAuth(args, options);

        if (process.env.ENABLE_KNOWLEDGE_BASE === 'false') {
          return { results: [] };
        }

        const profileId = runtimeContext.get('profileId' as never) as string;
        if (!profileId) return { results: [] };

        const results = await this._knowledgeService.queryRelevantChunks(
          profileId,
          context.query,
          context.topK,
        );

        return { results };
      },
    });
  }
}
```

**Registrar em `tool.list.ts`:**
```typescript
import { KnowledgeQueryTool } from '@gitroom/nestjs-libraries/chat/tools/knowledge.query.tool';

export const toolList = [
  // ... tools existentes ...
  KnowledgeQueryTool,
];
```

**Atualizar system prompt** (`load.tools.service.ts`) - adicionar regra:
```
- Before generating content that mentions specific products, prices, technical details,
  or brand-specific facts, use the 'knowledgeBaseQuery' tool to fetch accurate
  information from the profile's knowledge base.
- If the knowledge base has no relevant results, say so and ask the user to
  clarify or provide the information.
```

**Testes:**
- Tool chamada com query valida retorna resultados
- Tool retorna array vazio se profileId ausente
- Tool retorna array vazio se ENABLE_KNOWLEDGE_BASE=false
- topK > 10 -> validacao zod rejeita (max 10)
- Query string vazia -> array vazio

**Criterio de conclusao:**
- [x] Agente usa a tool quando usuario pergunta sobre produtos
- [x] Tool testada isoladamente
- [x] Build passa
- [x] Teste de integracao: uploadar PDF, perguntar ao agente sobre produto -> agente retorna info correta

**Edge cases:**
- Nenhum documento na KB -> results: []
- Query em idioma diferente do documento -> buscar mesmo assim (embedding e multilingual)
- PgVector desconectado -> log erro, retornar array vazio (nao travar conversa)
- Resultados com score muito baixo (< 0.5) -> filtrar ou avisar agente
  "Low confidence results"

---

### Onda 11 - UI de Knowledge Base

**Objetivo**: interface para upload/gerenciamento de documentos.

**Arquivos a criar:**
- `apps/frontend/src/components/settings/profile-knowledge.settings.component.tsx`
- `apps/frontend/src/components/settings/profile-knowledge.hooks.ts`

**Arquivos a modificar:**
- `apps/frontend/src/components/layout/settings.component.tsx`
- Traducoes PT e EN

**Estrutura:**

```
ProfileKnowledgeSettingsSection
├── Banner se ENABLE_KNOWLEDGE_BASE=false: "Disponivel apenas na versao com pgvector"
├── Dropdown "Selecione o perfil" (nao-default)
├── Dropzone upload (PDF/TXT, max 10MB)
├── Tabela de documentos:
│   | Nome | Tamanho | Chunks | Status | Data | Acoes |
├── Botao "Reindex" em documentos FAILED
└── Botao "Delete" com confirmacao
```

**Upload**: usar `FormData` com fetch nativo:
```typescript
const formData = new FormData();
formData.append('file', file);
await fetch(`/settings/profiles/${profileId}/knowledge/upload`, {
  method: 'POST',
  body: formData,
});
```

**Polling**: documentos com status=PROCESSING precisam de polling (SWR refreshInterval=2000
enquanto tiver algum PROCESSING). Parar polling quando todos terminarem.

**Nova tab:** adicionar em `settings.component.tsx` apos `ai_persona`:
```typescript
if (user?.role !== 'USER') {
  arr.push({ tab: 'knowledge_base', label: t('knowledge_base_title', 'Knowledge Base') });
}
```

**Testes:**
- Upload valido chama API e mostra novo item com status PROCESSING
- Polling atualiza status para READY
- Delete remove linha da tabela
- Drag-and-drop funciona
- Arquivo grande mostra erro amigavel

**Criterio de conclusao:**
- [x] Upload funciona end-to-end
- [x] Status atualiza em tempo real (polling)
- [x] Traducoes PT/EN
- [x] Build frontend passa
- [x] Lint passa

**Edge cases:**
- Upload interrompido (tab fechada) -> backend termina processamento normalmente
- Multiple uploads simultaneos -> backend processa em serie (ou em paralelo com limite)
- Status FAILED -> mostrar errorMessage em tooltip
- KB desabilitado -> mostrar banner, esconder upload


---

### Onda 12 - Documentacao e Changelog

**Objetivo**: documentar a feature para usuarios e desenvolvedores.

**Arquivos a criar:**
- `docs/architecture/profile-ai-persona.md`
- `docs/architecture/knowledge-base-rag.md`

**Arquivos a modificar:**
- `CHANGELOG.md` - adicionar entradas na secao `[Unreleased]`
- `CLAUDE.md` - adicionar secao sobre Persona e KB com path dos arquivos principais
- `docs/operations/` - atualizar guia de migracao para usuarios (trocar imagem postgres)

**Conteudo do CHANGELOG.md `[Unreleased]`:**
```markdown
### Adicionado
- Configuracao de persona de IA por perfil (tom de voz, CTAs, restricoes, estilo de imagem)
- Base de conhecimento por perfil com upload de PDFs e busca semantica via RAG
- Imagem Docker do PostgreSQL atualizada para pgvector/pgvector:pg17

### Alterado
- Agente de IA agora considera a persona configurada do perfil ao gerar conteudo
- Geracao de imagens respeita o estilo configurado na persona (realista/ilustrado/etc)
- Generator de posts respeita tom de voz, CTAs e restricoes da persona
```

**Guia de migracao para usuarios existentes:**

```markdown
## Atualizacao para v{proxima-versao}

### Breaking changes: nenhum

### Migracao obrigatoria

1. Parar o stack: `docker compose down`
2. Atualizar a imagem no `docker-compose.yaml`:
   - Trocar `postgres:17-alpine` por `pgvector/pgvector:pg17`
3. Subir novamente: `docker compose pull && docker compose up -d`
4. Os dados ficam intactos (volume postgres-volume preservado)
5. A extensao pgvector e habilitada automaticamente no startup

### Configuracao opcional

Por padrao a Knowledge Base vem habilitada. Para desabilitar:
```
ENABLE_KNOWLEDGE_BASE="false"
```

Com KB desabilitada, a persona continua funcionando. Util se:
- Voce nao quer usar pgvector
- Voce esta usando um managed postgres sem a extensao
```

**Criterio de conclusao:**
- [x] CHANGELOG atualizado
- [x] docs/architecture criado
- [x] CLAUDE.md atualizado com nova secao
- [x] Guia de migracao escrito

---

## 7. Checklist de Edge Cases Globais

### 7.1 Multi-tenancy e isolamento

- [ ] Persona de um profile nao vaza para outro profile (teste explicito)
- [ ] Knowledge Base indexName e derivado do profileId (nao colidem)
- [ ] Query vectorial filtra por metadata.profileId como defesa em profundidade
- [ ] Deletar profile faz cascade delete de Persona e KnowledgeDocuments
- [ ] Deletar organization faz cascade delete de todos os profiles

### 7.2 Degradacao graciosa

- [ ] pgvector nao instalado -> KB desabilita, app continua
- [ ] OpenAI API down -> embedding retorna erro claro, status=FAILED
- [ ] DB connection pool exaurido -> timeout com mensagem amigavel
- [ ] ENABLE_KNOWLEDGE_BASE=false -> tools/endpoints/UI escondidos uniformemente
- [ ] Persona nao configurada -> system prompt identico ao comportamento atual

### 7.3 Performance e limites

- [ ] Prompt do agente: persona adiciona max ~1200 tokens
- [ ] Arquivo max: 10MB, max 5000 chunks por documento
- [ ] examplePosts truncado a 5 items
- [ ] Rate limit no upload: max 10 docs por perfil (soft limit)
- [ ] topK default 5 (max 10) para nao poluir contexto do agente

### 7.4 Seguranca

- [ ] Uploads validados por mime type E magic bytes (nao apenas extensao)
- [ ] Path traversal em filename -> sanitizar antes de salvar
- [ ] Persona fields com `${}`, backticks, `<script>` nao quebram prompt
- [ ] Apenas usuarios com role ADMIN podem editar persona e KB
- [ ] DELETE idempotente (nao vaza existencia via status code)

### 7.5 Experiencia do usuario

- [ ] Upload mostra progress visual
- [ ] Status PROCESSING atualiza em polling sem reload
- [ ] Toast de sucesso/erro em todas operacoes
- [ ] Textos longos em textarea com scroll, nao estouram layout
- [ ] Dropdown de perfil lembra ultimo selecionado (localStorage opcional)

### 7.6 Migracao e rollback

- [ ] Subir versao nova: `prisma db push` cria tabelas automaticamente
- [ ] Voltar para versao anterior: tabelas ficam (nao ha harm), client Prisma antigo ignora
- [ ] Voltar imagem postgres para alpine: KB falha mas Persona continua
- [ ] Dados de Persona nunca sao perdidos em updates subsequentes

## 8. Ordem de entrega sugerida

### Release 1 (Persona apenas - zero breaking change)
- Onda 1, 2, 3, 4, 5, 6
- **Entrega**: usuarios podem configurar persona por perfil
- **Risco**: minimo - apenas campos novos, prompts adicionais

### Release 2 (Knowledge Base)
- Onda 7, 8, 9, 10, 11
- **Entrega**: usuarios podem uploadar PDFs e o agente consulta
- **Risco**: requer troca de imagem postgres (documentado)

### Release 3 (Polish)
- Onda 12
- Revisao geral, cache se necessario, working memory avancada

## 9. Metricas de sucesso

- 80%+ dos perfis nao-default tem Persona configurada apos 30 dias
- Qualidade percebida do conteudo gerado (pesquisa com usuarios)
- Numero de posts criados via copilot com KB ativa > 20% do total
- 0 vazamentos de dados entre perfis (auditoria de logs)
- Latencia do agente: +10% no P95 aceitavel

## 10. Duvidas em aberto

Antes de implementar, confirmar com o usuario:

1. **Persistencia de embedding model**: usar sempre `text-embedding-3-small` (1536 dims)
   ou permitir escolha do modelo (nunca mudar apos criar indice)?
2. **Chunking strategy**: usar recursive size=512/overlap=50 ou expor para usuario configurar?
3. **Persona para profile default**: **permitir** (proposto) ou **bloquear**?
4. **Limite de documentos por perfil**: 10 soft limit ou sem limite?
5. **RAG em outros idiomas**: PDFs em pt-BR - algum teste especial?
6. **Usage dashboard**: adicionar contador de queries KB por perfil no `/settings/ai-credits/summary`?

## 11. Arquivos criticos para consultar durante implementacao

| Arquivo | Por que |
|---|---|
| `libraries/nestjs-libraries/src/database/prisma/schema.prisma:1004-1036` | Modelo Profile existente |
| `libraries/nestjs-libraries/src/database/prisma/profiles/profile.repository.ts` | Padrao de repository |
| `libraries/nestjs-libraries/src/database/prisma/profiles/profile.service.ts` | Padrao de service com HttpException |
| `apps/backend/src/api/routes/settings.controller.ts:136-175` | Padrao de endpoints ADMIN por profileId |
| `libraries/nestjs-libraries/src/dtos/settings/update.ai-credits.dto.ts` | Padrao de DTO com class-validator |
| `libraries/nestjs-libraries/src/chat/load.tools.service.ts:43-103` | Agent config e instructions |
| `libraries/nestjs-libraries/src/chat/tools/generate.image.tool.ts` | Padrao de tool Mastra |
| `libraries/nestjs-libraries/src/chat/tools/tool.list.ts` | Registrar nova tool |
| `apps/backend/src/api/routes/copilot.controller.ts:62-110` | RuntimeContext injection |
| `libraries/nestjs-libraries/src/agent/agent.graph.service.ts` | Generator pipeline |
| `apps/frontend/src/components/settings/ai-credits.settings.component.tsx` | Padrao visual de UI de settings |
| `apps/frontend/src/components/layout/settings.component.tsx:91-124` | Adicao de tabs |
| `libraries/nestjs-libraries/src/chat/mastra.service.ts` | Singleton Mastra |
| `libraries/nestjs-libraries/src/chat/mastra.store.ts` | PostgresStore + PgVector |
| `docker-compose.yaml:203-219` | Servico postgres (ja atualizado) |
| `package.json:19` | Script pm2-run que roda prisma-db-push |
| `CLAUDE.md` | Regras do projeto (Controller>>Service>>Repository, SWR hooks, useT, etc) |

