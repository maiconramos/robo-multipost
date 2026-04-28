# Instagram Automations — Agent Reference

Documento destinado a agentes de IA (Claude, Cursor, etc.) e ao time de
engenharia para **entender rapidamente** como o subsistema de automacoes
do Instagram funciona, onde cada credencial e usada, e quais sao os
pontos de entrada mais comuns para mudancas.

> Usuarios finais: veja `docs/automacoes-instagram.md`.
> Arquitetura profunda: este documento.

---

## 1. Visao geral do fluxo

Existem **dois gatilhos** suportados:

- `comment_on_post` — alguem comenta em um feed/reel da conta conectada.
- `story_reply` — alguem responde ou reage a um story.

O fluxo para `comment_on_post` com `requireFollow=true` e o mais complexo:
e um **follow gate de 2 etapas** com botao postback (padrao ManyChat).

```
Comentario no IG
   -> Webhook /api/webhooks/instagram (HMAC validado com Facebook OR Instagram App Secret)
   -> IgWebhookController.processCommentEvent
   -> FlowsService.startFlowsForComment (enfileira Temporal)
   -> flowExecutionWorkflow (task queue "main")
       - replyToComment (resposta publica)
       - (branch requireFollow && comment_on_post) sendOpeningDmWithPostback
           + createPendingPostback (snapshot imutavel)
           + updateExecution -> WAITING_POSTBACK
       - (branch sem gate) sendDirectMessage direto

Usuario clica no botao postback
   -> Webhook messaging_postbacks
   -> IgWebhookController.processMessagingEvent (detecta event.postback)
   -> FlowsService.handlePostbackClick
       + valida HMAC do payload (pb_<shortId>_<hmac8>)
       + idempotencia por consumedMetaMid (@unique)
       + dispara followGateResolveWorkflow (workflow novo, curto)
   -> checkIgFollowStatus (agora com janela de messaging aberta)
       - follows=true  -> sendFinalDm + consumePendingPostback -> COMPLETED
       - follows=false -> sendAlreadyFollowedGate (novo postback "Ja segui!")
           attemptCount++ ate maxAttempts -> ABANDONED com gateExhaustedMessage
```

Story reply e mais simples: sem postback, checagem de follow direto, branch
entre DM configurada vs `followGateMessage`.

---

## 2. Camadas de credenciais (IMPORTANTE)

O Robo MultiPost tem **tres camadas distintas** de credenciais Meta. Nao
as misture — cada uma resolve um problema diferente.

### Camada 1 — Credenciais do App (por workspace)

Configuradas em **Settings > Credenciais**. Por perfil/workspace.

| Campo Prisma | Uso | Propagacao |
|---|---|---|
| `Credentials.clientId`/`clientSecret` | Facebook App ID/Secret (OAuth FB Login, tokens de pagina) | `integrations.controller.ts` injeta em `ClientInformation` |
| `Credentials.instagramAppId`/`instagramAppSecret` | Instagram App ID/Secret (OAuth IG Login API, HMAC webhook IG) | Idem (branch `instagram-standalone`) + `ig-webhook.controller.ts` para HMAC |
| `Credentials.threadsAppId`/`threadsAppSecret` | Threads OAuth | Idem (branch `threads`) |
| `Credentials.instagramVerifyToken` | Verify token do webhook IG (por perfil) | `/flows/webhook-config` retorna isso para o usuario colar no Meta Panel |

**Regra critica** (veja `memory/feedback_per_profile_credentials.md`):
todo provider OAuth **DEVE** aceitar `ClientInformation` em `generateAuthUrl`
E em `authenticate`, e o controller **DEVE** passar a credencial certa
conforme o `integration` identifier. Nunca ler `process.env.X_APP_ID`
direto dentro do provider sem fallback em ClientInformation.

### Camada 2 — Token da Integration (por canal conectado)

Apos o OAuth, salvo em `Integration.token`. Varia por `providerIdentifier`:

| providerIdentifier | Tipo de token em `integration.token` | Host Meta para messaging |
|---|---|---|
| `instagram` | Page Access Token (FB Login -> Page token) | `graph.facebook.com` |
| `instagram-standalone` | **IG User Token** (IG Login API) | `graph.instagram.com` |
| `threads` | Threads User Token | `graph.threads.net` |

### Camada 3 — Messaging Tokens (por perfil, compartilhado entre integrations)

Cadastrados em **Settings > Credenciais > Instagram** como "Tokens de
messaging por conta" OU como "Meta System User Token".

Armazenados em `Credentials.instagramTokens` (JSON) e
`Credentials.metaSystemUserToken`:

```ts
// MessagingTokensState
{
  metaSystemUserToken?: string;   // token permanente do Business Manager
  instagramTokens: [
    { igUserId, username, token, refreshedAt, validatedAt }  // IG User Token por conta (60d + lazy refresh)
  ]
}
```

**Por que isto existe?** `instagram_manage_messages` exige Advanced Access
(App Review pesado) no caminho `graph.facebook.com`. O IG User Token em
`graph.instagram.com` dispensa App Review para `is_user_follow_business`
e DM privada — mas e um token separado que o aluno gera direto no Meta
Dashboard.

---

## 3. Roteamento de tokens e hosts (core logic)

**Ponto unico de decisao**: `FlowActivity.resolveIgRoute(integration)` em
`apps/orchestrator/src/activities/flow.activity.ts`. Usado por:

- `replyToComment`
- `sendDirectMessage`
- `sendOpeningDmWithPostback`
- `checkIgFollowStatus` (quando `source === 'comment'`)

Prioridade:

```
1. providerIdentifier === 'instagram-standalone'
      -> integration.token (IG User Token) + graph.instagram.com
2. InstagramMessagingService.resolveIgUserToken(org, profile, internalId)
      -> IG User Token cadastrado em Settings + graph.instagram.com
3. fallback
      -> integration.token (Page Access Token) + graph.facebook.com
         (so funciona com Advanced Access a instagram_manage_messages)
```

`sendFinalDm` e `sendAlreadyFollowedGate` usam logica similar:
- standalone -> `sendDmWithToken(integration.token, useInstagramGraph: true)`
- caso contrario -> `sendStoryReply` (que internamente prefere System User
  Token > IG User Token cadastrado, ambos em `/me/messages`).

Story replies (`sendStoryDirectMessage`, `checkIgFollowStatus` com
`source === 'story_reply'`) **sempre** usam `InstagramMessagingService`
diretamente — elas nao tem token de comentario em maos.

---

## 4. Follow-gate de 2 etapas (postback)

Implementacao completa em:

| Arquivo | Papel |
|---|---|
| `apps/orchestrator/src/workflows/flow.execution.workflow.ts` | Branch `case 'TRIGGER'` quando `requireFollow && triggerType === 'comment_on_post'` — envia opening DM e cria PendingPostback |
| `apps/orchestrator/src/workflows/follow-gate-resolve.workflow.ts` | Workflow **novo por clique** (stateless) — resolve o gate |
| `apps/orchestrator/src/activities/flow.activity.ts` | Activities `sendOpeningDmWithPostback`, `sendFinalDm`, `sendAlreadyFollowedGate`, `createPendingPostback`, `getPendingPostback`, `consumePendingPostback`, `expirePendingPostbacks` |
| `libraries/nestjs-libraries/src/database/prisma/flows/flows.repository.ts` | CRUD de `PendingPostback` |
| `libraries/nestjs-libraries/src/database/prisma/flows/flows.service.ts` | `handlePostbackClick` + `generatePostbackPayload` + `verifyPostbackPayload` |
| `apps/backend/src/api/routes/ig-webhook.controller.ts` | Branch `event.postback` em `processMessagingEvent` |

### Payload do botao postback

Formato: `pb_<shortId12>_<hmac8>` (~23 chars). `shortId` = 12 chars
base64url. `hmac8` = primeiros 8 chars hex de `HMAC-SHA256(SECRET,
shortId)`. Secret vem de `POSTBACK_SIGNING_SECRET` (env) com fallback em
`FACEBOOK_APP_SECRET`. `crypto.timingSafeEqual` para verificacao.

### Modelo `PendingPostback`

Tabela independente de `FlowExecution` — NAO estende. Snapshots imutaveis
(`snapshotFinalDm`, `snapshotFinalBtnText`, `snapshotFinalBtnUrl`,
`snapshotGateDm`, `snapshotAlreadyBtnText`, `snapshotExhaustedMessage`,
`openingDmMessage`, `openingDmButtonText`) garantem que edicoes do flow
nao afetem execucoes em andamento.

### Idempotencia / anti-loop

| Risco | Defesa |
|---|---|
| Meta re-entrega webhook | `updateMany({ consumedMetaMid: null }, { consumedMetaMid: mid })` atomico |
| Clique duplo | `status !== PENDING` -> no-op |
| Clique apos expiracao | `expiresAt < now` -> log + 200 OK silencioso |
| Loop "Ja segui" infinito | `attemptCount >= maxAttempts` (default 3, configuravel 1-10) |
| Pending orfaos | Activity `expirePendingPostbacks` (cron) marca `EXPIRED` |
| Spoofing | HMAC + prefixo `pb_` obrigatorio |

---

## 5. UI — Wizard e Flow Builder

**Wizard** (`apps/frontend/src/components/automations/automation-wizard.component.tsx`):
formulario single-page que cria um flow "quick-create" com shape conhecido
(TRIGGER -> REPLY_COMMENT -> SEND_DM). Caminho produtivo preferido.

**Flow Builder / Canvas**
(`apps/frontend/src/components/automations/flow-editor.component.tsx` +
`node-config-panel.tsx` + `nodes/*.tsx`): editor visual com nos arbitrarios.

Ambos escrevem o mesmo formato de `triggerConfig`:

```ts
{
  triggerType: 'comment_on_post' | 'story_reply',
  mode: 'all' | 'next_publication' | 'specific',
  postIds?: string[],     // mode=specific && comment
  storyIds?: string[],    // mode=specific && story
  keywords?: string[],
  matchMode?: 'any' | 'all' | 'exact',
  matchReactions?: boolean,   // story_reply only
  requireFollow?: boolean,
  followGateMessage?: string,
  // campos do gate 2-etapas (comment_on_post + requireFollow):
  openingDmMessage?: string,
  openingDmButtonText?: string,
  alreadyFollowedButtonText?: string,
  gateExhaustedMessage?: string,
  maxGateAttempts?: number,   // 1..10, default 3
}
```

`SEND_DM` aceita: `message`, `buttonText`, `buttonUrl` (URL button). O
button postback do gate e injetado **automaticamente** pelo workflow — nao
e configuravel no canvas.

---

## 6. Arquivos-chave (mapa rapido para agentes)

### Backend / Orchestrator

```
apps/backend/src/api/routes/
  ig-webhook.controller.ts            # webhook HMAC + branch de postback
  integrations.controller.ts          # OAuth controller + injecao de ClientInformation

apps/orchestrator/src/
  workflows/flow.execution.workflow.ts       # workflow principal (grafo do flow)
  workflows/follow-gate-resolve.workflow.ts  # workflow curto disparado pelo postback
  activities/flow.activity.ts                # TODAS as activities (reply, DM, postback, follow check)
```

### Libraries

```
libraries/nestjs-libraries/src/
  integrations/social/
    instagram.provider.ts               # provider "instagram" (FB Business) — sendDM, sendPrivateReply, replyToComment
    instagram.standalone.provider.ts    # provider "instagram-standalone" (IG Login API)
    instagram-messaging.service.ts      # tokens de messaging + resolveIgUserToken + sendDmWithToken + isFollowingByToken
    instagram-dm-button.type.ts         # union type { kind: 'url' | 'postback' }

  database/prisma/
    schema.prisma                       # models Integration, Credentials, PendingPostback, FlowExecution, Flow
    flows/
      flows.repository.ts               # CRUD Flow, FlowExecution, PendingPostback
      flows.service.ts                  # handlePostbackClick, generatePostbackPayload, verifyPostbackPayload
    credentials/
      credential.service.ts             # leitura/escrita de Credentials (getRaw, updateMessagingTokens)

  dtos/flows/flow.dto.ts                # QuickCreateFlowDto (o contrato do wizard)
```

### Frontend

```
apps/frontend/src/components/automations/
  automation-wizard.component.tsx       # wizard (formulario) — caminho preferido
  flow-editor.component.tsx             # canvas xyflow
  node-config-panel.tsx                 # painel lateral do canvas
  nodes/trigger-node.tsx                # visual do gatilho no canvas (mostra badge requireFollow)
  nodes/send-dm-node.tsx                # visual do DM no canvas (mostra chip buttonText)
  flow-executions.component.tsx         # historico de execucoes (status + log)
  wizard-phone-preview.component.tsx    # preview do celular no wizard
```

---

## 7. Convencoes e armadilhas (leia antes de mexer)

1. **Nunca ler `process.env.*_APP_ID` direto em provider.** Sempre aceitar
   `ClientInformation` e cair no env como fallback.
2. **Toda string visivel no frontend passa por `useT()`** (ver CLAUDE.md).
3. **`is_user_follow_business` nao e confiavel em `graph.facebook.com`**
   sem Advanced Access, e pode retornar `null` ate em `graph.instagram.com`
   quando nao ha contexto de messaging. Politica:
   - `comment_on_post`: null -> fail-closed (envia gate).
   - `story_reply`: null -> fail-open (envia DM normal).
4. **Private reply (`recipient: { comment_id }`) so pode ser enviado UMA
   vez por comentario**, em ate 7 dias. A DM inicial do gate esgota essa
   cota — daqui pra frente use `/me/messages` (requer janela de 24h aberta).
5. **`postback.mid` (Meta message id) e a chave de idempotencia** do
   webhook. Sempre usar `consumedMetaMid @unique` + `updateMany` com
   `consumedMetaMid: null` para atomicidade.
6. **Nao extender `FlowExecution` com campos de postback.** Use a tabela
   `PendingPostback` (snapshots imutaveis + TTL isolado).
7. **System User Token > IG User Token > Page Access Token** e a ordem
   de preferencia em `InstagramMessagingService.sendStoryReply`. Em
   `resolveIgRoute` do FlowActivity a ordem e outra (standalone > IG User
   Token cadastrado > Page Access Token) porque o contexto e diferente
   (private reply exige `comment_id`, nao abre janela).
8. **Validar HMAC do webhook com AMBOS os app secrets** (Facebook AND
   Instagram) quando os dois produtos estao no mesmo app Meta. Ver
   `ig-webhook.controller.ts`.

---

## 8. Comandos uteis

```bash
pnpm prisma-generate
pnpm prisma-db-push
pnpm --filter ./apps/backend run build
pnpm --filter ./apps/orchestrator run build
pnpm --filter ./apps/frontend exec tsc --noEmit -p tsconfig.json
```

---

## 9. Historico resumido das mudancas relevantes

(Para detalhes, ver `CHANGELOG.md`.)

- Follow gate em 2 etapas (postback) + snapshots imutaveis.
- Scope `instagram_business_manage_messages` adicionado ao provider Standalone.
- `ClientInformation` propagado em `generateAuthUrl`/`authenticate` para
  Instagram Standalone e Threads.
- `resolveIgUserToken` no messaging service + `resolveIgRoute` no
  FlowActivity permitem reusar o IG User Token cadastrado em Settings
  para integrations conectadas via Facebook Business, sem reconectar.
- Paridade do Flow Builder com o wizard (follow gate fields + button CTA).
