# Dossiê: Repost Automático de Stories do Instagram

> Status: **V1 implementado** (beta) — 2026-04-21
> Última atualização: 2026-04-21
> Inspiração: [Repurpose.io](https://repurpose.io), [Repostify](https://repostify.com)

## V1 entregue (resumo)

Arquivos de referência já implementados:

- **Schema**: `RepostRule` + `RepostLog` + enums `RepostSourceType`/`RepostLogStatus`
  em `libraries/nestjs-libraries/src/database/prisma/schema.prisma`.
- **Backend**: `RepostRepository`/`RepostService` em
  `libraries/nestjs-libraries/src/database/prisma/repost/` (registrados no
  `DatabaseModule` global) + `RepostController` em
  `apps/backend/src/api/routes/repost.controller.ts` (registrado em
  `ApiModule` como rota autenticada). Rotas: `GET/POST/PUT/DELETE /repost/rules`,
  `POST /repost/rules/:id/toggle`, `POST /repost/rules/:id/run-now`,
  `GET /repost/rules/:id/logs`, `GET /repost/source-candidates`,
  `GET /repost/destination-candidates`.
- **Orchestrator**: `apps/orchestrator/src/workflows/repost.workflow.ts`
  (loop durable com `sleep(intervalMinutes * 60_000)`) +
  `apps/orchestrator/src/activities/repost.activity.ts`
  (`runRepostCycle` com short-circuit, idempotência e filtros) +
  `workflowId: 'repost-rule-{ruleId}'`.
- **Helper reutilizável**: `resolveIgRoute` extraído de
  `FlowActivity.resolveIgRoute` para
  `libraries/nestjs-libraries/src/integrations/social/instagram-route.resolver.ts`
  — compartilhado entre automações de comentário e repost.
- **Frontend**: hooks SWR em
  `apps/frontend/src/components/automations/hooks/use-repost.ts` (regra
  "1 hook = 1 useSWR" aplicada), `repost-rule-form.component.tsx`,
  `repost-list.component.tsx`, `repost-wizard.component.tsx`,
  `repost-edit.component.tsx` em
  `apps/frontend/src/components/automations/repost/`. Rotas:
  `/automacoes/repost/nova` e `/automacoes/repost/[id]`. O 3º card
  "Repost de Story" foi adicionado a `NovaAutomacaoModal`.
- **i18n**: chaves `repost_*` + `nova_automacao_sidebar_repost*` em
  `pt/translation.json` (com acentos) e `en/translation.json`.

Decisões confirmadas no V1:

- **Destinos**: TikTok (`tiktok`), TikTok via Late (`late-tiktok`),
  YouTube Shorts (`youtube`). Futuro: `late-youtube`, IG Reels, Facebook
  Reels.
- **Fotos**: puladas no V1 com `skippedReason=FILTER_IMAGE`.
- **Polling mínimo**: 5 min; default 15 min; máximo 360 min (6 h).
- **Bootstrap**: ao criar a regra, `lastSourceItemId` é preenchido com o
  maior ID de story ativo — só stories publicados **depois** disso
  entram no repost.

## Contexto e motivação

Permitir que o Robo MultiPost **monitore automaticamente os stories publicados
diretamente no app do Instagram** (ou Creator Studio, Meta Business Suite, etc)
e **reposte** o mesmo conteúdo em outras redes curtas/verticais (TikTok,
YouTube Shorts, e outras no futuro).

A postagem original **não sai do MultiPost** — o usuário continua publicando
no Instagram pelo app como faz hoje. O MultiPost apenas observa, baixa a
mídia do story e republica nos canais destino.

Diferença vs features já documentadas:

| Feature | Canal observado | Ação |
|---|---|---|
| Automações (ManyChat-style) | Comentários/DMs no IG | Responder comentário / enviar DM |
| Autopost | Fontes externas (RSS, N8N) | Gerar post novo |
| **Repost de Stories** (esta proposta) | Stories publicados no IG | Republicar mídia em outras redes |

## Objetivo

Automatizar o ciclo **capturar -> baixar -> redistribuir** de stories do
Instagram para reduzir trabalho manual do criador de conteúdo.

## Não-objetivos (v1)

- Repostar Reels ou posts de feed (**fase futura**)
- Repostar Highlights (destaques)
- Edição de mídia (cortes, legendas queimadas, watermark)
- Reescrita de legenda com IA (pode entrar em v2 via persona do perfil)
- Detecção automática de música licenciada
- Repost de story com foto (v1 só vídeo) — **decisão a confirmar**

## Fases

| Fase | Escopo |
|---|---|
| **v1 (esta proposta)** | IG Story (vídeo) -> TikTok (Late + nativo) + YouTube Shorts |
| v2 | IG Story (foto) -> IG Reel foto / Pinterest / Threads |
| v3 | IG Reel -> TikTok + YouTube Shorts + Facebook Reels |
| v4 | IG Feed -> outras redes / Cross-posting bidirecional |

## Pré-requisitos do usuário

- Conta **Instagram Business** conectada no MultiPost (provider `instagram`
  ou `instagram-standalone`) com scope `instagram_basic`
- Canal(is) de destino já conectado(s) no MultiPost (ex: TikTok, YouTube)
- App Meta em Live Mode (para contas fora de Roles/Testers)

> **Sem variável de ambiente global**. A feature respeita cada perfil: se o
> usuário não quer usar, simplesmente não cria regra de repost. Nenhum
> `ENABLE_*` em `.env`.

## Arquitetura proposta

### Onde vive a feature no produto

Preferência: **integrar no menu "Automações"** como um novo **tipo de
automação** ("Repost de conteúdo"), ao lado dos já existentes "Comentário em
publicação" e "Resposta ao story". Isso:

- Reusa a navegação que o usuário já conhece
- Permite extensão futura (Reels, Feed, etc) como novos sub-tipos
- Reusa o histórico de execuções já implementado

Fallback (se houver conflito estrutural): criar item de menu próprio
chamado **"Repost"** no sidebar principal.

Código existente a reutilizar:
- `apps/frontend/src/components/automations/` — listagem e wizards
- `libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts`
  -> `getRecentStories()` (já implementado)
- `libraries/nestjs-libraries/src/upload/cloudflare.storage.ts`
  -> `uploadSimple(url)` (download + upload para R2)
- `apps/orchestrator/src/workflows/autopost.workflow.ts` — padrão de loop
  com `sleep()` durable

### Fluxo de alto nível

```
[Usuário publica story no app do Instagram]
        |
        v
[Temporal Workflow (loop por regra) ativado]
  | a cada N minutos:
  |   1. Consulta último checkpoint (lastStoryId) da regra
  |   2. Chama GET /{ig-user-id}/stories
  |   3. Filtra stories novos (id > lastStoryId)
  |   4. SE vazio -> sleep, sem custo (short-circuit)
  |   5. SE novo: baixa media_url, salva em Media (R2/local)
  |   6. Para cada destino selecionado:
  |        cria Post QUEUE (publishDate = agora) com a Media
  |        scheduler existente publica no provider
  |   7. Atualiza checkpoint + grava log de execução
  v
[TikTok / YouTube Shorts / ... publicam o video]
```

### Componentes

| Camada | Componente | Arquivo proposto |
|---|---|---|
| Prisma | Models novos | `libraries/nestjs-libraries/src/database/prisma/schema.prisma` |
| Backend | Controller | `apps/backend/src/api/routes/repost.controller.ts` |
| Backend | Service | `libraries/nestjs-libraries/src/database/prisma/repost/repost.service.ts` |
| Backend | Repository | `libraries/nestjs-libraries/src/database/prisma/repost/repost.repository.ts` |
| Orchestrator | Workflow | `apps/orchestrator/src/workflows/repost.workflow.ts` |
| Orchestrator | Activity | `apps/orchestrator/src/activities/repost.activity.ts` |
| Frontend | Tela de regras | `apps/frontend/src/components/automations/repost/` |
| i18n | Chaves pt + en | `libraries/react-shared-libraries/src/translation/locales/{pt,en}/translation.json` |

## Modelo de dados (Prisma)

Para permitir expansão futura (Reels, Feed, outras origens), o modelo é
**genérico** — não amarrado a Instagram Stories.

### `RepostRule`

Representa uma regra de repost configurada pelo usuário.

| Campo | Tipo | Obs |
|---|---|---|
| `id` | uuid | PK |
| `organizationId` | string | FK multi-tenancy |
| `profileId` | string | FK — regra vive dentro de um perfil |
| `name` | string | nome amigável da regra |
| `enabled` | boolean | liga/desliga sem deletar |
| `sourceIntegrationId` | string | FK Integration (canal origem, ex: IG Business) |
| `sourceType` | enum `RepostSourceType` | `INSTAGRAM_STORY` (v1), `INSTAGRAM_REEL`, `INSTAGRAM_FEED`, ... |
| `destinationIntegrationIds` | string[] | IDs de Integration dos destinos |
| `intervalMinutes` | int | intervalo do polling (min 5, default 15) |
| `filterIncludeVideos` | boolean | default true |
| `filterIncludeImages` | boolean | default false (v1) |
| `filterMaxDurationSeconds` | int? | null = sem limite; TikTok/Shorts aplicam próprio limite |
| `captionTemplate` | string? | texto padrão para legenda do repost |
| `lastSourceItemId` | string? | checkpoint: último ID processado |
| `lastRunAt` | datetime? | para UI / telemetria |
| `createdAt` / `updatedAt` | datetime | |

### `RepostLog`

Cada item de mídia descoberto vira um log — chave de idempotência.

| Campo | Tipo | Obs |
|---|---|---|
| `id` | uuid | PK |
| `ruleId` | string | FK `RepostRule` (cascade) |
| `sourceItemId` | string | ex: `igStoryId` |
| `mediaType` | enum `VIDEO` \| `IMAGE` | do item |
| `mediaUrlOriginal` | string | URL Graph API (expira) |
| `storedMediaId` | string? | FK `Media` após download |
| `status` | enum `PENDING` \| `DOWNLOADED` \| `PUBLISHED` \| `PARTIAL` \| `SKIPPED` \| `FAILED` | |
| `skippedReason` | string? | ex: `CLOSE_FRIENDS`, `FILTER_IMAGE`, `DURATION_EXCEEDED` |
| `errorMessage` | string? | stack curta |
| `publishedPosts` | json? | `[{integrationId, postId, releaseUrl}]` |
| `discoveredAt` | datetime | |
| `processedAt` | datetime? | |

**Índices**:
- `(ruleId, sourceItemId)` unique — idempotência absoluta
- `(ruleId, status)` — para UI de histórico

## Fluxo detalhado (Temporal)

### Ciclo de vida do workflow

```
repostWorkflow({ ruleId }):
  enquanto rule.enabled:
    rule = recarrega do DB
    se !rule.enabled -> break
    sourceItems = sourceAdapter(rule.sourceType).list(rule)   // activity
    novos = sourceItems filter id > rule.lastSourceItemId
    se novos.length == 0:
      await sleep(rule.intervalMinutes minutos)
      continue
    para cada item em ordem cronológica (mais antigo primeiro):
      log = criaLog PENDING (ruleId + sourceItemId, unique)
      try:
        media = baixaEArmazena(item.media_url)    // R2/local
        log.storedMediaId = media.id; status = DOWNLOADED
        para cada destId em rule.destinationIntegrationIds:
          post = criaPost QUEUE (media, captionTemplate, publishDate=now)
          acumula em publishedPosts
        log.status = PUBLISHED (ou PARTIAL se algum destino falhou)
      catch erro:
        log.status = FAILED; log.errorMessage = erro
      rule.lastSourceItemId = item.id  (apenas se PUBLISHED/PARTIAL)
      rule.lastRunAt = now
    await sleep(rule.intervalMinutes minutos)
```

**Padrão Temporal reutilizado**: mesmo esquema de
`autoPostWorkflow` — `workflowId` determinístico
(`repost-rule-{ruleId}`), `sleep()` durable, `terminateWorkflow` ao
desativar a regra (`processCron`-style de
`libraries/nestjs-libraries/src/database/prisma/autoposts/autopost.service.ts`).

### Short-circuit (importante)

Na **maioria dos ciclos não haverá conteúdo novo**. O workflow deve:

1. Ler `lastSourceItemId` da regra
2. Chamar `getRecentStories()` (1 request Graph API — barato)
3. Comparar ids — se todos já foram processados, **nenhum download, nenhum
   post, nenhum registro no log** (exceto talvez um `lastRunAt` atualizado)
4. `sleep` e repete

Isso mantém o custo por ciclo em **1 request Graph API por regra ativa**.

### Respeito a rate limits

Limites a considerar ao escolher `intervalMinutes`:

| API | Limite relevante |
|---|---|
| Meta Graph API | ~200 calls/hora por usuário (compartilhado com outras features como webhooks, comentários, refresh) |
| TikTok (direct) | 300 jobs concorrentes; 6 posts/dia por conta em modo sandbox |
| TikTok via Late | quota Late (`checkUsage()` já existe em `late.base.provider.ts`) |
| YouTube Data API | 10000 unidades/dia; upload = ~1600 unidades |

**Recomendações**:
- **Mínimo permitido**: 5 min (já consome 12 requests/hora por regra ativa)
- **Default**: 15 min (4 req/h — sobra larga margem)
- **Telas de UI**: mostrar slider com presets (5 min / 15 min / 30 min / 1h / 2h / 6h)
- Opção futura: **exponential backoff** quando a conta ficar horas sem
  publicar (ex: duplica o intervalo após 6 ciclos vazios, máximo 2h)

### Idempotência

- `workflowId = repost-rule-{ruleId}` — Temporal rejeita iniciar workflow
  duplicado
- Unique constraint `(ruleId, sourceItemId)` no `RepostLog` — se o workflow
  reiniciar e reencontrar a mesma story, a criação de log falha e o item
  é pulado

### Download da mídia

A `media_url` retornada pelo Graph API **expira rápido** (pode ser horas).
O download precisa acontecer no mesmo ciclo em que o item foi descoberto.
Reutilizar `CloudflareStorage.uploadSimple(url)` (ou `LocalStorage`
equivalente) que já faz `fetch` + upload.

O `Media` criado fica associado ao `profileId` da regra e ao
`organizationId`, seguindo o padrão do schema.

### Publicação nos destinos

Criar 1 `Post` por destino, em estado `QUEUE`, apontando para a mesma
`Media`. O scheduler existente (`postWorkflowV102`) roteia para o provider
correto baseado em `integrationId`.

Settings por tipo de destino (ex: TikTok requer `post_type`):
- Para TikTok: usar `DIRECT_POST` padrão
- Para YouTube: `category=shorts`, `privacyStatus=public` (ou do destino)

Marcar no `Post.settings` uma flag `{ isRepost: true, ruleId, sourceItemId }`
para rastreabilidade/analytics.

## API REST proposta

Todos os endpoints sob guarda ADMIN/OWNER/MANAGER do perfil.

```
GET    /repost/rules                        lista regras da org (com filtros por profileId)
GET    /repost/rules/:id                    detalhe de uma regra
POST   /repost/rules                        cria regra
PUT    /repost/rules/:id                    atualiza regra
DELETE /repost/rules/:id                    remove regra (e termina o workflow)
POST   /repost/rules/:id/toggle             liga/desliga (inicia/termina workflow)
POST   /repost/rules/:id/run-now            dispara um ciclo manual (útil para teste)
GET    /repost/rules/:id/logs               paginação de logs de execução
GET    /repost/source-options               lista tipos de origem disponíveis (v1: INSTAGRAM_STORY)
GET    /repost/destination-candidates?sourceType=INSTAGRAM_STORY
                                            lista canais compatíveis conectados
```

O endpoint `/repost/destination-candidates` é chave: ele filtra apenas
canais conectados na conta que são compatíveis com o `sourceType`
escolhido — base para a UI em 2 colunas.

## UI proposta

### Navegação

Em `apps/frontend/src/components/automations/`:
- Listagem de automações ganha um novo card "Repost de conteúdo" ao lado
  de "Comentário em publicação" e "Resposta ao story"
- Wizard de criação abre em layout de 2 colunas

### Wizard "Nova regra de Repost"

Layout de 2 colunas (inspirado em Repurpose.io / Repostify):

```
+-------------------------------------------------------------+
|  POST FROM                    |  POST TO                    |
|  (origem)                     |  (destinos)                 |
|                               |                             |
|  [dropdown: tipo de conteúdo] |  [multi-select: canais]    |
|  [radio: Story | (Reel v3)]   |                             |
|                               |  (apenas canais             |
|  [dropdown: canal IG]         |   conectados + compatíveis) |
|                               |                             |
|  (só canais IG conectados)    |  Ex:                        |
|                               |  [x] TikTok (@user)         |
|                               |  [x] TikTok Late (@user2)   |
|                               |  [x] YouTube Shorts (@chan) |
+-------------------------------------------------------------+

CONFIGURACOES AVANCADAS
- Nome da regra: [texto livre]
- Verificar novos stories a cada: [5min|15min|30min|1h|2h|6h]
- Filtros:
  [x] Repostar vídeos
  [ ] Repostar imagens (em breve)
  - Duração máxima: [slider / "sem limite"]
- Legenda padrão: [textarea com template]
- [Switch] Ativar regra agora
[Salvar] [Cancelar]
```

### Listagem de regras

Tabela com: nome, origem (icone canal + @handle), destinos (icones), status
(Ativa/Pausada), "último ciclo", botao "Rodar agora", menu (editar/excluir).

### Tela de Histórico (por regra)

Tabela de `RepostLog` com: data, sourceItemId (preview thumbnail do story),
mídia baixada (link), destinos publicados (icones com link), status badge,
"ver erro" (se FAILED).

### Traduções (obrigatório)

Todas as strings da UI passam por `useT()`. As chaves em
`locales/pt/translation.json` **devem usar acentos** (padrão do projeto pt-BR
— já existe, por exemplo "Automações", "Escolha um gatilho para sua automação").
As chaves em snake_case: `repost_rule_title`, `repost_post_from`,
`repost_post_to`, `repost_check_every`, `repost_duration_max`, etc.

## Providers de destino compatíveis (v1)

| Destino | Formato esperado | Provider | Caveats |
|---|---|---|---|
| **TikTok (nativo)** | vídeo MP4 9:16 | `tiktok.provider.ts` | `PULL_FROM_URL`; precisa URL pública (R2); duração min/max consultada por `maxVideoLength()` |
| **TikTok (via Late)** | vídeo MP4 9:16 | `late-tiktok.provider.ts` | quota Late; charLimit 2200 |
| **YouTube Shorts** | vídeo 9:16 <= 60s | `youtube.provider.ts` | upload resumable já implementado; título obrigatório (gerar do captionTemplate ou do story) |

Destinos **v2** (não nesta fase):
- Instagram Reels (mesma conta ou conta alternativa — cuidado com
  algoritmo penalizar repost do próprio story)
- Facebook Reels
- Threads (limite menor de duração)
- Pinterest Idea Pin

Destinos **não compatíveis** (v1 não lista no `destination-candidates`):
Twitter/X (prefer imagem+texto), Discord (não é scheduler), LinkedIn (9:16
aceito mas não ideal), Bluesky, Mastodon.

## Edge cases e limitações

### Limitações da Meta Graph API

- **Janela de 24h**: o endpoint `/me/stories` só retorna stories **ativos**.
  Stories expirados não são recuperáveis. **Mitigação**: intervalo default
  <= 60 min e alertas quando o worker Temporal fica down.
- **Sem webhook para stories próprios**: a Meta **não envia webhook** quando
  a própria conta publica um story. Por isso o polling é obrigatório. O
  webhook `reply_to.story` (já usado em automações) e para respostas de
  terceiros, não para a própria publicação.
- **Rate limit global**: ~200 calls/hora por usuário Meta — compartilhado
  com outras features. A regra de 15 min default consome 4 req/h por regra
  ativa, deixando margem.
- **`media_url` expira**: download precisa acontecer **no mesmo ciclo** em
  que o item é descoberto. Se falhar, retry no próximo ciclo pode encontrar
  URL expirada — o log fica FAILED com `errorMessage`.

### Limitações de conteúdo

- **Música licenciada**: stories com música do catálogo IG são baixados com
  o áudio, mas podem ser bloqueados por copyright no TikTok/YouTube. V1:
  apenas **aviso no UI** ("cheque os termos de música antes de ativar"). V2:
  tentar remover áudio ou oferecer opção de mutar.
- **Stickers interativos** (enquetes, countdown, quiz, slider, menções):
  Graph API retorna apenas a mídia renderizada final — os stickers ficam
  como imagem "queimada" no vídeo. Reposts podem ficar estranhos. **Aviso
  no UI**.
- **Stories de close friends**: se o usuário publica em close friends, a
  API pode retornar — documentar comportamento esperado. Sugestão: checar
  campo `is_close_friends` (se exposto) e skippar com
  `skippedReason=CLOSE_FRIENDS`.
- **Carrosséis de story**: o IG retorna cada frame como um item separado
  com próprio `id`. Cada item vira **um repost separado** (ex: carrossel
  de 3 frames = 3 vídeos no TikTok). Ordem preservada pelo `timestamp`.
- **Formato Boomerang / layout / foto**: em v1 com `filterIncludeImages=false`,
  imagens são skipadas com `skippedReason=FILTER_IMAGE`.

### Limitações dos destinos

- **TikTok duração mínima**: 3s (pode variar por conta). Stories curtos
  demais serão rejeitados pelo provider — log FAILED.
- **TikTok duração máxima**: consultada dinamicamente via `maxVideoLength()`.
  Respeitar via filtro `filterMaxDurationSeconds`.
- **YouTube Shorts max 60s**: se story tem mais, skippar com
  `skippedReason=DURATION_EXCEEDED` (ou enviar como vídeo normal — decisão
  futura).
- **Aspect ratio**: stories IG já são 9:16 nativo, compatível com todos os
  destinos listados. Se um dia vier 1:1 ou 4:5 (Reels antigas), pode haver
  problema — validar no download.

### Limitações do sistema

- **Token expirado**: integrar com `refreshTokenWorkflow` existente. Se o
  refresh falhar, a regra **auto-desativa** (`enabled=false`) e notifica
  (toast/email) o owner do perfil. Não fica em loop de erro.
- **Destino desconectado**: se um `destinationIntegrationId` ficar inválido
  (usuário desconectou o canal), o ciclo pula esse destino com log
  `status=PARTIAL` e continua os outros.
- **Multi-regra para a mesma origem**: permitido. Mas `lastSourceItemId`
  é por regra, então o mesmo story pode ser reposicionado 2x se houver 2
  regras ativas na mesma origem — **by design**.
- **Uma regra = um workflow Temporal**. Escalabilidade: N regras ativas =
  N workflows, cada um acordando a cada intervalo. Não é problema até
  centenas de regras por worker.
- **Remoção do story no IG antes do download**: `fetch(media_url)` pode
  voltar 404. Log FAILED com `errorMessage=MEDIA_NOT_FOUND`.
- **Conteúdo sensitivo/flagged**: o MultiPost não faz moderação própria.
  Se o TikTok/YouTube rejeitar, o log fica com erro do provider.

## Compliance

- **Meta ToS**: leitura de stories próprios com `instagram_basic` e
  permitida. Baixar e repostar a **própria mídia** em outras redes não
  viola ToS da Meta. Não há scraping de terceiros.
- **TikTok / YouTube**: a responsabilidade pelo copyright da música e do
  conteúdo é do usuário. Documentar no UI e no termos de uso da feature.
- **AGPL**: por ser fork público (Postiz), toda a feature fica no monorepo
  (sem código proprietário externo).
- **LGPD / GDPR**: `RepostLog.mediaUrlOriginal` pode conter referência ao
  storyId. Ao deletar uma regra, também limpar logs (cascade) e mídias
  órfãs (job periódico de housekeeping — já existe padrão no projeto).

## Observabilidade

### Logs estruturados

Cada ciclo do workflow loga:
- `ruleId`, `profileId`, `organizationId`
- `itemsDiscovered`, `itemsNew`, `itemsPublished`, `itemsFailed`, `itemsSkipped`
- `durationMs`, `apiCalls`

### Métricas (opcional, se Prometheus for adicionado)

- `repost_cycles_total{rule_id, status}`
- `repost_items_total{rule_id, status}`
- `repost_duration_seconds` (histogram)

### UI de histórico

A tela de histórico por regra mostra as métricas agregadas (últimos 7d /
30d) + lista paginada de `RepostLog`.

## Rollout

**Sem feature flag global via `.env`** (decisão explícita do usuário). A
feature respeita cada perfil:

- Se o perfil não tem regra cadastrada -> nada acontece
- Se o perfil tem regra desabilitada -> workflow não existe, custo zero
- Se o perfil tem regra ativa -> workflow Temporal roda

Isso evita que admin tenha que mexer em env e permite que cada cliente
(perfil) adote a feature no próprio ritmo.

Controle implícito de habilitacao: **precisa ter Instagram Business
conectado**. Sem IG conectado, o menu nem mostra o card de
"Repost de conteúdo".

### Estratégia de lançamento sugerida

1. **Beta fechado**: primeiros N perfis selecionados, feedback
2. **Beta aberto**: disponível para todos, badge "Beta" no menu
3. **GA**: remove badge

Não há migration destrutiva — novas tabelas + novos endpoints.

## Arquivos a criar/modificar (referência de implementação futura)

### Prisma
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
  - Models `RepostRule`, `RepostLog`
  - Enums `RepostSourceType`, `RepostLogStatus`

### Backend
- `apps/backend/src/api/routes/repost.controller.ts` — novo
- `libraries/nestjs-libraries/src/database/prisma/repost/repost.service.ts` — novo
- `libraries/nestjs-libraries/src/database/prisma/repost/repost.repository.ts` — novo
- `libraries/nestjs-libraries/src/database/prisma/repost/repost.module.ts` — novo
- DTOs em `libraries/nestjs-libraries/src/dtos/repost/` — novos

### Orchestrator
- `apps/orchestrator/src/workflows/repost.workflow.ts` — novo
- `apps/orchestrator/src/activities/repost.activity.ts` — novo
- Registro em `apps/orchestrator/src/app.module.ts`

### Frontend
- `apps/frontend/src/components/automations/repost/` (pasta nova)
  - `repost.list.component.tsx`
  - `repost.wizard.component.tsx`
  - `repost.history.component.tsx`
  - `repost.rule.form.tsx`
- Integração no card de selecao em
  `apps/frontend/src/components/automations/` (acrescentar 3o tipo)
- Hooks SWR isolados em `repost.hooks.ts` (seguindo regra de 1 hook = 1
  `useSWR`)

### i18n
- `libraries/react-shared-libraries/src/translation/locales/pt/translation.json`
  (COM acentuação)
- `libraries/react-shared-libraries/src/translation/locales/en/translation.json`

### Integrações existentes usadas (não modifica)
- `libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts`
  -> `getRecentStories()`
- `libraries/nestjs-libraries/src/upload/cloudflare.storage.ts`
  -> `uploadSimple()`
- `libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts`
  -> para refresh automático
- `apps/orchestrator/src/workflows/autopost.workflow.ts` — padrão de
  referência
- `libraries/nestjs-libraries/src/database/prisma/autoposts/autopost.service.ts`
  -> padrão `processCron` para start/terminate de workflow

### Testes sugeridos
- Unit: `repost.service.spec.ts` (criar regra, idempotência, short-circuit)
- Unit: `repost.repository.spec.ts`
- Integration: simular ciclo completo com mock de Graph API e R2
- E2E: criar regra via API -> mockar story -> verificar Post criado

## Perguntas em aberto (antes de implementar)

1. **Intervalo mínimo** realmente 5 min? Algum cliente precisaria de 1 min?
   (trade-off: rate limit Graph API)
2. **V1 inclui imagens de story** ou só vídeos? Se só vídeos, destino
   TikTok/Shorts não aceita foto mesmo.
3. **Legenda**: template fixo por regra ou permitir variáveis
   (`{{story_text}}`, `{{timestamp}}`, `{{source_username}}`)?
4. **Multi-profile**: uma regra sempre vive dentro de 1 perfil. Pode uma
   regra ter **origem** em outro perfil? (sugestão: não, mantém isolamento)
5. **IG como destino**: permitir repostar o próprio story como Reel no
   mesmo IG? (opcional, mas discutível — algoritmo Meta pode penalizar)
6. **Notificação**: quando auto-desativar regra por erro, enviar email?
   Toast na UI? Webhook para N8N?
7. **Menu**: integrar em "Automações" como 3o tipo (preferência do
   usuário) ou criar menu próprio "Repost"? **Decisão**: tentar integrar
   em Automações primeiro; só criar menu próprio se houver conflito
   estrutural.
8. **Créditos de IA**: v1 não usa IA (copia legenda do story ou usa
   template). V2 com legenda gerada por LLM passaria pelo sistema de
   créditos existente (`AI_CREDITS_MODE`).
9. **Workflow por regra ou workflow master?** Proposto: por regra (mais
   simples, segue padrão autopost). Alternativa: 1 workflow master que
   varre todas as regras — menos workflows mas menos isolamento.
10. **Deletar mídia baixada** após X dias (housekeeping)? R2 acumula
    rápido — definir TTL de `Media` criado por repost.

## Arquivos relacionados (referência)

- `docs/automacoes-instagram.md` — feature de automações já existente
- `docs/architecture/profile-ai-persona.md` — padrão de persona por perfil
- `docs/architecture/knowledge-base-rag.md` — padrão de feature flag + UI
- `docs/architecture/future-client-login.md` — padrão de proposta futura

