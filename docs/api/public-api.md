# API Pública do Robô MultiPost (referência para n8n / integrações)

Referência geral da API pública — autenticação, canais, posts, upload, analytics e mais. Para **automações de comentário do Instagram**, veja [`public-flows-api.md`](public-flows-api.md).

---

## Autenticação

Header **`Authorization`** com a chave de API (valor **cru, sem `Bearer`**). Pegue em **Configurações > Integrações** (chave de organização = todos os perfis; chave de perfil = só o próprio).

```
Authorization: SUA_CHAVE_DE_API
```

`401` chave ausente/inválida · `403` chave de perfil tentando outro perfil.

## Swagger interativo

`/docs` no domínio do backend (ex.: `https://SEU_BACKEND/docs`). Clique em **Authorize**, cole a chave, e use **Try it out**. Os endpoints públicos ficam sob `/public/v1` (a UI mostra sem o prefixo `/api`).

---

## Endpoints (tag **Public API**)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/public/v1/profiles` | Listar perfis (id, name, isDefault) |
| `GET` | `/public/v1/integrations` | Listar canais conectados (use `id` como `integrationId`) |
| `GET` | `/public/v1/find-slot/:id` | Próximo horário livre para agendar |
| `POST` | `/public/v1/upload` | Upload de arquivo (multipart, campo `file`) |
| `POST` | `/public/v1/upload-from-url` | Upload de mídia a partir de uma URL |
| `GET` | `/public/v1/posts` | Listar posts (`startDate`/`endDate`) |
| `POST` | `/public/v1/posts` | Criar / agendar / rascunho de post |
| `DELETE` | `/public/v1/posts/:id` | Excluir um post |
| `GET` | `/public/v1/analytics/:integration` | Analytics de um canal (`?date=` dias) |
| `GET` | `/public/v1/analytics/post/:postId` | Analytics de um post |
| `POST` | `/public/v1/generate-video` | Gerar vídeo (IA) |
| `GET` | `/public/v1/notifications` | Listar notificações |

> Automações: `POST/GET/PUT/DELETE /public/v1/flows` — ver [`public-flows-api.md`](public-flows-api.md).

---

## Fluxo típico no n8n (publicar com imagem)

1. **Descobrir o canal:** `GET /public/v1/integrations` → copie o `id` do canal desejado.
2. **Subir a imagem:** `POST /public/v1/upload-from-url` com `{ "url": "https://.../imagem.jpg" }` → retorna `{ id, path }`.
3. **Criar o post:** `POST /public/v1/posts` usando o `path` da imagem e o `id` do canal (ver abaixo).
4. (Opcional) **Automação:** `POST /public/v1/flows` para responder comentários com DM.

---

## `POST /public/v1/posts` — corpo

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `type` | `now` \| `schedule` \| `draft` | ✅ | Publicar agora, agendar ou rascunho |
| `date` | string ISO 8601 | ✅ | Quando publicar (use uma data futura para `schedule`) |
| `shortLink` | boolean | ✅ | Encurtar links do post |
| `tags` | `{value,label}[]` | ✅ | Tags (pode ser `[]`) |
| `posts` | `Post[]` (≥1) | ✅ | Um item por canal |

**`posts[]` (Post):**
| Campo | Tipo | Notas |
|---|---|---|
| `integration.id` | string | `integrationId` do canal (de `GET /integrations`) |
| `value` | `{content, image[]}[]` | Variantes de conteúdo (texto + mídias) |
| `settings.__type` | string | Identificador do provider (`instagram`, `x`, `facebook`, …). Obrigatório se `type !== 'draft'` |
| `group` | string | Opcional (agrupa posts) |

**`value[].image[]` (MediaDto):** `{ id, path }` — `path` é a URL da mídia (de `POST /upload`).

### Exemplo — publicar agora com imagem
```json
{
  "type": "now",
  "date": "2026-06-10T14:30:00Z",
  "shortLink": false,
  "tags": [],
  "posts": [
    {
      "integration": { "id": "SEU_INTEGRATION_ID" },
      "value": [
        {
          "content": "Meu post de teste 🚀",
          "image": [{ "id": "media-1", "path": "https://seu-cdn.com/imagem.jpg" }]
        }
      ],
      "settings": { "__type": "instagram" }
    }
  ]
}
```

### Exemplo — rascunho (sem `settings`)
```json
{ "type": "draft", "date": "2026-06-15T09:00:00Z", "shortLink": false, "tags": [],
  "posts": [{ "integration": { "id": "SEU_INTEGRATION_ID" }, "value": [{ "content": "Rascunho ✍️", "image": [] }] }] }
```

> No Swagger, o `POST /posts` traz esses exemplos prontos no dropdown do "Example Value" (Try it out).

---

## Upload, analytics e outros

- **`POST /upload`** (multipart): campo `file`. Retorna `{ id, path }`.
- **`POST /upload-from-url`**: `{ "url": "https://seu-cdn.com/imagem.jpg" }` (https público). Retorna `{ id, path }`.
- **`GET /analytics/:integration?date=30`**: estatísticas do canal nos últimos N dias.
- **`GET /analytics/post/:postId?date=7`**: estatísticas de um post.
- **`GET /posts?startDate=...&endDate=...`**: lista posts no intervalo (ISO 8601).
- **`POST /generate-video`**: `{ "type": "...", "output": "vertical" | "horizontal", "customParams": {...} }`.

---

## Referências

- [`public-flows-api.md`](public-flows-api.md) — automações de comentário (Flows).
- Swagger: `/docs` (tags **Public API** e **Automações (Flows)**).
