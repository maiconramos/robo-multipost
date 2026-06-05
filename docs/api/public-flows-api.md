# API Pública — Automações de Comentário do Instagram (Flows)

Referência completa da API pública para criar e gerenciar **automações de comentário/story do Instagram** programaticamente (n8n, scripts, integrações). Permite o cenário ponta a ponta: **gerar imagem → publicar no Instagram → criar a automação** ("comentou `EU QUERO` → recebe o link no direct").

> Mesma funcionalidade existe via **SDK `@postiz/node`** e via **MCP** (agente de chat). Veja o fim deste documento.

---

## 1. Autenticação

Todos os endpoints exigem o header **`Authorization`** com sua chave de API (valor **cru, sem `Bearer`**).

- Pegue a chave em **Configurações > Integrações**:
  - **Chave da organização** — acesso a todos os perfis.
  - **Chave do perfil** — escopada apenas àquele perfil.

```
Authorization: SUA_CHAVE_DE_API
```

| Erro | Significado |
|---|---|
| `401` | Header `Authorization` ausente ou chave inválida |
| `403` | Chave de **perfil** tentando operar em outro `profileId` |

---

## 2. Swagger interativo

A documentação interativa fica em **`/docs`** (no domínio do **backend**):

- Local/dev: `http://localhost:3000/docs`
- Self-hosted: `https://SEU_BACKEND/docs`

Para **testar pelo Swagger**: clique em **Authorize** (canto superior direito), cole sua chave de API e confirme. Depois use o **Try it out** em qualquer endpoint. O Swagger envia o header `Authorization` automaticamente.

> O `/docs` mostra os caminhos **sem** o prefixo `/api` (o backend monta as rotas na raiz; o `/api` é adicionado por proxy/nginx quando existe).

---

## 3. Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/public/v1/flows` | Criar automação |
| `GET` | `/public/v1/flows` | Listar (filtro opcional `?integrationId=`) |
| `GET` | `/public/v1/flows/:id` | Detalhar (com nós/arestas) |
| `PUT` | `/public/v1/flows/:id` | Editar (mesmo contrato da criação) |
| `POST` | `/public/v1/flows/:id/status` | Ativar / pausar / arquivar |
| `DELETE` | `/public/v1/flows/:id` | Excluir |

**Query param comum:** `?profileId=<id>` — escopa a um perfil (apenas chave de org). Omitido → **perfil Default**. (Chave de perfil ignora/valida contra o próprio perfil.)

---

## 4. Referência completa do corpo (`POST` e `PUT`)

### Obrigatórios
| Campo | Tipo | Notas |
|---|---|---|
| `name` | string (≤200) | Nome da automação (identificação na UI) |
| `integrationId` | string (≤64) | ID do canal **Instagram** (de `GET /public/v1/integrations`) |

### Gatilho
| Campo | Valores | Default | Notas |
|---|---|---|---|
| `triggerType` | `comment_on_post` \| `story_reply` | `comment_on_post` | Comentário em post ou resposta a story |
| `postMode` | `all` \| `specific` \| `next_publication` | `next_publication` | Veja [§5](#5-modos-de-vínculo-postmode) |
| `postIds` | string[] (≤100, cada ≤64) | — | **Obrigatório** se `postMode=specific` + `comment_on_post`. IDs de mídia do IG |
| `storyIds` | string[] (≤100) | — | **Obrigatório** se `postMode=specific` + `story_reply` |

### Casamento de palavra-chave
| Campo | Valores | Default | Notas |
|---|---|---|---|
| `keywords` | string[] (≤50, cada ≤100) | — | **Vazio/omitido = casa qualquer comentário** |
| `matchMode` | `any` \| `all` \| `exact` | `any` | `any`=≥1 keyword · `all`=todas · `exact`=comentário inteiro igual |
| `matchReactions` | boolean | `true` (story) | Só `story_reply`: dispara também em reações (emoji) |

### Resposta pública (só `comment_on_post`)
| Campo | Tipo | Notas |
|---|---|---|
| `replyMessage` | string (≤2200) | Resposta pública ao comentário |
| `replyMessages` | string[] (≤10, cada ≤2200) | Variações (escolhe 1) — alternativa ao `replyMessage` |

### Direct (DM)
| Campo | Tipo | Notas |
|---|---|---|
| `dmMessage` | string (≤2000) | Texto da DM ao autor do comentário |
| `dmButtonText` | string (≤80) | Texto do botão da DM (necessário com `dmButtonUrl`) |
| `dmButtonUrl` | string (≤2048) | **URL https pública** (bloqueia http, localhost, IPs privados, `javascript:`/`data:`/`file:`) |

### Follow-gate (exigir seguir antes do link)
| Campo | Tipo | Notas |
|---|---|---|
| `requireFollow` | boolean (default `false`) | Liga o follow-gate |
| `followGateMessage` | string (≤2000) | Mensagem quando ainda não segue |
| `openingDmMessage` | string (≤2000) | DM inicial com botão postback (só `comment_on_post` + `requireFollow`) |
| `openingDmButtonText` | string (≤80) | Texto do botão da DM inicial |
| `alreadyFollowedButtonText` | string (≤80) | Botão "já sigo" |
| `gateExhaustedMessage` | string (≤2000) | Mensagem ao esgotar tentativas |
| `maxGateAttempts` | int 1–10 (default 3) | Tentativas do gate |

### `POST /flows/:id/status` — corpo
```json
{ "status": "ACTIVE" | "PAUSED" | "ARCHIVED" | "DRAFT" }
```

### Códigos de erro
`400` validação · `401` chave ausente/inválida · `403` chave de perfil pedindo outro `profileId` · `412` integração não-Instagram / desativada / inexistente.

---

## 5. Modos de vínculo (`postMode`)

| Modo | Quando usar | Detalhe |
|---|---|---|
| **`next_publication`** ⭐ | Encadear "criar automação → publicar o post" | Nasce sem post vinculado; ao publicar o próximo post no canal, vincula **automaticamente** a ele. **Não precisa do media id.** |
| **`specific`** | Você já tem o(s) post(s) publicado(s) | Exige `postIds` (ou `storyIds`). Use quando souber os IDs de mídia. |
| **`all`** | Vale para qualquer post do canal | Dispara em comentários de **todos** os posts. Use com cuidado (pode disparar em massa). |

> **Recomendado:** `next_publication` para fluxos automatizados (gerar imagem → publicar → criar automação), pois evita ter que descobrir o media id do Instagram. ⚠️ Ele vincula ao **próximo** post publicado no canal — crie a automação **imediatamente antes** de agendar/publicar o post para garantir o vínculo 1:1.

---

## 6. Boas práticas (o que é melhor)

- **`keywords` específicas:** prefira palavras-chave claras (ex.: `["EU QUERO"]`) em vez de deixar vazio. Vazio casa **qualquer** comentário e pode gerar DMs indesejadas.
- **`matchMode`:** use `any` na maioria dos casos. `exact` só quando quiser exigir o comentário idêntico à keyword.
- **Sempre `https` no `dmButtonUrl`:** links http, `localhost` ou IPs privados são bloqueados. Use o link público final (ex.: post do blog).
- **`replyMessage` + `dmMessage` juntos:** responda publicamente ("Te mandei no direct!") **e** mande o link na DM — converte melhor e sinaliza ao algoritmo.
- **Follow-gate (`requireFollow`):** ótimo para crescer seguidores, mas adiciona fricção. Sempre defina `followGateMessage` clara ("Siga o perfil e comente de novo 😉").
- **Escopo de perfil:** com **chave de org**, passe `?profileId=<id>` para a automação aparecer no perfil certo da UI; sem isso vai para o **Default**. Com **chave de perfil**, já cai no perfil dela.
- **Idempotência no n8n:** ao reprocessar um workflow, evite criar a mesma automação duas vezes (não há deduplicação por nome). Liste antes (`GET /flows`) se precisar.

---

## 7. Exemplos

### Comentário → DM com link (encadeável)
```bash
curl -X POST https://SEU_BACKEND/public/v1/flows \
  -H "Authorization: SUA_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "Receita - link no DM",
    "integrationId": "cmnykixkn0001q46kd9mxe2sn",
    "triggerType": "comment_on_post",
    "postMode": "next_publication",
    "keywords": ["EU QUERO"],
    "matchMode": "any",
    "replyMessage": "Te mandei no direct! 💬",
    "dmMessage": "Aqui está a receita 👇",
    "dmButtonText": "Ver receita",
    "dmButtonUrl": "https://seu-blog.com/bolo"
  }'
```

### Post específico
```json
{ "name": "Promo", "integrationId": "...", "postMode": "specific",
  "postIds": ["17999999999"], "keywords": ["QUERO"],
  "dmMessage": "Segue o link 👇", "dmButtonText": "Acessar", "dmButtonUrl": "https://..." }
```

### Com follow-gate
```json
{ "name": "Ebook", "integrationId": "...", "postMode": "next_publication",
  "keywords": ["QUERO"], "requireFollow": true,
  "followGateMessage": "Siga o perfil e comente de novo 😉",
  "dmMessage": "Valeu por seguir! Aqui 👇", "dmButtonText": "Baixar", "dmButtonUrl": "https://..." }
```

### n8n (HTTP Request node)
- **Method** `POST` · **URL** `https://SEU_BACKEND/public/v1/flows`
- **Headers:** `Authorization` = sua chave · `Content-Type` = `application/json`
- **Body:** JSON (igual aos exemplos acima)

---

## 8. ⚠️ Pré-requisito para o disparo real (webhook da Meta)

Criar a automação (status `ACTIVE`) **não** garante que ela dispara. Para o fluxo real (comentou → reply + DM) funcionar, o **webhook do Instagram precisa estar configurado no Meta Developer Portal**:

- Objeto `instagram`, campos `comments` e `messages` assinados.
- Callback URL + verify token corretos — obtenha em `GET /flows/webhook-config` (API interna) ou em Configurações.

Se o log do backend mostrar `checkIntegrationWebhook ... Could not verify webhook`, a criação é permitida (não-bloqueante), mas você **precisa** verificar a config do webhook na Meta.

---

## 9. SDK e MCP

- **SDK `@postiz/node`:** `createFlow`, `listFlows`, `getFlow`, `updateFlow`, `setFlowStatus`, `deleteFlow`.
- **MCP (agente de chat / n8n MCP):** ferramentas `createCommentAutomationTool`, `listCommentAutomationsTool`, `setCommentAutomationStatusTool`. O agente confirma a configuração com o usuário antes de criar.

---

## Referências

- [`docs/architecture/instagram-automations.md`](../architecture/instagram-automations.md) — engine de automações, webhook, follow-gate, credenciais (visão interna).
- Swagger interativo: `/docs` (tag **Automações (Flows)**).
