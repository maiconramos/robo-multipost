import { MCP_AGENT_INSTRUCTIONS } from './agent.operating.instructions';

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
  return `# Robô SanPost — Guia de Agente

Voc? opera uma inst?ncia **self-hosted do Rob? SanPost** (agendador de redes
sociais, fork do Postiz com automa??es de coment?rio "flows"). Este guia re?ne a refer?ncia operacional; os schemas da conex?o MCP e o Swagger descrevem as op??es atuais.

- **Backend (API):** \`${base}\`
- **Documentação interativa (Swagger):** \`${base}/docs\`

## Autenticação

Na REST, cada chamada usa o header \`Authorization: <CHAVE>\`. A chave vem de
\`Configurações > Integrações\` na interface e pode ser:
- **chave da organização** — acesso a todos os perfis;
- **chave de perfil** — escopo apenas àquele perfil. É uma opção de isolamento, não um requisito para operar clientes com a chave da organização.

> A chave é secreta — NUNCA a coloque em URLs ou logs. Receba-a por variável de
> ambiente / config do agente.

## Dois modos de uso (escolha conforme seu agente)

### Modo A — MCP (se o seu agente fala Model Context Protocol)
O servidor MCP é servido por este backend e **se autodescreve** (o agente descobre
as ferramentas sozinho, incluindo as de automação). Você só precisa da URL + chave.

- **Endpoint (header auth, recomendado):** \`${base}/mcp\` com header \`Authorization: Bearer <CHAVE>\`
- **Endpoint (compatibilidade, chave na URL):** \`${base}/mcp/<CHAVE>\`

Exemplo (Claude Code): \`claude mcp add multipost --transport http --header "Authorization: Bearer <CHAVE>" "${base}/mcp"\`

### Descoberta e seleção do cliente

${MCP_AGENT_INSTRUCTIONS}

### Ferramentas principais

- Descoberta: \`getAccountContextTool\`, \`integrationList\`, \`integrationSchema\`.
- Posts: \`listPostsTool\`, \`getPostTool\`, \`getPostOptionsTool\`, \`integrationSchedulePostTool\`, \`updatePostTool\`, \`managePostScheduleTool\`.
- Mídia: \`mediaListTool\`, \`uploadMediaTool\`, \`uploadMediaFromUrlTool\`, \`beginMediaUploadTool\`, \`appendMediaUploadTool\`, \`completeMediaUploadTool\`, \`getMediaUploadTool\`, \`abortMediaUploadTool\`.
- Geração: \`generateImageTool\`, \`generateVideoOptions\`, \`generateVideoTool\`.
- Automações: \`getAutomationOptionsTool\`, \`createCommentAutomationTool\`, \`getCommentAutomationTool\`, \`updateCommentAutomationTool\`, \`setCommentAutomationStatusTool\`, além de canvas, aliases e histórico disponíveis no catálogo.
- Conhecimento e consultas: \`knowledgeBaseQuery\`, \`webSearchTool\`, \`getAnalyticsTool\`, \`listNotificationsTool\`.

Não instale CLI nem crie outra chave quando a conexão MCP da organização já está disponível.

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
(Se o pacote estiver publicado, instale com \`npm install -g @robo-multipost/agent\`; ou rode do repo com
\`node apps/cli/bin/multipost.js …\`. Saída sempre JSON.)

## Conceitos

- **Perfil** (\`profileId\`): espaço dentro da org (ex.: "Default", "Honda"). Cada canal pertence a um.
- **Canal / integração** (\`integrationId\`): conta conectada (Instagram, Facebook…).
- **Post**: publicação \`now\` (imediata), \`schedule\` (agendada) ou \`draft\` (rascunho).
- **Flow**: automação de comentário no Instagram (palavra-chave → resposta pública e/ou DM).

## Automações e origem das publicações

Consulte \`getAutomationOptionsTool\` para capacidades do canal e gatilho antes
de criar uma regra de Instagram, Facebook ou Messenger. Use os schemas atuais.

- Para uma publicação agendada no SanPost, use \`postMode: scheduled\` e o
  \`scheduledPostId\` interno retornado pelo agendamento, por destino. Crie uma
  automação separada para cada destino; não misture agendamentos com a próxima publicação.
- \`next_publication\` é para a próxima publicação daquele canal quando essa é a
  intenção explícita; \`specific\` é para publicações existentes.
- \`all\` abrange todas as publicações quando solicitado. Messenger usa o modo
  e as condições indicadas pelo catálogo do gatilho.
- Use \`getPostTool\` para detalhes de um post e leia \`releaseId\` quando precisar
  do ID da rede. ID interno de agendamento não é ID de mídia da Meta.

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
| POST | \`/posts\` | \`{type, date, shortLink, republish?, tags, posts:[{integration:{id}, value:[{content, image?}], settings}]}\` |
| DELETE | \`/posts/:id\` | — |
| DELETE | \`/posts/group/:group\` | — |
| GET | \`/posts/:id/missing\` | conteúdo faltante |
| PUT | \`/posts/:id/release-id\` | \`{releaseId}\` |
| GET | \`/find-slot/:id\` | próximo horário livre do canal |

Ao editar um post já publicado, use \`type: "update"\` para alterar sem publicar
novamente. \`type: "schedule"\` ou \`type: "now"\` só republica quando o payload
traz o opt-in explícito \`republish: true\` (booleano real, não texto).

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

## Fluxo CLI / REST (sem conexão MCP)

1. Validar: \`is-connected\`.
2. (chave de org) \`profiles\` → escolher perfil.
3. \`integrations\` → pegar o \`id\` do canal.
4. \`posts\` (POST) → publicar/agendar.
5. (opcional) Configurar a automação com o modo correspondente à origem, consultando capacidades e schema; no MCP, reaproveitar o perfil escolhido por chamada.

Respeite a autorização do usuário para conteúdo, data, canal e automação.
Pergunte apenas pelos dados ou decisões que estiverem faltando; autorização já
fornecida não exige nova confirmação.

## Boas práticas
- Parseie o JSON de resposta; no MCP, leia o código estável e a orientação segura de erro.
- \`customer\` não substitui \`profileId\`. No CLI, não invente flags: use apenas as documentadas; para operações multicliente com a chave geral, o MCP fornece seleção explícita em todos os recursos de cliente.
- Nunca invente ids — descubra via \`integrations\`/\`profiles\`.
- Datas em ISO 8601 UTC. \`dmButtonUrl\` deve ser https pública.
- Para schema completo e exemplos copiáveis, use o Swagger em \`${base}/docs\`.
`;
}
