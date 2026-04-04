# Persona de IA por Perfil

Cada perfil (cliente) pode ter uma persona propria que orienta como o agente
de IA escreve. A persona e injetada automaticamente:

- No **agente Mastra** (chat CopilotKit)
- No **Generator LangGraph** (`/posts/generator`)
- No prompt do **DALL-E 3** (tool `generateImageTool`)

## Modelo

`ProfilePersona` (1:1 com `Profile`, cascade delete):

| Campo | Tipo | Uso |
|---|---|---|
| brandDescription | text | Contexto da marca |
| toneOfVoice | text | Tom (amigavel, tecnico, etc) |
| writingInstructions | text | Regras extras |
| preferredCtas | text[] | CTAs para rotacionar |
| contentRestrictions | text | Regras negativas (never) |
| imageStyle | text | Prefixo do prompt de imagem |
| targetAudience | text | Publico-alvo |
| examplePosts | text[] (max 5) | Referencia de estilo |

## API

Todos ADMIN only:

```
GET    /settings/profiles/:profileId/persona
PUT    /settings/profiles/:profileId/persona
DELETE /settings/profiles/:profileId/persona
```

## Fluxo no agente Mastra

1. `CopilotController.agent()` chama `ProfileService.getPersonaForAgent(profileId)`.
2. Persona serializada em JSON e colocada em `runtimeContext.persona`.
3. `LoadToolsService.instructions` le o runtimeContext, parseia e chama
   `renderPersonaPrompt()` para formatar o bloco.
4. Bloco e concatenado ao system prompt.
5. `GenerateImageTool` ler `persona.imageStyle` e prefixa no prompt DALL-E.

## Fluxo no Generator

`AgentGraphService.start()` carrega persona via `loadPersona(profileId)` e
passa no initial state. Nos `generateHook`, `generateContent` e
`generatePictures` a persona influencia tom, CTAs, restricoes e estilo visual.

## Injection safety

`renderPersonaPrompt` escapa backticks, `${...}` e tags `<script>` para que
um campo de persona malicioso nao quebre o system prompt enclosing.

## Arquivos

- Schema: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
- Service: `libraries/nestjs-libraries/src/database/prisma/profiles/profile.service.ts`
- Helper: `libraries/nestjs-libraries/src/chat/helpers/persona.prompt.ts`
- UI: `apps/frontend/src/components/settings/profile-persona.settings.component.tsx`
