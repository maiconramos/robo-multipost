# Dossie: Repost Automatico de Stories do Instagram

> Status: **Proposta** (Fase Futura)
> Ultima atualizacao: 2026-04-20
> Inspiracao: [Repurpose.io](https://repurpose.io), [Repostify](https://repostify.com)

## Contexto e motivacao

Permitir que o Robo MultiPost **monitore automaticamente os stories publicados
diretamente no app do Instagram** (ou Creator Studio, Meta Business Suite, etc)
e **reposte** o mesmo conteudo em outras redes curtas/verticais (TikTok,
YouTube Shorts, e outras no futuro).

A postagem original **nao sai do MultiPost** — o usuario continua publicando
no Instagram pelo app como faz hoje. O MultiPost apenas observa, baixa a
midia do story e republica nos canais destino.

Diferenca vs features ja documentadas:

| Feature | Canal observado | Acao |
|---|---|---|
| Automacoes (ManyChat-style) | Comentarios/DMs no IG | Responder comentario / enviar DM |
| Autopost | Fontes externas (RSS, N8N) | Gerar post novo |
| **Repost de Stories** (esta proposta) | Stories publicados no IG | Republicar midia em outras redes |

## Objetivo

Automatizar o ciclo **capturar -> baixar -> redistribuir** de stories do
Instagram para reduzir trabalho manual do criador de conteudo.

## Nao-objetivos (v1)

- Repostar Reels ou posts de feed (**fase futura**)
- Repostar Highlights (destaques)
- Edicao de midia (cortes, legendas queimadas, watermark)
- Reescrita de legenda com IA (pode entrar em v2 via persona do perfil)
- Deteccao automatica de musica licenciada
- Repost de story com foto (v1 so video) — **decisao a confirmar**

## Fases

| Fase | Escopo |
|---|---|
| **v1 (esta proposta)** | IG Story (video) -> TikTok (Late + nativo) + YouTube Shorts |
| v2 | IG Story (foto) -> IG Reel foto / Pinterest / Threads |
| v3 | IG Reel -> TikTok + YouTube Shorts + Facebook Reels |
| v4 | IG Feed -> outras redes / Cross-posting bidirecional |

## Pre-requisitos do usuario

- Conta **Instagram Business** conectada no MultiPost (provider `instagram`
  ou `instagram-standalone`) com scope `instagram_basic`
- Canal(is) de destino ja conectado(s) no MultiPost (ex: TikTok, YouTube)
- App Meta em Live Mode (para contas fora de Roles/Testers)

> **Sem variavel de ambiente global**. A feature respeita cada perfil: se o
> usuario nao quer usar, simplesmente nao cria regra de repost. Nenhum
> `ENABLE_*` em `.env`.

## Arquitetura proposta

### Onde vive a feature no produto

Preferencia: **integrar no menu "Automacoes"** como um novo **tipo de
automacao** ("Repost de conteudo"), ao lado dos ja existentes "Comentario em
publicacao" e "Resposta ao story". Isso:

- Reusa a navegacao que o usuario ja conhece
- Permite extensao futura (Reels, Feed, etc) como novos sub-tipos
- Reusa o historico de execucoes ja implementado

Fallback (se houver conflito estrutural): criar item de menu proprio
chamado **"Repost"** no sidebar principal.

Codigo existente a reutilizar:
- `apps/frontend/src/components/automations/` — listagem e wizards
- `libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts`
  -> `getRecentStories()` (ja implementado)
- `libraries/nestjs-libraries/src/upload/cloudflare.storage.ts`
  -> `uploadSimple(url)` (download + upload para R2)
- `apps/orchestrator/src/workflows/autopost.workflow.ts` — padrao de loop
  com `sleep()` durable

### Fluxo de alto nivel

```
[Usuario publica story no app do Instagram]
        |
        v
[Temporal Workflow (loop por regra) ativado]
  | a cada N minutos:
  |   1. Consulta ultimo checkpoint (lastStoryId) da regra
  |   2. Chama GET /{ig-user-id}/stories
  |   3. Filtra stories novos (id > lastStoryId)
  |   4. SE vazio -> sleep, sem custo (short-circuit)
  |   5. SE novo: baixa media_url, salva em Media (R2/local)
  |   6. Para cada destino selecionado:
  |        cria Post QUEUE (publishDate = agora) com a Media
  |        scheduler existente publica no provider
  |   7. Atualiza checkpoint + grava log de execucao
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

Para permitir expansao futura (Reels, Feed, outras origens), o modelo e
**generico** — nao amarrado a Instagram Stories.

### `RepostRule`

Representa uma regra de repost configurada pelo usuario.

| Campo | Tipo | Obs |
|---|---|---|
| `id` | uuid | PK |
| `organizationId` | string | FK multi-tenancy |
| `profileId` | string | FK — regra vive dentro de um perfil |
| `name` | string | nome amigavel da regra |
| `enabled` | boolean | liga/desliga sem deletar |
| `sourceIntegrationId` | string | FK Integration (canal origem, ex: IG Business) |
| `sourceType` | enum `RepostSourceType` | `INSTAGRAM_STORY` (v1), `INSTAGRAM_REEL`, `INSTAGRAM_FEED`, ... |
| `destinationIntegrationIds` | string[] | IDs de Integration dos destinos |
| `intervalMinutes` | int | intervalo do polling (min 5, default 15) |
| `filterIncludeVideos` | boolean | default true |
| `filterIncludeImages` | boolean | default false (v1) |
| `filterMaxDurationSeconds` | int? | null = sem limite; TikTok/Shorts aplicam proprio limite |
| `captionTemplate` | string? | texto padrao para legenda do repost |
| `lastSourceItemId` | string? | checkpoint: ultimo ID processado |
| `lastRunAt` | datetime? | para UI / telemetria |
| `createdAt` / `updatedAt` | datetime | |

### `RepostLog`

Cada item de midia descoberto vira um log — chave de idempotencia.

| Campo | Tipo | Obs |
|---|---|---|
| `id` | uuid | PK |
| `ruleId` | string | FK `RepostRule` (cascade) |
| `sourceItemId` | string | ex: `igStoryId` |
| `mediaType` | enum `VIDEO` \| `IMAGE` | do item |
| `mediaUrlOriginal` | string | URL Graph API (expira) |
| `storedMediaId` | string? | FK `Media` apos download |
| `status` | enum `PENDING` \| `DOWNLOADED` \| `PUBLISHED` \| `PARTIAL` \| `SKIPPED` \| `FAILED` | |
| `skippedReason` | string? | ex: `CLOSE_FRIENDS`, `FILTER_IMAGE`, `DURATION_EXCEEDED` |
| `errorMessage` | string? | stack curta |
| `publishedPosts` | json? | `[{integrationId, postId, releaseUrl}]` |
| `discoveredAt` | datetime | |
| `processedAt` | datetime? | |

**Indices**:
- `(ruleId, sourceItemId)` unique — idempotencia absoluta
- `(ruleId, status)` — para UI de historico

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
    para cada item em ordem cronologica (mais antigo primeiro):
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

**Padrao Temporal reutilizado**: mesmo esquema de
`autoPostWorkflow` — `workflowId` deterministico
(`repost-rule-{ruleId}`), `sleep()` durable, `terminateWorkflow` ao
desativar a regra (`processCron`-style de
`libraries/nestjs-libraries/src/database/prisma/autoposts/autopost.service.ts`).

### Short-circuit (importante)

Na **maioria dos ciclos nao havera conteudo novo**. O workflow deve:

1. Ler `lastSourceItemId` da regra
2. Chamar `getRecentStories()` (1 request Graph API — barato)
3. Comparar ids — se todos ja foram processados, **nenhum download, nenhum
   post, nenhum registro no log** (exceto talvez um `lastRunAt` atualizado)
4. `sleep` e repete

Isso mantem o custo por ciclo em **1 request Graph API por regra ativa**.

### Respeito a rate limits

Limites a considerar ao escolher `intervalMinutes`:

| API | Limite relevante |
|---|---|
| Meta Graph API | ~200 calls/hora por usuario (compartilhado com outras features como webhooks, comentarios, refresh) |
| TikTok (direct) | 300 jobs concorrentes; 6 posts/dia por conta em modo sandbox |
| TikTok via Late | quota Late (`checkUsage()` ja existe em `late.base.provider.ts`) |
| YouTube Data API | 10000 unidades/dia; upload = ~1600 unidades |

**Recomendacoes**:
- **Minimo permitido**: 5 min (ja consome 12 requests/hora por regra ativa)
- **Default**: 15 min (4 req/h — sobra larga margem)
- **Telas de UI**: mostrar slider com presets (5 min / 15 min / 30 min / 1h / 2h / 6h)
- Opcao futura: **exponential backoff** quando a conta ficar horas sem
  publicar (ex: duplica o intervalo apos 6 ciclos vazios, maximo 2h)

### Idempotencia

- `workflowId = repost-rule-{ruleId}` — Temporal rejeita iniciar workflow
  duplicado
- Unique constraint `(ruleId, sourceItemId)` no `RepostLog` — se o workflow
  reiniciar e reencontrar a mesma story, a criacao de log falha e o item
  e pulado

### Download da midia

A `media_url` retornada pelo Graph API **expira rapido** (pode ser horas).
O download precisa acontecer no mesmo ciclo em que o item foi descoberto.
Reutilizar `CloudflareStorage.uploadSimple(url)` (ou `LocalStorage`
equivalente) que ja faz `fetch` + upload.

O `Media` criado fica associado ao `profileId` da regra e ao
`organizationId`, seguindo o padrao do schema.

### Publicacao nos destinos

Criar 1 `Post` por destino, em estado `QUEUE`, apontando para a mesma
`Media`. O scheduler existente (`postWorkflowV102`) roteia para o provider
correto baseado em `integrationId`.

Settings por tipo de destino (ex: TikTok requer `post_type`):
- Para TikTok: usar `DIRECT_POST` padrao
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
POST   /repost/rules/:id/run-now            dispara um ciclo manual (util para teste)
GET    /repost/rules/:id/logs               paginacao de logs de execucao
GET    /repost/source-options               lista tipos de origem disponiveis (v1: INSTAGRAM_STORY)
GET    /repost/destination-candidates?sourceType=INSTAGRAM_STORY
                                            lista canais compativeis conectados
```

O endpoint `/repost/destination-candidates` e chave: ele filtra apenas
canais conectados na conta que sao compatíveis com o `sourceType`
escolhido — base para a UI em 2 colunas.

## UI proposta

### Navegacao

Em `apps/frontend/src/components/automations/`:
- Listagem de automacoes ganha um novo card "Repost de conteudo" ao lado
  de "Comentario em publicacao" e "Resposta ao story"
- Wizard de criacao abre em layout de 2 colunas

### Wizard "Nova regra de Repost"

Layout de 2 colunas (inspirado em Repurpose.io / Repostify):

```
+-------------------------------------------------------------+
|  POST FROM                    |  POST TO                    |
|  (origem)                     |  (destinos)                 |
|                               |                             |
|  [dropdown: tipo de conteudo] |  [multi-select: canais]    |
|  [radio: Story | (Reel v3)]   |                             |
|                               |  (apenas canais             |
|  [dropdown: canal IG]         |   conectados + compativeis) |
|                               |                             |
|  (so canais IG conectados)    |  Ex:                        |
|                               |  [x] TikTok (@user)         |
|                               |  [x] TikTok Late (@user2)   |
|                               |  [x] YouTube Shorts (@chan) |
+-------------------------------------------------------------+

CONFIGURACOES AVANCADAS
- Nome da regra: [texto livre]
- Verificar novos stories a cada: [5min|15min|30min|1h|2h|6h]
- Filtros:
  [x] Repostar videos
  [ ] Repostar imagens (em breve)
  - Duracao maxima: [slider / "sem limite"]
- Legenda padrao: [textarea com template]
- [Switch] Ativar regra agora
[Salvar] [Cancelar]
```

### Listagem de regras

Tabela com: nome, origem (icone canal + @handle), destinos (icones), status
(Ativa/Pausada), "ultimo ciclo", botao "Rodar agora", menu (editar/excluir).

### Tela de Historico (por regra)

Tabela de `RepostLog` com: data, sourceItemId (preview thumbnail do story),
midia baixada (link), destinos publicados (icones com link), status badge,
"ver erro" (se FAILED).

### Traducoes (obrigatorio)

Todas as strings da UI passam por `useT()`. As chaves em
`locales/pt/translation.json` **devem usar acentos** (padrao do projeto pt-BR
— ja existe, por exemplo "Automações", "Escolha um gatilho para sua automação").
As chaves em snake_case: `repost_rule_title`, `repost_post_from`,
`repost_post_to`, `repost_check_every`, `repost_duration_max`, etc.

## Providers de destino compativeis (v1)

| Destino | Formato esperado | Provider | Caveats |
|---|---|---|---|
| **TikTok (nativo)** | video MP4 9:16 | `tiktok.provider.ts` | `PULL_FROM_URL`; precisa URL publica (R2); duracao min/max consultada por `maxVideoLength()` |
| **TikTok (via Late)** | video MP4 9:16 | `late-tiktok.provider.ts` | quota Late; charLimit 2200 |
| **YouTube Shorts** | video 9:16 <= 60s | `youtube.provider.ts` | upload resumable ja implementado; titulo obrigatorio (gerar do captionTemplate ou do story) |

Destinos **v2** (nao nesta fase):
- Instagram Reels (mesma conta ou conta alternativa — cuidado com
  algoritmo penalizar repost do proprio story)
- Facebook Reels
- Threads (limite menor de duracao)
- Pinterest Idea Pin

Destinos **nao compativeis** (v1 nao lista no `destination-candidates`):
Twitter/X (prefer imagem+texto), Discord (nao e scheduler), LinkedIn (9:16
aceito mas nao ideal), Bluesky, Mastodon.

## Edge cases e limitacoes

### Limitacoes da Meta Graph API

- **Janela de 24h**: o endpoint `/me/stories` so retorna stories **ativos**.
  Stories expirados nao sao recuperaveis. **Mitigacao**: intervalo default
  <= 60 min e alertas quando o worker Temporal fica down.
- **Sem webhook para stories proprios**: a Meta **nao envia webhook** quando
  a propria conta publica um story. Por isso o polling e obrigatorio. O
  webhook `reply_to.story` (ja usado em automacoes) e para respostas de
  terceiros, nao para a propria publicacao.
- **Rate limit global**: ~200 calls/hora por usuario Meta — compartilhado
  com outras features. A regra de 15 min default consome 4 req/h por regra
  ativa, deixando margem.
- **`media_url` expira**: download precisa acontecer **no mesmo ciclo** em
  que o item e descoberto. Se falhar, retry no proximo ciclo pode encontrar
  URL expirada — o log fica FAILED com `errorMessage`.

### Limitacoes de conteudo

- **Musica licenciada**: stories com musica do catalogo IG sao baixados com
  o audio, mas podem ser bloqueados por copyright no TikTok/YouTube. V1:
  apenas **aviso no UI** ("cheque os termos de musica antes de ativar"). V2:
  tentar remover audio ou oferecer opcao de mutar.
- **Stickers interativos** (enquetes, countdown, quiz, slider, mencoes):
  Graph API retorna apenas a midia renderizada final — os stickers ficam
  como imagem "queimada" no video. Reposts podem ficar estranhos. **Aviso
  no UI**.
- **Stories de close friends**: se o usuario publica em close friends, a
  API pode retornar — documentar comportamento esperado. Sugestao: checar
  campo `is_close_friends` (se exposto) e skippar com
  `skippedReason=CLOSE_FRIENDS`.
- **Carrosseis de story**: o IG retorna cada frame como um item separado
  com proprio `id`. Cada item vira **um repost separado** (ex: carrossel
  de 3 frames = 3 videos no TikTok). Ordem preservada pelo `timestamp`.
- **Formato Boomerang / layout / foto**: em v1 com `filterIncludeImages=false`,
  imagens sao skipadas com `skippedReason=FILTER_IMAGE`.

### Limitacoes dos destinos

- **TikTok duracao minima**: 3s (pode variar por conta). Stories curtos
  demais serao rejeitados pelo provider — log FAILED.
- **TikTok duracao maxima**: consultada dinamicamente via `maxVideoLength()`.
  Respeitar via filtro `filterMaxDurationSeconds`.
- **YouTube Shorts max 60s**: se story tem mais, skippar com
  `skippedReason=DURATION_EXCEEDED` (ou enviar como video normal — decisao
  futura).
- **Aspect ratio**: stories IG ja sao 9:16 nativo, compativel com todos os
  destinos listados. Se um dia vier 1:1 ou 4:5 (Reels antigas), pode haver
  problema — validar no download.

### Limitacoes do sistema

- **Token expirado**: integrar com `refreshTokenWorkflow` existente. Se o
  refresh falhar, a regra **auto-desativa** (`enabled=false`) e notifica
  (toast/email) o owner do perfil. Nao fica em loop de erro.
- **Destino desconectado**: se um `destinationIntegrationId` ficar invalido
  (usuario desconectou o canal), o ciclo pula esse destino com log
  `status=PARTIAL` e continua os outros.
- **Multi-regra para a mesma origem**: permitido. Mas `lastSourceItemId`
  e por regra, entao o mesmo story pode ser reposicionado 2x se houver 2
  regras ativas na mesma origem — **by design**.
- **Uma regra = um workflow Temporal**. Escalabilidade: N regras ativas =
  N workflows, cada um acordando a cada intervalo. Nao e problema ate
  centenas de regras por worker.
- **Remocao do story no IG antes do download**: `fetch(media_url)` pode
  voltar 404. Log FAILED com `errorMessage=MEDIA_NOT_FOUND`.
- **Conteudo sensitivo/flagged**: o MultiPost nao faz moderacao propria.
  Se o TikTok/YouTube rejeitar, o log fica com erro do provider.

## Compliance

- **Meta ToS**: leitura de stories proprios com `instagram_basic` e
  permitida. Baixar e repostar a **propria midia** em outras redes nao
  viola ToS da Meta. Nao ha scraping de terceiros.
- **TikTok / YouTube**: a responsabilidade pelo copyright da musica e do
  conteudo e do usuario. Documentar no UI e no termos de uso da feature.
- **AGPL**: por ser fork publico (Postiz), toda a feature fica no monorepo
  (sem codigo proprietario externo).
- **LGPD / GDPR**: `RepostLog.mediaUrlOriginal` pode conter referencia ao
  storyId. Ao deletar uma regra, tambem limpar logs (cascade) e midias
  orfas (job periodico de housekeeping — ja existe padrao no projeto).

## Observabilidade

### Logs estruturados

Cada ciclo do workflow loga:
- `ruleId`, `profileId`, `organizationId`
- `itemsDiscovered`, `itemsNew`, `itemsPublished`, `itemsFailed`, `itemsSkipped`
- `durationMs`, `apiCalls`

### Metricas (opcional, se Prometheus for adicionado)

- `repost_cycles_total{rule_id, status}`
- `repost_items_total{rule_id, status}`
- `repost_duration_seconds` (histogram)

### UI de historico

A tela de historico por regra mostra as metricas agregadas (ultimos 7d /
30d) + lista paginada de `RepostLog`.

## Rollout

**Sem feature flag global via `.env`** (decisao explicita do usuario). A
feature respeita cada perfil:

- Se o perfil nao tem regra cadastrada -> nada acontece
- Se o perfil tem regra desabilitada -> workflow nao existe, custo zero
- Se o perfil tem regra ativa -> workflow Temporal roda

Isso evita que admin tenha que mexer em env e permite que cada cliente
(perfil) adote a feature no proprio ritmo.

Controle implicito de habilitacao: **precisa ter Instagram Business
conectado**. Sem IG conectado, o menu nem mostra o card de
"Repost de conteudo".

### Estrategia de lancamento sugerida

1. **Beta fechado**: primeiros N perfis selecionados, feedback
2. **Beta aberto**: disponivel para todos, badge "Beta" no menu
3. **GA**: remove badge

Nao ha migration destrutiva — novas tabelas + novos endpoints.

## Arquivos a criar/modificar (referencia de implementacao futura)

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
- Integracao no card de selecao em
  `apps/frontend/src/components/automations/` (acrescentar 3o tipo)
- Hooks SWR isolados em `repost.hooks.ts` (seguindo regra de 1 hook = 1
  `useSWR`)

### i18n
- `libraries/react-shared-libraries/src/translation/locales/pt/translation.json`
  (COM acentuacao)
- `libraries/react-shared-libraries/src/translation/locales/en/translation.json`

### Integracoes existentes usadas (nao modifica)
- `libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts`
  -> `getRecentStories()`
- `libraries/nestjs-libraries/src/upload/cloudflare.storage.ts`
  -> `uploadSimple()`
- `libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts`
  -> para refresh automatico
- `apps/orchestrator/src/workflows/autopost.workflow.ts` — padrao de
  referencia
- `libraries/nestjs-libraries/src/database/prisma/autoposts/autopost.service.ts`
  -> padrao `processCron` para start/terminate de workflow

### Testes sugeridos
- Unit: `repost.service.spec.ts` (criar regra, idempotencia, short-circuit)
- Unit: `repost.repository.spec.ts`
- Integration: simular ciclo completo com mock de Graph API e R2
- E2E: criar regra via API -> mockar story -> verificar Post criado

## Perguntas em aberto (antes de implementar)

1. **Intervalo minimo** realmente 5 min? Algum cliente precisaria de 1 min?
   (trade-off: rate limit Graph API)
2. **V1 inclui imagens de story** ou so videos? Se so videos, destino
   TikTok/Shorts nao aceita foto mesmo.
3. **Legenda**: template fixo por regra ou permitir variaveis
   (`{{story_text}}`, `{{timestamp}}`, `{{source_username}}`)?
4. **Multi-profile**: uma regra sempre vive dentro de 1 perfil. Pode uma
   regra ter **origem** em outro perfil? (sugestao: nao, mantem isolamento)
5. **IG como destino**: permitir repostar o proprio story como Reel no
   mesmo IG? (opcional, mas discutivel — algoritmo Meta pode penalizar)
6. **Notificacao**: quando auto-desativar regra por erro, enviar email?
   Toast na UI? Webhook para N8N?
7. **Menu**: integrar em "Automacoes" como 3o tipo (preferencia do
   usuario) ou criar menu proprio "Repost"? **Decisao**: tentar integrar
   em Automacoes primeiro; so criar menu proprio se houver conflito
   estrutural.
8. **Creditos de IA**: v1 nao usa IA (copia legenda do story ou usa
   template). V2 com legenda gerada por LLM passaria pelo sistema de
   creditos existente (`AI_CREDITS_MODE`).
9. **Workflow por regra ou workflow master?** Proposto: por regra (mais
   simples, segue padrao autopost). Alternativa: 1 workflow master que
   varre todas as regras — menos workflows mas menos isolamento.
10. **Deletar midia baixada** apos X dias (housekeeping)? R2 acumula
    rapido — definir TTL de `Media` criado por repost.

## Arquivos relacionados (referencia)

- `docs/automacoes-instagram.md` — feature de automacoes ja existente
- `docs/architecture/profile-ai-persona.md` — padrao de persona por perfil
- `docs/architecture/knowledge-base-rag.md` — padrao de feature flag + UI
- `docs/architecture/future-client-login.md` — padrao de proposta futura

