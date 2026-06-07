# Robô MultiPost — Skill de Agente

Você controla uma instância **self-hosted do Robô MultiPost** (agendador de redes
sociais, fork do Postiz) pela CLI `multipost`. Cada comando roda no shell e devolve
**JSON no stdout**. Em erro, devolve JSON no stderr (`{"ok":false,"error":...}`) e
sai com código 1 — então sempre cheque o exit code e parseie a saída.

## 1. Configuração (variáveis de ambiente)

- `MULTIPOST_API_KEY` (ou `POSTIZ_API_KEY`) — chave de API. **Org** (acesso a todos
  os perfis) ou **perfil** (escopo só daquele perfil). Pegue em `Configurações > Integrações`.
- `MULTIPOST_API_URL` (ou `POSTIZ_API_URL`) — URL do backend, ex.
  `https://localmultipostapi.seu-dominio.com.br`.

Comece sempre validando: `multipost is-connected` → `{ "connected": true }`.

## 2. Conceitos

- **Perfil**: espaço dentro da organização (ex.: "Default", "Honda"). Cada canal
  pertence a um perfil. Com uma chave de perfil, tudo já fica escopado a ele.
- **Canal / integração** (`integrationId`): conta conectada (Instagram, Facebook…).
- **Post**: publicação (agendada, imediata `now`, ou `draft`).
- **Flow (automação de comentário)**: alguém comenta uma palavra-chave num post do
  Instagram → o sistema responde e/ou manda um link no direct. **Exclusivo do
  MultiPost.**

## 3. Fluxo recomendado

1. `multipost is-connected` — valida config.
2. `multipost profiles:list` — (se chave de org) descubra os perfis.
3. `multipost integrations:list` — pegue o `id` do canal.
4. `multipost posts:create …` — agende/publique.
5. (Opcional) `multipost flows:create …` — automação de comentário.

**Sempre confirme com o usuário** os detalhes (texto, data, canal, e — em flows — o
gatilho, palavras-chave, resposta e link) **antes** de criar.

## 4. ⭐ Regra de ouro dos flows: `next_publication` vs `specific`

Para vincular uma automação a um post, há dois caminhos. **Prefira `next_publication`.**

- **`postMode: next_publication` (PADRÃO — use quase sempre):** crie o flow **sem**
  saber o id de mídia. Ele fica "pendente" e o sistema o **vincula sozinho** ao
  **próximo post publicado** naquele canal (e ainda faz *lazy bind* no primeiro
  comentário). Fluxo ideal: `flows:create` (next_publication) → `posts:create`. **Sem
  polling, sem media id.**
- **`postMode: specific` (só para posts que JÁ existem):** vincula a posts/stories
  específicos via `postIds`/`storyIds` (o **IG media id**). Use apenas quando a
  automação é para uma publicação **antiga/já existente**.

> ⚠️ **Não tente "publicar agora e descobrir o media id por polling" para usar
> `specific`.** Isso é frágil (a API pública NÃO tem `GET /posts/{id}`; o `state`
> só vira `PUBLISHED` de forma assíncrona) e desnecessário — é exatamente o caso do
> `next_publication`. Polling só faz sentido se você precisa do media id de um post
> antigo: liste com `posts:list --startDate --endDate` e leia `releaseId` (= IG media
> id) dos itens com `state: PUBLISHED`.

## 5. Comandos

### Descoberta
```bash
multipost is-connected
multipost profiles:list                       # [{id, name, isDefault, hasApiKey}]
multipost integrations:list                   # [{id, name, identifier, picture, disabled, ...}]
multipost integrations:list --profileId <ID>  # (só com chave de org)
```

### Posts
`content` é **HTML**. Tags: `p, br, strong, u, a, ul, li, h1, h2, h3`. Cada linha
visual é um `<p>`; para **linha em branco** entre parágrafos, use `<p></p>` vazio.
```bash
# Simples (1 post de texto):
multipost posts:create --content "<p>Olá!</p>" --integrationId <ID> --type now
multipost posts:create --content "<p>Agendado</p>" --integrationId <ID> \
  --date 2026-06-10T14:00:00.000Z --type schedule
multipost posts:create --content "<p>Rascunho</p>" --integrationId <ID> --type draft

# Avançado (corpo completo — múltiplas mídias, thread, settings por plataforma):
multipost posts:create --json '{
  "type":"now","date":"2026-06-10T14:00:00.000Z","shortLink":false,"tags":[],
  "posts":[{"integration":{"id":"<ID>"},
            "value":[{"content":"<p>Texto</p>","image":[{"path":"<URL_OU_PATH>"}]}],
            "settings":{}}]
}'

multipost posts:list --startDate 2026-06-01T00:00:00.000Z --endDate 2026-06-30T23:59:59.999Z
multipost posts:delete --id <POST_ID>
```
> `posts:list` **exige** `--startDate` e `--endDate` (ISO 8601). A lista traz
> `releaseId` e `state` de cada post.

### Mídia
```bash
multipost upload:url --url https://exemplo.com/imagem.jpg   # {id, path}
multipost upload:file --file ./foto.jpg                     # {id, path}
```
Use o `path` retornado em `posts:create` (campo `image[].path`). Só aceita
imagem/vídeo permitidos (SVG/HTML são rejeitados por segurança).

### Flows (automações de comentário — Instagram)
```bash
multipost flows:list                          # ou --integrationId <ID>
multipost flows:get --id <FLOW_ID>
multipost flows:status --id <FLOW_ID> --status PAUSED   # ACTIVE|PAUSED|ARCHIVED|DRAFT
multipost flows:delete --id <FLOW_ID>

# Caso comum (publicar post novo + automação) — use next_publication:
multipost flows:create --json '{
  "name": "Receita - link no DM",
  "integrationId": "<ID_DO_CANAL_INSTAGRAM>",
  "triggerType": "comment_on_post",
  "postMode": "next_publication",
  "keywords": ["EU QUERO"],
  "replyMessage": "Te respondi no direct! 💬",
  "dmMessage": "Aqui está o link 👇",
  "dmButtonText": "Quero o link",
  "dmButtonUrl": "https://exemplo.com/receita"
}'
# depois: multipost posts:create ... --integrationId <MESMO_ID> --type now
```

**Campos de `flows:create` / `flows:update` (JSON):**

| Campo | Obrig.? | Descrição |
|---|---|---|
| `name` | sim | Nome para identificar na interface (≤200). |
| `integrationId` | sim | Canal Instagram (`integrations:list`). |
| `triggerType` | não | `comment_on_post` (padrão) ou `story_reply`. |
| `postMode` | não | `next_publication` (padrão), `all`, ou `specific`. |
| `postIds` / `storyIds` | só em `specific` | IG media ids dos posts/stories alvo. |
| `keywords` | não | Palavras que disparam, ex. `["EU QUERO"]`. |
| `matchMode` | não | Como casar a palavra (contém/exato). |
| `matchReactions` | não | (bool) também disparar por reações. |
| `replyMessage` / `replyMessages` | não | Resposta pública ao comentário. |
| `dmMessage`, `dmButtonText`, `dmButtonUrl` | não | Direct enviado. `dmButtonUrl` deve ser **https pública**. |
| `requireFollow` + `followGateMessage`, `openingDmMessage`, `openingDmButtonText`, `alreadyFollowedButtonText`, `gateExhaustedMessage`, `maxGateAttempts` | não | "Follow-gate": exigir seguir antes de liberar o link. |

### Analytics
```bash
multipost analytics --integration <ID> --days 7    # 7, 30 ou 90 (dias para trás)
```
> `--days` é **número de dias**, não data. Pode vir vazio se o canal não tiver
> analytics ou o token tiver expirado.

## 6. Boas práticas para o agente

- Sempre parseie o JSON de saída; em erro (exit 1), leia `error` e `response`.
- Nunca invente ids — descubra com `integrations:list` / `profiles:list`.
- Para o schema completo e exemplos copiáveis de qualquer endpoint, abra o **Swagger
  interativo** em `<API_URL>/docs`.
- Datas em ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ss.SSSZ`).
- HTML do post deve refletir visualmente o que foi mostrado ao usuário (use `<p></p>`
  vazio para linhas em branco).

## 7. Mantenedor: mantenha esta skill em sincronia

Esta skill é a "fonte de verdade" que o agente lê. **Sempre que a API pública
(`/public/v1/*`) ganhar/alterar endpoints, parâmetros ou enums, atualize:**
1. o CLI (`apps/cli/bin/multipost.js`) — novo comando/flag;
2. este `SKILL.md` — documentação do agente;
3. (se aplicável) o `README.md` e o Swagger dos controllers.

Veja a regra de paridade em [`apps/cli/CLAUDE.md`](./CLAUDE.md).
