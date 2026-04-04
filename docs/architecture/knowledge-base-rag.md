# Knowledge Base (RAG) por Perfil

Sistema de base de conhecimento vetorial por perfil. Permite aos clientes
fazer upload de PDFs, TXTs e MDs para que o agente de IA consulte fatos
reais antes de gerar posts.

## Stack

- **pgvector** — extensao Postgres para vetores (imagem `pgvector/pgvector:pg17`)
- **@mastra/pg PgVector** — wrapper TypeScript
- **@mastra/rag MDocument** — chunking recursive
- **OpenAI text-embedding-3-small** (1536 dim) via `embedMany` do pacote `ai`
- **pdf-parse** para extracao de PDFs

## Feature flag

```env
ENABLE_KNOWLEDGE_BASE="true"  # default quando nao definido
```

Quando `false`, tudo degrada: UI esconde, tool retorna vazio, endpoints 403.

## Modelo

`ProfileKnowledgeDocument` rastreia estado do upload:

| Campo | Tipo |
|---|---|
| id | uuid |
| profileId | FK (cascade) |
| filename, mimeType, sizeBytes | metadata |
| status | PROCESSING / READY / FAILED |
| chunkCount | int |
| errorMessage | text nullable |

## Isolamento por perfil

Cada perfil tem um **index proprio** no PgVector:

```
kb_<profileIdSemHifens>
```

Adicionalmente, cada chunk tem `metadata.profileId` e a tool filtra por ele
na query. Dupla protecao contra vazamento entre clientes.

## Pipeline de ingestao

```
upload → criar registro PROCESSING → extrair texto →
  MDocument.fromText + chunk recursive (512/50) →
  embedMany (OpenAI) → pgVector.upsert → READY
```

Erros marcam documento como FAILED com errorMessage. Processamento roda
em background (fire-and-forget) apos retornar 200 para o usuario.

## Tool do agente

`knowledgeBaseQuery` e registrado em `tool.list.ts`. System prompt do
agente instrui: "Before writing any post that references specific
products, prices, features or factual claims about the brand, ALWAYS
call 'knowledgeBaseQuery' first".

Retorna top-K chunks mais similares ao query, filtrados pelo
`profileId` do runtimeContext.

## API

```
GET    /settings/profiles/:id/knowledge                       → lista docs + flag enabled
POST   /settings/profiles/:id/knowledge/upload (multipart)    → envia arquivo (10MB max)
DELETE /settings/profiles/:id/knowledge/:documentId           → remove doc + chunks
POST   /settings/profiles/:id/knowledge/:documentId/reindex   → forca re-indexacao
```

Todos ADMIN only. 403 se KB desabilitada, 404 se perfil/doc nao pertence a org,
413 se arquivo > 10MB, 400 se mime type nao suportado.

## Migracao

A troca da imagem Postgres (de `postgres:17-alpine` para
`pgvector/pgvector:pg17`) e compativel — o data dir e o mesmo. Usuarios
precisam:

1. `docker compose pull` (baixa nova imagem)
2. `docker compose down && docker compose up -d`

A extensao `CREATE EXTENSION IF NOT EXISTS vector` roda automaticamente
no startup via `VectorInitService.onModuleInit()`. Tabelas do Prisma
sao criadas por `prisma db push` no boot.

## Arquivos

- Init: `libraries/nestjs-libraries/src/chat/vector/vector.init.service.ts`
- Store: `libraries/nestjs-libraries/src/chat/mastra.store.ts`
- Service: `libraries/nestjs-libraries/src/database/prisma/knowledge/knowledge.service.ts`
- Tool: `libraries/nestjs-libraries/src/chat/tools/knowledge.query.tool.ts`
- UI: `apps/frontend/src/components/settings/knowledge-base.settings.component.tsx`
