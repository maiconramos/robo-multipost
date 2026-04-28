# Automacoes Instagram (estilo ManyChat)

Guia completo para configurar e usar automacoes de comentarios do Instagram no Robo MultiPost.

## O que e

Permite criar fluxos visuais que respondem automaticamente a comentarios em postagens do Instagram. Por exemplo:

- Alguem comenta "PROMO" em um post -> responde no comentario + envia DM com cupom
- Alguem comenta uma pergunta -> responde no comentario pedindo para olhar a DM -> envia resposta detalhada na DM

A arquitetura suporta **multi-tenancy**: cada perfil/workspace pode ter seu proprio App Meta e suas proprias credenciais.

---

## Pre-requisitos

- Conta Instagram Business (com ou sem Pagina do Facebook — ver proximo bloco)
- App criado em [developers.facebook.com](https://developers.facebook.com)
- Dominio publico (ou ngrok/cloudflared em desenvolvimento) para receber os webhooks
- Instagram ja conectado na tela **Canais** do Robo MultiPost

### Escolha de fluxo de conexao (IMPORTANTE)

O Robo MultiPost oferece dois canais Instagram na tela de conexao:

| Canal | Quando usar | Follow gate funciona sem App Review? |
|---|---|---|
| **Instagram (Standalone)** | Recomendado. Conta IG Business com login direto no Instagram | **Sim** — via Instagram Login API (`graph.instagram.com`) com Standard Access |
| **Instagram (Facebook Business)** | Conta IG vinculada a uma Page do Facebook e gerenciada pelo Business Manager | Nao — exige Advanced Access a `instagram_manage_messages` (App Review completo) |

> **Para instancias de alunos/self-hosted**: use sempre **Instagram (Standalone)**. A Meta nao exige App Review para o campo `is_user_follow_business` no fluxo Instagram Login, entao o follow gate em automacoes de comentario funciona imediatamente apos a conexao. Ja existia conectado via "Instagram (Facebook Business)"? Reconecte o perfil escolhendo **Instagram (Standalone)** para ativar o follow gate.

---

## Passo 1 — Criar/Configurar o App Meta

1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps) e crie um app do tipo **Business**
2. No painel do app, adicione os produtos:
   - **Instagram Graph API**
   - **Webhooks**
   - **Facebook Login**
3. Em **App Review > Permissions and Features**, solicite:
   - `instagram_basic`
   - `instagram_manage_comments`
   - `instagram_manage_messages`
   - `pages_manage_metadata`
   - `pages_show_list`
   - `pages_read_engagement`

> **Modo Development**: para testar sem App Review, adicione as contas Instagram como **Roles > Testers** no painel do app.

---

## Passo 2 — Cadastrar credenciais do App no Robo MultiPost

Cada perfil pode ter seu proprio App Meta. Configure as credenciais em **Configuracoes > Credenciais de Apps**.

1. Faca login no Robo MultiPost com um perfil de **Admin**
2. Acesse **Configuracoes > Credenciais de Apps**
3. Expanda o card **Facebook / Instagram / Threads** e preencha:
   | Campo | Valor |
   |---|---|
   | **Client ID** | App ID do painel Meta |
   | **Client Secret** | App Secret do painel Meta (usado para HMAC do webhook) |
   | **Webhook Verify Token** | *(opcional)* deixe vazio para usar o padrao `multipost` |
4. Clique em **Salvar credenciais**
5. Clique em **Testar conexao** para validar Client ID + Secret

> O **Verify Token** e apenas um handshake publico de setup. A seguranca real do webhook vem do HMAC SHA-256 com o **App Secret**. Por isso o Robo MultiPost aceita o valor padrao `multipost` — zero config para voce. Se quiser personalizar, preencha o campo.

---

## Passo 3 — Configurar Webhook (1 clique)

Apos salvar Client ID + Client Secret no Passo 2, ainda no card **Facebook / Instagram / Threads** aparecera o botao:

**Configurar webhook Instagram na Meta**

Clicando nele, o Robo MultiPost:
1. Gera um App Access Token (`{client_id}|{client_secret}`)
2. Chama `POST https://graph.facebook.com/v20.0/{app_id}/subscriptions` com:
   - `object=instagram`
   - `callback_url=https://SEU-DOMINIO/public/ig-webhook`
   - `verify_token=multipost`
   - `fields=comments,messages`
3. A Meta faz o handshake GET no endpoint e, se validar, o webhook fica ativo

**Nao precisa abrir o Meta Developer Portal** para configurar webhook.

> **Desenvolvimento local**: a Meta exige callback URL publica com HTTPS. Use [ngrok](https://ngrok.com) (`ngrok http 3000`) e configure `FRONTEND_URL=https://xxx.ngrok.io` no `.env` antes de clicar no botao.

### Fallback manual (se preferir)

Se quiser configurar na mao, va em **Meta Developer Portal > Products > Webhooks > Instagram**:

| Campo | Valor |
|---|---|
| **Callback URL** | `https://SEU-DOMINIO/public/ig-webhook` |
| **Verify Token** | `multipost` |
| **Subscribed Fields** | `comments`, `messages` |

A tela **Automacoes** do Robo MultiPost mostra esses valores prontos para copiar.

---

## Passo 4 — Conectar (ou reconectar) Instagram

O scope `instagram_manage_messages` foi adicionado recentemente. Contas conectadas antes dessa versao precisam ser **reconectadas** para o Robo MultiPost ter permissao de enviar DMs.

1. Acesse **Canais**
2. Remova o canal Instagram atual (se existir)
3. Clique em **Adicionar canal** e selecione **Instagram**
4. Complete o fluxo OAuth — o Meta pedira as novas permissoes

---

## Passo 5 — Criar sua primeira automacao

1. Acesse **Automacoes** no menu lateral
2. Clique em **Nova Automacao**
3. Preencha:
   - **Nome**: ex: "Responder PROMO"
   - **Conta Instagram**: selecione a conta conectada no Passo 4
4. Clique em **Criar**

Voce sera redirecionado para o editor visual.

### Montando o fluxo

Arraste nos do sidebar para o canvas e conecte-os:

| No | Funcao |
|---|---|
| **Inicio** (Trigger) | Disparado quando alguem comenta em um post monitorado |
| **Condicao** | Verifica palavras-chave no comentario (suporta `qualquer`/`todas`/`contem`) |
| **Responder Comentario** | Responde no comentario original (use `{{nome}}` para citar o usuario) |
| **Enviar DM** | Envia mensagem direta ao comentarista |
| **Atraso** | Aguarda X segundos/minutos antes do proximo no |

**Exemplo basico:**

```
Inicio -> Condicao (palavra="PROMO") -> Responder Comentario -> Atraso (5s) -> Enviar DM
                                    -> (nao combina) -> (sem acao)
```

### Escopo do gatilho (modos de acionamento)

No wizard "Nova Automacao Rapida" voce escolhe em qual post a automacao vai rodar:

| Modo | Comportamento |
|---|---|
| **Uma publicacao ou reel especifico** | Seleciona um ou mais posts ja existentes no feed e a flow so dispara neles |
| **Qualquer publicacao ou reel** | Dispara em todos os posts atuais e futuros da conta |
| **A proxima publicacao que eu fizer** | A flow fica pendente ate o proximo feed ou reel da conta ser publicado. Nesse momento ela se vincula *apenas* aquele post e converte para o modo "especifico". Stories nao sao suportados — se o proximo post for um story ele sera ignorado e a flow continua pendente ate chegar um feed/reel. **One-shot**: para cobrir o proximo post depois desse, crie outra flow. Funciona tanto para posts publicados pelo Robo MultiPost quanto direto no app do Instagram, Creator Studio ou Meta Business Suite |

> Se voce criar multiplas flows em modo "Proxima publicacao" para a mesma conta, todas serao vinculadas simultaneamente ao mesmo proximo post — cada uma com suas proprias palavras-chave e mensagens.

### Variaveis disponiveis

- `{{nome}}` — nome de usuario do comentarista
- `{{comentario}}` — texto original do comentario

### Salvar e ativar

1. Clique em **Salvar** para persistir o canvas
2. Clique em **Ativar** — o sistema ira:
   - Validar que o fluxo tem pelo menos 1 Inicio e 1 acao
   - Inscrever automaticamente a Pagina do Facebook no webhook da Meta
   - Mudar o status para **Ativo**

---

## Passo 6 — Testar

1. Acesse o Instagram (conta DIFERENTE da que esta conectada) e comente em um post da conta monitorada
2. Em alguns segundos:
   - O comentario recebe a resposta automatica
   - O comentarista recebe a DM
3. Volte ao Robo MultiPost > Automacoes > sua automacao > **Historico**
4. Voce vera a execucao com status **COMPLETED** e log de cada no executado

---

## Como funciona por dentro

### Multi-tenancy do webhook

O Meta envia eventos para **uma unica URL** (`/public/ig-webhook`). Como saber a qual perfil/workspace pertence cada evento?

1. O payload do webhook contem `entry[].id` = ID da Pagina do Facebook
2. Na tabela `Integration` temos esse ID em `internalId` ou derivado de `rootInternalId`
3. O Robo MultiPost busca a integracao correspondente -> descobre org + perfil
4. Carrega a credencial `facebook` desse org/perfil
5. Valida o HMAC SHA-256 do payload com o `Client Secret` dessa credencial
6. Se bater, dispara o workflow Temporal

Se a credencial nao existir, o sistema cai no **fallback** das variaveis de ambiente globais:
- `FACEBOOK_APP_SECRET`
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`

### Inscricao automatica no webhook

Ao **ativar** um flow, o `FlowsService` chama `InstagramProvider.ensureWebhookSubscription()`:

1. Usa o **Page Access Token** (armazenado em `Integration.token`) para chamar `GET /me?fields=id` -> obtem Page ID
2. Chama `POST /{pageId}/subscribed_apps?subscribed_fields=feed` com o mesmo token
3. Se falhar (ex: scope ausente), o flow ainda e ativado — o aviso vai para o log

### Execucao durable via Temporal

Cada comentario dispara um workflow Temporal (`flowExecutionWorkflow`):

- **taskQueue**: `main`
- **retry**: 3 tentativas com backoff
- **timeout**: 5 minutos
- **idempotencia**: garantida pelo `workflowId = flow-exec-{flowId}-{commentId}` (Temporal rejeita duplicatas)

Os nos `Atraso` usam `sleep()` nativo do Temporal — durable, sobrevive a restart do worker.

---

## Variaveis de ambiente (fallback opcional)

Se voce **nao** quiser configurar credenciais por perfil, defina globalmente no `.env`:

```env
FACEBOOK_APP_SECRET="seu-app-secret"
INSTAGRAM_WEBHOOK_VERIFY_TOKEN="seu-verify-token"
```

Essas vars so sao usadas como fallback quando nao ha credencial cadastrada na UI. A recomendacao e usar a tela de credenciais — mais flexivel e suporta multi-tenancy.

---

## Debug

### Webhook nao chega
- Painel Meta > Webhooks > **Recent Deliveries**: ve os POSTs enviados e as respostas
- Confira se o `Verify Token` no Meta e identico ao salvo em **Credenciais** (case-sensitive)

### Recebo 403 "Invalid signature"
- O `Client Secret` cadastrado em **Credenciais** nao bate com o App Secret do app Meta
- Regere o App Secret no painel Meta e atualize em **Credenciais**

### Flow nao ativa
- Verifique o log do backend — a validacao exige ao menos 1 no `Inicio` e 1 no de acao (`Responder` ou `DM`)

### Reply/DM falha
- Token expirado: reconecte o Instagram em **Canais**
- Scope `instagram_manage_messages` ausente: reconecte o Instagram

### Execucao fica em RUNNING eternamente
- Worker Temporal nao esta rodando — verifique se `pnpm dev` subiu o `apps/orchestrator`
- Acesse Temporal UI em `http://localhost:8233` para ver detalhes do workflow

### Logs uteis
```bash
# Backend
pnpm dev-backend

# Procure por:
# - "Webhook subscription ensured for integration <id>"
# - "handleIncomingComment" disparado
# - Erros de HMAC em "Invalid signature"
```

---

## Limitacoes conhecidas

- O Instagram so permite DM para **usuarios que ja interagiram com a conta** nas ultimas 24h (comentar conta como interacao)
- Permissoes `instagram_manage_messages` requerem **App Review** para uso em producao com contas que nao sao testers
- Meta tem rate limit de ~200 chamadas/hora por usuario — o Temporal cobre falhas transientes com retry
- Delays muito longos (dias/semanas) funcionam, mas aumentam o ciclo de vida do workflow no Temporal

---

## Gatilho: Resposta ao story

A partir desta versao, alem do gatilho classico "comentario em publicacao" (feed/reels), o sistema suporta um gatilho paralelo para **respostas e reacoes a stories**.

### Diferencas para o gatilho de comentario

| Aspecto | Comentario em publicacao | Resposta ao story |
|---|---|---|
| Canal do gatilho | Webhook `comments` / `feed` | Webhook `messages` com `reply_to.story` |
| Resposta publica | REPLY_COMMENT (threaded reply) + DM (private reply) | **Somente DM** — stories nao tem area de comentario publico |
| DM usada | `recipient: { comment_id }` (private reply, limite 1 por comentario) | `recipient: { id: <igScopedUserId> }` (DM direta na janela de 24h) |
| Reacoes emoji | Nao aplicavel | Disparam a automacao se `matchReactions=true` |
| "Proxima publicacao" | Vincula ao proximo feed/reel | Vincula ao proximo story |

### Como criar

Na listagem de automacoes, clique **+ Nova Automacao**. O popup mostra uma sidebar com dois gatilhos:

1. **Comentario em publicacao** — wizard classico, ja existente.
2. **Resposta ao story** — novo wizard com preview vertical (9:16), tabs `Story | DM` e os campos especificos abaixo.

Campos do wizard de story:

- **Quando alguem responder**: `qualquer story` | `story especifico` (ID visivel no Meta Business Suite) | `proximo story` (bind lazy ao primeiro story publicado apos a criacao da flow).
- **E essa resposta contem**: `qualquer palavra-chave ou reacao` | `palavras ou reacoes especificas`.
- **A DM com o link sera enviada**: textarea livre + botao opcional via modal **Adicionar um link** (texto + URL).
- **Outros recursos**:
  - `Responder reacoes nos stories` (default ON) — emoji reactions contam como gatilho.
  - `Pedir para seguir antes de enviar` (default OFF) — flag persistida; a verificacao de follow sera implementada em uma feature futura.

### Fluxo tecnico

```
[Usuario responde ao story no app do Instagram]
  ↓ Meta envia webhook messages → entry.messaging[] (ou changes[field=messages])
[ig-webhook.controller] detecta `reply_to.story.id` (ou `story_mention` attachment, ou `reaction.story_id`)
  ↓ despacha flowsService.handleIncomingStoryReply
[FlowsService]
  ↓ filtra flows com TRIGGER.label='story_reply'
  ↓ lazy-bind de flows em `next_publication` para o storyId atual
  ↓ matching: storyIds vs igStoryId + keyword/reaction
  ↓ cria FlowExecution com triggerType='story_reply' e igMessageId
  ↓ dispara Temporal flowExecutionWorkflow
[flow.execution.workflow] percorre grafo e acumula mensagens em ctx.dmMessages
  ↓ ao final, chama sendStoryDirectMessage (instagramProvider.sendDM → recipient:{id})
```

### Idempotencia

A execucao de flow para story usa `igMessageId` como chave de idempotencia (em vez de `igCommentId`). Retries do webhook nao disparam a automacao duas vezes.

### Limitacoes (stories)

- **One-shot** do modo "proximo story": igual ao comment, ao vincular ao primeiro story publicado, a flow passa para `specific` com aquele ID. Se quiser cobrir o proximo proximo, crie outra flow.
- **`requireFollow`** ainda nao aplica filtro — a configuracao e salva mas a verificacao via Graph API sera adicionada depois.
- **DM direta sem `reply_to.story`** e ignorada pelo webhook controller (fora do escopo deste gatilho — futuro gatilho `dm_direct`).
- **Janela de 24h**: a DM so sai se o usuario tiver interagido (resposta ao story conta como interacao e abre a janela).

---

## Configuracao de Messaging Tokens (obrigatorio para DM de story)

A automacao de story envia a resposta via **Send API** do Meta, que exige um token de messaging separado do token usado para postagem. O Robo MultiPost aceita duas opcoes, com prioridade automatica (System User Token se configurado, senao cai no token por conta).

Ambas as opcoes exigem que o app Meta esteja em **Live Mode** (Meta Developer Portal > Settings > Basic > App Mode: Live). Isso nao exige App Review — so requer Privacy Policy URL, categoria e Terms of Service configurados no app.

### Opcao A — Meta System User Token (recomendado)

Vantagens:
- **Nao expira** (escolhendo "Never" na geracao).
- **1 token cobre todas as contas** do mesmo Business Manager.
- **Zero refresh, zero manutencao.**

Como gerar:

1. Acesse `https://business.facebook.com/settings/system-users`
2. Se nao tiver um System User, clique em **Add** e crie um com role Admin (ou Employee com permissoes adequadas).
3. No System User criado, clique em **Add Assets** e adicione as Pages cujas contas Instagram Business voce quer automatizar (o Instagram Business esta vinculado a uma Page).
4. Volte pro System User e clique em **Generate New Token**:
   - App: o seu app Meta
   - Expiration: **Never**
   - Permissions: selecione pelo menos `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_messaging`, `pages_read_engagement`, `pages_show_list`, `business_management`
5. Copie o token (Meta so mostra 1 vez — salve num lugar seguro temporariamente).
6. No Robo MultiPost, va em **Settings > Credenciais > Instagram > Tokens de Messaging > Meta System User Token** e cole o token no campo.
7. Clique em **Validar e salvar**. O backend chama `/me` e `/me/accounts` no Graph API pra confirmar que o token e valido e mostra o business name + contas conectadas.

Com isso feito, **todas** as automacoes de story passam a funcionar imediatamente. O token nao precisa ser atualizado ate o admin revogar no Meta Dashboard.

### Opcao B — Instagram User Access Token por conta

Vantagens:
- Nao precisa de Business Manager estruturado.
- Funciona pra 1 conta ou varias (1 entrada por conta).

Desvantagens:
- Token dura **60 dias** por padrao — precisa renovacao.
- **Renovacao e automatica** (feita pelo Robo no momento do uso quando o token tem mais de 24h de idade e menos de 58 dias), entao **sob uso regular nao incomoda**.
- Sob inatividade > 60 dias, o token expira e e preciso gerar um novo manualmente.

Como gerar:

1. Meta Developer Portal > seu app > **Instagram API setup with Instagram business login** (no sidebar, dentro do produto Instagram).
2. Na secao **Generate access tokens**, clique em **Add or remove Instagram accounts** e adicione a conta IG Business que quer automatizar.
3. Ao lado da conta, clique em **Generate token** — Meta abre uma janela de consentimento e retorna um **long-lived Instagram User Access Token** (60 dias).
4. Copie o token.
5. No Robo MultiPost, va em **Settings > Credenciais > Instagram > Tokens de Messaging > Tokens por conta Instagram**.
6. Clique em **+ Adicionar conta**, cole o token e clique em **Validar e salvar**. O backend chama `graph.instagram.com/me` pra validar, captura o IG User ID e o username da conta, e salva com `refreshedAt = now`.
7. Repita pra cada conta IG que quer automatizar.

A partir dai, o Robo MultiPost renova o token automaticamente sempre que a automacao for disparada apos 24h da ultima renovacao. Voce nao precisa mexer.

### Como o Robo decide qual usar

```
No momento de enviar DM:
  1. Se metaSystemUserToken existe → usa ele (POST graph.facebook.com/{ig_user_id}/messages)
  2. Senao, procura entrada em instagramTokens com igUserId == integration.internalId
     → usa ela (POST graph.instagram.com/me/messages)
     → se age > 24h, faz refresh lazy antes de usar
     → se age > 58d, lanca erro "Token expirado"
  3. Se nenhum configurado, lanca "Messaging nao configurado"
```

O erro aparece no **Historico de execucoes** do flow e a UI do Story Wizard mostra um **banner amarelo** quando a integracao selecionada nao tem token valido.

### Escopos necessarios

| Opcao | Scopes exigidas |
|---|---|
| System User Token | `instagram_manage_messages` (legacy) OU `instagram_business_manage_messages` (nova) + `pages_messaging` + `instagram_basic` + `pages_read_engagement` |
| IG User Token | `instagram_business_basic` + `instagram_business_manage_messages` |

Os scopes sao selecionados no momento da geracao do token — revise o checklist acima antes de clicar "Generate".

### Erros comuns

- **"O app nao tem acesso avancado a permissao instagram_manage_messages"** → token foi gerado sem a scope de messaging, ou o app Meta ainda esta em Dev Mode. Regerar o token com a scope correta e confirmar que o app esta em Live Mode.
- **"Token expirado"** → IG User Token nao usado por > 60 dias. Gerar novo no Meta Dashboard e re-adicionar na tela de credenciais.
- **"Destinatario nao tem funcao no app"** → app ainda em Dev Mode. Mover para Live Mode ou adicionar o usuario como Instagram Tester temporariamente.
