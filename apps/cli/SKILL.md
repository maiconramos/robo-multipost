# Robô MultiPost — Skill de Agente

Você controla uma instância **self-hosted do Robô MultiPost** (agendador de redes
sociais) através da CLI `multipost`. Cada comando é executado no shell e devolve
**JSON no stdout**; em erro, devolve JSON no stderr e sai com código 1.

## Configuração (variáveis de ambiente)

Antes de usar, estas variáveis precisam estar definidas:

- `MULTIPOST_API_KEY` (ou `POSTIZ_API_KEY`) — a chave de API. Pode ser a chave da
  organização (acesso a todos os perfis) ou de um perfil (escopo só daquele perfil).
- `MULTIPOST_API_URL` (ou `POSTIZ_API_URL`) — a URL do backend, ex.:
  `https://localmultipostapi.seu-dominio.com.br`

Valide a configuração com: `multipost is-connected`

## Conceitos

- **Perfil**: um espaço dentro da organização (ex.: "Default", "Honda"). Cada canal
  pertence a um perfil. Se a chave for de um perfil, tudo já fica escopado a ele.
- **Canal / integração**: uma conta conectada (Instagram, Facebook, etc.). Use o
  `id` do canal ao criar posts e automações.
- **Post**: publicação agendada (ou rascunho/imediata).
- **Flow (automação de comentário)**: quando alguém comenta uma palavra-chave num
  post do Instagram, o sistema responde e/ou manda um link no direct. **Exclusivo
  do Robô MultiPost** (o Postiz padrão não tem).

## Fluxo recomendado

1. `multipost profiles:list` — descubra os perfis (se usar chave de org).
2. `multipost integrations:list` — pegue o `id` do canal desejado.
3. `multipost posts:create ...` — agende/publique o post.
4. (Opcional) `multipost flows:create ...` — crie a automação de comentário.

Sempre confirme com o usuário os detalhes (texto, data, canal) antes de criar.

## Comandos

### Descoberta
```bash
multipost is-connected
multipost profiles:list
multipost integrations:list                 # ou: --profileId <id>
```

### Posts
```bash
# Simples (1 post de texto):
multipost posts:create --content "<p>Olá!</p>" --integrationId <ID> --type now
multipost posts:create --content "<p>Agendado</p>" --integrationId <ID> --date 2026-06-10T14:00:00.000Z --type schedule

# Avançado (corpo completo — múltiplas mídias/threads/settings; veja Swagger em <API_URL>/docs):
multipost posts:create --json '{"type":"now","date":"...","shortLink":false,"tags":[],"posts":[{"integration":{"id":"<ID>"},"value":[{"content":"<p>...</p>"}],"settings":{}}]}'

multipost posts:list --startDate 2026-06-01T00:00:00.000Z --endDate 2026-06-30T23:59:59.999Z
multipost posts:delete --id <POST_ID>
```
O `content` é **HTML** (tags: `p`, `br`, `strong`, `u`, `a`, `ul`, `li`, `h1`-`h3`).
Cada linha visual é um `<p>`; para linha em branco entre parágrafos use `<p></p>`.

### Flows (automações de comentário — Instagram)
```bash
multipost flows:list                        # ou: --integrationId <id>
multipost flows:get --id <FLOW_ID>
multipost flows:status --id <FLOW_ID> --status PAUSED   # ACTIVE|PAUSED|ARCHIVED|DRAFT
multipost flows:delete --id <FLOW_ID>

multipost flows:create --json '{
  "name": "Receita - link no DM",
  "integrationId": "<ID_DO_CANAL_INSTAGRAM>",
  "triggerType": "comment_on_post",
  "postMode": "next_publication",
  "keywords": ["EU QUERO"],
  "replyMessage": "Te mandei no direct! 💬",
  "dmMessage": "Aqui está o link 👇",
  "dmButtonText": "Quero o link",
  "dmButtonUrl": "https://exemplo.com/receita"
}'
```

**Campos do `flows:create` / `flows:update` (JSON):**
- `name` (obrigatório) — nome para identificar na interface.
- `integrationId` (obrigatório) — canal Instagram.
- `triggerType` — `comment_on_post` (padrão) ou `story_reply`.
- `postMode` — `next_publication` (padrão: liga ao **próximo** post publicado),
  `all` (qualquer post do canal) ou `specific` (usa `postIds`/`storyIds`).
- `postIds` / `storyIds` — arrays de ids (só com `postMode: specific`).
- `keywords` — palavras-chave que disparam (ex.: `["EU QUERO"]`).
- `matchMode` — como casar a palavra (ex.: contém/exato).
- `replyMessage` / `replyMessages` — resposta pública ao comentário.
- `dmMessage`, `dmButtonText`, `dmButtonUrl` — o direct enviado (a URL deve ser
  `https` pública).
- `requireFollow` + `followGateMessage`, `openingDmMessage`,
  `openingDmButtonText`, `alreadyFollowedButtonText`, `gateExhaustedMessage`,
  `maxGateAttempts` — "follow-gate" (exigir seguir antes de liberar o link).

> Dica: para montar o corpo do post ou ver todos os campos/limites, abra o Swagger
> interativo em `<API_URL>/docs`.

### Mídia
```bash
multipost upload:url --url https://exemplo.com/imagem.jpg
multipost upload:file --file ./foto.jpg
```
Use o `id`/`path` retornado em `posts:create` (campo `image[].path`). Aceita só
tipos de imagem/vídeo permitidos (SVG/HTML são rejeitados por segurança).

### Analytics
```bash
multipost analytics --integration <ID> --days 7   # 7, 30 ou 90 dias
```

## Regras importantes
- A saída é JSON — parseie a saída para extrair `id`, `path`, etc.
- Nunca invente ids: descubra com `integrations:list` / `profiles:list`.
- A `dmButtonUrl` de um flow precisa ser `https` pública.
- Confirme a configuração do flow (gatilho, palavras, resposta, link) com o usuário
  antes de `flows:create`.
