# Design — Correção do MCP + Novas Tools (upload por URL, automações)

**Data:** 2026-05-31
**Repo:** fork de `maiconramos/robo-multipost` (base Postiz/Gitroom)
**Branch:** `feat/mcp-context-fix-and-tools`

## Problema

Ao chamar as tools do MCP **diretamente** (como o Claude Code / Claude.ai fazem,
fora do agente `ask_postiz`), todas falham:

- `integrationList`, `integrationSchema`, `integrationSchedulePostTool`,
  `integrationTrigger` → `Cannot read properties of undefined (reading 'get'/'platform')`.

### Causa raiz

As tools resolvem a organização/profile assim
(ex.: `integration.list.tool.ts`, `integration.schedule.post.ts`):

```ts
checkAuth(input, options);                                   // auth.context.ts
const requestContext = readRequestContext(options);          // tool.context.helper.ts
const organizationId = JSON.parse(requestContext.get('organization') as string).id;
const profileId = (requestContext.get('profileId') as string) || undefined;
```

`checkAuth` (em `auth.context.ts`) só popula o `requestContext` **se
`context.requestContext` existir**:

```ts
const auth = getAuth();
const authInfo = context?.mcp?.extra?.authInfo || auth;
if (authInfo && context?.requestContext) {          // <- FALSO na chamada direta via MCP
  (context.requestContext as any).set('organization', JSON.stringify(authInfo));
  ...
}
```

- **Via agente** (`ask_postiz`): `context.requestContext` existe → funciona.
- **Via MCP direto**: `context.requestContext` é `undefined` → `checkAuth` não guarda
  nada → as tools leem `organization` vazio → crash.

O dado correto **já está disponível** via AsyncLocalStorage: o `start.mcp.ts` chama
`runWithContext({ requestId, auth: org, profileId }, ...)` em **todos** os caminhos
(`/mcp`, `/mcp/:id`, `/mcp-oauth`). Logo `getAuth()` e `getProfileId()`
(`async.storage.ts`) retornam org e profile corretamente nos dois caminhos.

## Componente 1 — Correção do contexto (o desbloqueio)

Trocar, em cada tool, a resolução de org/profile para ler **direto do
AsyncLocalStorage**, eliminando a dependência do frágil `requestContext`:

```ts
import { getAuth, getProfileId } from '@gitroom/nestjs-libraries/chat/async.storage';

execute: async (input: any, options: any) => {
  const org = getAuth<{ id: string }>();
  if (!org?.id) throw new Error('MCP: organizacao ausente no contexto de autenticacao');
  const organizationId = org.id;
  const profileId = getProfileId();
  // ...resto igual
}
```

**Arquivos afetados** (`libraries/nestjs-libraries/src/chat/tools/`):
- `integration.list.tool.ts`
- `integration.validation.tool.ts`
- `integration.schedule.post.ts`
- `integration.trigger.tool.ts`
- *(varrer também `knowledge.query.tool.ts`, `generate.image.tool.ts`,
  `generate.video.tool.ts`, `web-search.tool.ts` — aplicar o mesmo padrão onde usarem
  `readRequestContext`)*

**Verificar também os args de input:** confirmar que `input.platform` /
`input.socialPost` chegam corretos na chamada direta via MCP com a versão do Mastra do
projeto (`@mastra/core`). Se a forma do `input` diferir entre agente e MCP, adicionar um
normalizador único (ex.: `const args = input?.context ?? input;`).

**Compatibilidade:** manter `checkAuth` (não quebra o agente). `getAuth()` funciona nos
dois caminhos, então a leitura direta é segura.

**Critério de aceite:** chamar `integrationList`, `integrationSchema` e
`integrationSchedulePostTool` direto via MCP retorna dados reais (sem o erro de `undefined`).

## Componente 2 — Tool `uploadMediaFromUrl` (nova)

**Por quê:** o `integrationSchedulePostTool` já aceita `attachments` como URLs, mas o
Postiz precisa que a mídia esteja hospedada no storage dele. Hoje não há como, via MCP,
hospedar uma imagem/vídeo a partir de uma URL externa → carrossel/imagens não dá para
agendar de forma autônoma.

**Infra que já existe** (`media.service.ts`): `this.storage.uploadSimple(url)` baixa/hospeda
a URL no storage (R2/local) e devolve o path; `saveFile(orgId, fileName, filePath, originalName?, profileId?)`
registra o `Media`. O `generateImageTool`/`generateAiVideo` já usam esse padrão.

**Novo arquivo:** `libraries/nestjs-libraries/src/chat/tools/upload.media.from.url.tool.ts`
- `inputSchema`: `{ url: string, fileName?: string }`
- `execute`: resolve org via `getAuth()`; chama `storage.uploadSimple(url)` + `saveFile(...)`;
  retorna `{ id, path }` (a URL hospedada no Postiz, pronta para usar como `attachment`).
- Registrar em `tool.list.ts`.

**Critério de aceite:** passar uma URL pública de imagem retorna um `path` do Postiz que,
usado como `attachment` no `integrationSchedulePostTool`, agenda o post com a imagem.

## Componente 3 — Tool de automações (nova)

**Por quê:** a engine de automação (comentário → resposta/DM, story_reply, follow-gate) já
existe (`FlowsService`). Falta poder **criar/gerenciar** essas automações via MCP (Claude).

**Infra que já existe** (`database/prisma/flows/flows.service.ts`):
`getFlows`, `getFlow`, `createFlow`, `quickCreateFlow`, `updateFlow`, `updateFlowStatus`,
`deleteFlow`, `getInstagramPosts`, `handleIncomingComment` (engine), etc.

**Novo(s) arquivo(s):** `libraries/nestjs-libraries/src/chat/tools/automations.tool.ts`
(uma ou poucas tools):
- `listAutomations` → `FlowsService.getFlows(orgId, profileId)`
- `listInstagramPostsForAutomation` → `getInstagramPosts(...)` (para escolher o post alvo)
- `createCommentAutomation` → `quickCreateFlow(...)` (gatilho `comment_on_post` →
  resposta no comentário e/ou DM)
- `setAutomationStatus` → `updateFlowStatus(...)` (ligar/desligar)
- org/profile via `getAuth()`/`getProfileId()`.
- Registrar em `tool.list.ts`.

**Dependência operacional (Trilha B, fora do código):** para as automações *dispararem*,
é preciso configurar credenciais Meta + webhook (ver `_HANDOFF.md` → Trilha B). A tool
*cria* a automação; a config a torna *ativa*. Usar **IG Login (standalone)** evita App Review.

**Critério de aceite:** criar uma automação via MCP aparece na aba "Automações" do Postiz
e (com a config da Trilha B) responde a um comentário de teste.

## Fora de escopo (YAGNI nesta leva)
- Automação de comentários/DM do **Facebook** (verificar suporte depois).
- UI nova no frontend (as tools são backend/MCP).
- Métricas/analytics via MCP.

## Entrega
Ver `_HANDOFF.md` (raiz do repo): fork, build da imagem (GitHub Actions), troca da tag no
stack do Portainer, redeploy, e a Trilha B (config das automações).
