/**
 * Gera o guia/skill de agente (markdown) servido em `GET /public/agent-skill`,
 * com a URL do backend já injetada. É a "fonte de verdade" comprehensiva que
 * um agente (Hermes, OpenClaw, Claude, etc.) lê para operar esta instância.
 *
 * Cobre os DOIS modos: MCP (agentes que falam MCP) e CLI/REST (agentes de shell).
 *
 * Manutenção: ao adicionar/alterar endpoint da API pública (`/public/v1/*`),
 * atualize também este template (regra de paridade — ver apps/cli/CLAUDE.md).
 */
export function buildAgentSkillMarkdown(apiUrl: string): string {
  const base = (apiUrl || '').replace(/\/+$/, '');
  return `# Robô MultiPost — Guia de Agente

Você opera uma instância **self-hosted do Robô MultiPost** (agendador de redes
sociais, fork do Postiz com automações de comentário "flows"). Este documento é a
referência completa para um agente de IA controlar esta instância.

- **Backend (API):** \`${base}\`
- **Documentação interativa (Swagger):** \`${base}/docs\`

## Autenticação

Toda chamada usa o header \`Authorization: <CHAVE>\`. A chave vem de
\`Configurações > Integrações\` na interface e pode ser:
- **chave da organização** — acesso a todos os perfis;
- **chave de perfil** — escopo apenas àquele perfil (recomendado para isolar um cliente).

> A chave é secreta — NUNCA a coloque em URLs ou logs. Receba-a por variável de
> ambiente / config do agente.

## Dois modos de uso (escolha conforme seu agente)

### Modo A — MCP (se o seu agente fala Model Context Protocol)
O servidor MCP é servido por este backend e **se autodescreve** (o agente descobre
as ferramentas sozinho, incluindo as de automação). Você só precisa da URL + chave.

- **Endpoint (header auth, recomendado):** \`${base}/mcp\` com header \`Authorization: Bearer <CHAVE>\`
- **Endpoint (chave na URL):** \`${base}/mcp/<CHAVE>\`

Exemplo (Claude Code): \`claude mcp add multipost --transport http --header "Authorization: Bearer <CHAVE>" "${base}/mcp"\`

**Ferramentas MCP disponíveis:** \`integrationList\`, \`integrationSchema\`,
\`schedulePostTool\`, \`generateImage\`, \`generateVideoOptions\`/\`generateVideo\`,
\`webSearchTool\`, \`extractUrlsTool\`, \`knowledgeBaseQuery\`,
\`createCommentAutomationTool\`, \`listCommentAutomationsTool\`,
\`setCommentAutomationStatusTool\`. Use uma chave de perfil para escopar tudo a ele.

### Modo B — CLI / REST (agentes que rodam shell)
Use o CLI \`@robo-multipost/agent\` (binário \`multipost\`) ou chame a REST direto.

CLI:
\`\`\`bash
export MULTIPOST_API_KEY="<CHAVE>"
export MULTIPOST_API_URL="${base}"
multipost is-connected
multipost integrations:list
multipost posts:create --content "<p>Olá!</p>" --integrationId <ID> --type now
\`\`\`
(Instale com \`npm install -g @robo-multipost/agent\`, ou rode do repo com
\`node apps/cli/bin/multipost.js …\`. Saída sempre JSON.)

## Conceitos

- **Perfil** (\`profileId\`): espaço dentro da org (ex.: "Default", "Honda"). Cada canal pertence a um.
- **Canal / integração** (\`integrationId\`): conta conectada (Instagram, Facebook…).
- **Post**: publicação \`now\` (imediata), \`schedule\` (agendada) ou \`draft\` (rascunho).
- **Flow**: automação de comentário no Instagram (palavra-chave → resposta pública e/ou DM).

## ⭐ Regra de ouro dos flows: \`next_publication\` vs \`specific\`

- **\`next_publication\` (PADRÃO — use quase sempre):** crie o flow **sem** id de
  mídia; o sistema o vincula sozinho ao **próximo post publicado** no canal. Fluxo:
  criar flow → publicar post. **Sem polling, sem media id.**
- **\`specific\` (só para posts que JÁ existem):** vincula via \`postIds\`/\`storyIds\`
  (IG media id). Use apenas para uma publicação antiga.

> ⚠️ Não tente "publicar e descobrir o media id por polling" para usar \`specific\` —
> é frágil e desnecessário (a API NÃO tem \`GET /posts/{id}\`). Esse é o caso do
> \`next_publication\`. Para um post antigo, liste com \`GET /public/v1/posts?startDate&endDate\`
> e leia \`releaseId\` (= IG media id) dos itens com \`state: PUBLISHED\`.

## Referência da REST API (\`/public/v1\`)

Todas exigem \`Authorization: <CHAVE>\`. Base: \`${base}/public/v1\`.

### Descoberta
| Método | Caminho | Descrição |
|---|---|---|
| GET | \`/is-connected\` | valida a chave (\`{connected:true}\`) |
| GET | \`/profiles\` | lista perfis (chave de org: todos; de perfil: só o próprio) |
| GET | \`/integrations\` \`[?profileId]\` | lista canais conectados |
| GET | \`/integration-settings/:id\` | regras/limites/ferramentas do canal |

### Posts
| Método | Caminho | Corpo / Query |
|---|---|---|
| GET | \`/posts\` | **query obrigatória** \`?startDate&endDate\` (ISO 8601) \`[&customer]\` |
| POST | \`/posts\` | \`{type, date, shortLink, tags, posts:[{integration:{id}, value:[{content, image?}], settings}]}\` |
| DELETE | \`/posts/:id\` | — |
| DELETE | \`/posts/group/:group\` | — |
| GET | \`/posts/:id/missing\` | conteúdo faltante |
| PUT | \`/posts/:id/release-id\` | \`{releaseId}\` |
| GET | \`/find-slot/:id\` | próximo horário livre do canal |

\`content\` é HTML (tags: \`p, br, strong, u, a, ul, li, h1-h3\`); use \`<p></p>\` vazio
para linha em branco entre parágrafos.

#### Settings por canal
O \`settings\` de cada post carrega opções do provider (\`settings.__type\` =
identificador, ex. \`"instagram"\`).
- **Capa de Reels (Instagram):** \`settings.cover = {id, path}\` de uma imagem
  enviada por \`/upload\` (o \`path\`, URL pública, é enviado como \`cover_url\` à Meta).
  Só vale para **Reels** (vídeo \`.mp4\` único, não story); em foto/carrossel/story é
  ignorado. \`cover\` exige \`id\` **e** \`path\` válidos — senão a API responde 400.
- **Tipo (Instagram):** \`settings.post_type\` = \`"post"\` (feed/Reels) ou \`"story"\`.

### Mídia
| Método | Caminho | Corpo |
|---|---|---|
| POST | \`/upload\` | \`multipart/form-data\` campo \`file\` |
| POST | \`/upload-from-url\` | \`{url}\` |

Retornam \`{id, path}\` — use \`path\` em \`posts[].value[].image[].path\`. Só aceita
imagem/vídeo permitidos (SVG/HTML rejeitados por segurança).

### Flows (automações de comentário — Instagram)
| Método | Caminho | Corpo / Query |
|---|---|---|
| GET | \`/flows\` \`[?integrationId]\` | lista automações |
| POST | \`/flows\` | ver schema abaixo |
| GET | \`/flows/:id\` | detalhe |
| PUT | \`/flows/:id\` | mesmo schema |
| POST | \`/flows/:id/status\` | \`{status: ACTIVE|PAUSED|ARCHIVED|DRAFT}\` |
| DELETE | \`/flows/:id\` | — |

**Schema do flow:** \`name\`* , \`integrationId\`* , \`triggerType\` (\`comment_on_post\`|\`story_reply\`),
\`postMode\` (\`next_publication\`|\`all\`|\`specific\`), \`postIds\`/\`storyIds\` (só \`specific\`),
\`keywords\` (ex. \`["EU QUERO"]\`), \`matchMode\`, \`matchReactions\`,
\`replyMessage\`/\`replyMessages\`, \`dmMessage\`, \`dmButtonText\`, \`dmButtonUrl\` (https público),
e follow-gate: \`requireFollow\`, \`followGateMessage\`, \`openingDmMessage\`,
\`openingDmButtonText\`, \`alreadyFollowedButtonText\`, \`gateExhaustedMessage\`, \`maxGateAttempts\`.

### Analytics e mais
| Método | Caminho | Query |
|---|---|---|
| GET | \`/analytics/:integration\` | \`?date=7\` (nº de **dias**: 7/30/90) |
| GET | \`/analytics/post/:postId\` | \`?date=7\` |
| GET | \`/notifications\` | \`?page\` |
| POST | \`/integration-trigger/:id\` | \`{methodName, data}\` (ações específicas do provider) |
| GET | \`/social/:integration\` | \`?refresh\` — gera URL de OAuth p/ conectar canal |

## Fluxo recomendado

1. Validar: \`is-connected\`.
2. (chave de org) \`profiles\` → escolher perfil.
3. \`integrations\` → pegar o \`id\` do canal.
4. \`posts\` (POST) → publicar/agendar.
5. (opcional) \`flows\` (POST, \`next_publication\`) → automação; depois publique o post.

**Sempre confirme com o usuário** os detalhes (texto, data, canal e — em flows —
gatilho, palavras, resposta, link) antes de criar.

## Boas práticas
- Parseie o JSON de resposta; em erro HTTP, leia a mensagem.
- Nunca invente ids — descubra via \`integrations\`/\`profiles\`.
- Datas em ISO 8601 UTC. \`dmButtonUrl\` deve ser https pública.
- Para schema completo e exemplos copiáveis, use o Swagger em \`${base}/docs\`.
`;
}
