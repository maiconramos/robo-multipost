# Exclusão de mídia em massa (liberação de espaço no bucket)

Documenta o fluxo de exclusão da biblioteca de mídia depois que ela passou a
**remover o arquivo do storage**, e não apenas marcar a linha como excluída.

## Problema que originou a mudança

Antes, `DELETE /media/:id` apenas gravava `deletedAt` na tabela `Media`. O
arquivo continuava no bucket para sempre:

- `CloudflareStorage.removeFile()` existia com o corpo **comentado** (no-op);
- `LocalStorage.removeFile()` recebia um caminho de disco, mas `Media.path`
  guarda a **URL pública** — nenhum chamador conseguia usá-lo corretamente;
- não havia nenhum chamador de `removeFile` em produção.

Ou seja: "apagar mídia" não liberava um único byte, e apagar muitos itens
exigia um clique por item.

## Contrato HTTP

| Rota | Corpo | Resposta |
|---|---|---|
| `DELETE /media/:id` | — | `MediaDeleteResult` |
| `POST /media/delete-many` | `{ ids: string[] }` (1–100, `DeleteMediaDto`) | `MediaDeleteResult` |

```ts
interface MediaDeleteResult {
  deleted: string[];                       // saíram do bucket e do banco
  blocked: {                               // preservadas de propósito
    id: string;
    name: string;
    reason: 'pending_posts' | 'avatar' | 'thumbnail_of_other_media';
    posts: number;                         // posts pendentes que a usam
  }[];
  failed: { id: string; name: string }[];  // storage recusou; linha viva
}
```

> `POST /media/delete-many` é declarado **antes** de `@Post('/:endpoint')` no
> `MediaController` — aquele catch-all do upload multipart do R2 casaria com
> qualquer path de um segmento.

`GET /media` passou a devolver `inUse: boolean` por item, para a grade mostrar
o cadeado **antes** de o usuário selecionar em massa.

## Regras de proteção

Uma mídia é bloqueada quando:

1. **`pending_posts`** — algum post não deletado da org, em `QUEUE`, `DRAFT` ou
   `ERROR`, referencia a mídia. A busca cobre **duas** colunas:
   - `Post.image` — JSON `[{ id, path }]` das mídias do post;
   - `Post.settings` — a **thumbnail do YouTube** é uma mídia da biblioteca
     gravada nas settings do post, não em `image`.

   Post `PUBLISHED` **não** bloqueia: o arquivo já foi enviado à rede social e
   o bucket não é mais a fonte dele.

2. **`avatar`** — a mídia é foto de perfil (`User.pictureId`), logo de agência
   (`SocialMediaAgency.logoId`) ou ícone de app OAuth (`OAuthApp.pictureId`).
   São FKs; a linha sobreviveria, mas a imagem quebraria.

3. **`thumbnail_of_other_media`** — o arquivo é a thumbnail de outra mídia viva.

## Arquivos removidos por mídia

- `Media.path` — o arquivo em si;
- `Media.thumbnail` — a thumbnail gerada no editor é enviada com
  `preventSave=true`, ou seja, **existe no bucket sem linha em `Media`**. Se
  não fosse apagada junto, viraria órfã permanente.

Um arquivo é **preservado** quando outra mídia viva ainda aponta para ele
(`path` duplicado por `/media/save-media` com o mesmo nome, ou o mesmo arquivo
usado como thumbnail de outra mídia). Nesse caso a linha é excluída, mas o
objeto fica. Essa checagem é **bucket-wide, sem filtro de organização**: o
bucket é compartilhado, então um arquivo referenciado por outra org também não
pode ser apagado.

Pela mesma razão, `POST /media/save-media` passou a validar `name` como nome de
arquivo plano (`^[A-Za-z0-9._-]+$`). Ele vira a chave do objeto no bucket; com
barra ou `..` seria possível registrar uma mídia apontando para um objeto
arbitrário — inofensivo enquanto a exclusão era só lógica, destrutivo agora. O
uploader sempre envia nome plano (`item.url.split('/').pop()`).

## Ordem das operações (e por quê)

```
remover arquivo(s) do storage  →  marcar deletedAt
```

Se o storage falhar, a linha **permanece viva** e o item volta em `failed`. O
inverso (marcar primeiro) produziria mídia invisível na UI com o arquivo ainda
ocupando espaço — exatamente o bug que esta entrega corrige.

## `IUploadProvider.removeFile`

Passou a receber a **URL pública** gravada em `Media.path`/`Media.thumbnail`:

- **Cloudflare R2** — deriva a `Key` exigindo o prefixo `CLOUDFLARE_BUCKET_URL`.
  URL de terceiro (import externo, CDN de rede social) vira no-op: nunca
  chutamos uma chave, sob risco de apagar um objeto homônimo.
- **Local** — converte a URL `/uploads/...` em caminho de disco usando o mesmo
  `resolveSafeUploadFile` da rota de leitura, mantendo o confinamento contra
  `..` e symlink para fora de `UPLOAD_DIRECTORY`.

Ambos são idempotentes (arquivo ausente resolve sem erro) e **lançam** em falha
real de credencial/IO.

## Interface

Na tela **Mídia** (modo `standalone`):

- cada card tem checkbox (o card inteiro alterna a seleção);
- item com `inUse` mostra cadeado, fica esmaecido e não é selecionável;
- barra com "Selecionar todos desta página", contador e "Excluir selecionadas";
- confirmação avisa que a remoção do bucket é permanente;
- o resultado vira um toast com apagadas / mantidas / falhas.

No modal de seleção de mídia para o post (`standalone=false`) nada muda: ali o
clique continua servindo para **inserir** mídia no post.

## Efeito colateral corrigido

`getMedia` contava mídia já excluída ao calcular o total de páginas. Depois de
uma exclusão em massa isso geraria páginas vazias; a contagem passou a filtrar
`deletedAt: null`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `apps/backend/src/api/routes/media.controller.ts` | rotas `DELETE /media/:id` e `POST /media/delete-many` |
| `libraries/nestjs-libraries/src/dtos/media/delete.media.dto.ts` | validação do lote (1–100 ids) |
| `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts` | travas, ordem storage→banco, relatório |
| `libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts` | consultas de uso e exclusão em lote |
| `libraries/nestjs-libraries/src/upload/cloudflare.storage.ts` | `DeleteObjectCommand` + derivação da Key |
| `libraries/nestjs-libraries/src/upload/local.storage.ts` | unlink confinado ao `UPLOAD_DIRECTORY` |
| `libraries/nestjs-libraries/src/upload/safe.upload.path.ts` | `extractUploadPathSegments` |
| `apps/frontend/src/components/media/media.component.tsx` | seleção múltipla, cadeado e barra de exclusão |
