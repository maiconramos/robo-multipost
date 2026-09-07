# Handoff para continuidade no Claude Code — Multipost

> Atualizado em 07/09/2026, após três canários reais do Temporal V112
> (dois Facebook, um Instagram) e o deploy da prerelease `v0.5.6-rc.12`.
> Repositório: `maiconramos/robo-multipost`.
> Workspace local: `/Users/maiconramos/Documents/workspace/ASL/robo-multipost`.

## 1. Como retomar sem perder contexto

1. Ler `AGENTS.md`, o `CLAUDE.md` da raiz e o `CLAUDE.md` mais próximo de cada
   arquivo que for alterado. Para a tarefa atual, ler também
   `libraries/nestjs-libraries/CLAUDE.md` por completo.
2. Não fazer merge integral do upstream Postiz. A estratégia aprovada é porte
   manual, pequeno e auditado, com uma PR por assunto.
3. Não imprimir, copiar para arquivos ou versionar tokens, refresh tokens,
   cookies, headers de autorização ou corpos crus de erro. Consultas de banco
   devem selecionar apenas metadados de credencial, nunca o valor.
4. Aplicar TDD: spec falhando primeiro, implementação mínima, suíte focal,
   suíte da área e builds consumidores.
5. Antes de qualquer mudança em produção, capturar o estado atual. Em incidentes
   Meta, não reconectar imediatamente: primeiro preservar `code`,
   `error_subcode`, integração, post, horário e workflow.

## 2. Estado exato do Git e trabalho ainda não commitado

- `main`/`origin/main`: `eda929fc` (`chore: pre-release v0.5.6-rc.12`).
- Tag no mesmo commit: `v0.5.6-rc.12`.
- A branch `codex/clear-stale-post-errors` foi mesclada pela PR #240
  (merge commit `58416302`) e a correção já está em produção.
- Arquivos que faziam parte daquela branch:
  - `libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts`;
  - `libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.spec.ts`;
  - `CHANGELOG.md`;
  - `docs/architecture/temporal-post-workflow-v112-migration.md`;
  - este arquivo de handoff.

Problema corrigido na branch: um post antigo que falhou, foi reagendado e depois
publicou com sucesso continuava com `Post.error` preenchido. Isso fazia o banco
carregar uma falha que já não representava o estado atual.

Decisão implementada:

- `PostsRepository.changeDate(..., action='schedule')` limpa `error`, junto com
  `releaseId` e `releaseURL`, ao iniciar uma nova tentativa;
- `PostsRepository.updatePost(...)` limpa `error` quando a publicação termina
  em `PUBLISHED`;
- `changeDate(..., action='update')` preserva o erro, pois uma simples edição de
  data não resolve uma falha vigente;
- a tabela append-only `Errors` não é apagada nem alterada. Ela continua sendo o
  histórico de auditoria;
- não foi feito backfill em massa dos posts antigos já publicados. Não fazer
  esse backfill sem decisão explícita.

Testes já executados nesta branch:

- RED comprovado: os dois testes novos falharam somente pela ausência de
  `error: null` nos dados enviados ao Prisma;
- spec focal após a correção: 9/9 testes passaram;
- todas as specs de posts: 8 suítes, 41 testes, todos passaram;
- biblioteca inteira:
  `pnpm jest --selectProjects nestjs-libraries --runInBand --no-coverage --forceExit`
  — 99 suítes, 962 testes, todos passaram;
- `pnpm build:backend` passou;
- `pnpm build:orchestrator` passou;
- `git diff --check` passou.

Observação: o Jest deixa handles conhecidos abertos ao final; por isso a suíte
integral foi executada com `--forceExit`. Não usar
`pnpm test:libs -- --runInBand`, pois nesse script o Jest interpreta os flags
após `--` como filtro de nome de teste. Também não rodar Prettier sobre o
`CHANGELOG.md` inteiro: o arquivo contém formatação histórica e isso gera um
diff grande e irrelevante. O ruído que ocorreu durante esta sessão já foi
revertido; o diff atual contém somente a mudança intencional.

Esta frente foi concluída em 07/09/2026:

1. PR #240 aberta, checks `anti-slop` e `build (22.12.0)` verdes, mesclada em
   `main` como `58416302`;
2. prerelease `v0.5.6-rc.12` criada, build multi-arch concluído e manifesto
   `:prerelease` publicado (`:latest` corretamente ignorado);
3. instância atualizada e `/app/version.txt` confirmado como `0.5.6-rc.12`;
4. correção validada em produção pelo canário 2 — ver seção 4.

## 3. Prerelease atualmente implantada

- Versão: `v0.5.6-rc.12`.
- Release: <https://github.com/maiconramos/robo-multipost/releases/tag/v0.5.6-rc.12>
- Workflow de build:
  <https://github.com/maiconramos/robo-multipost/actions/runs/34137769231>
- Prerelease anterior: `v0.5.6-rc.11`, usada no canário 1.
- Imagens AMD64 e ARM64 concluídas com sucesso.
- Manifesto versionado e tag `:prerelease` foram publicados.
- A tag `:latest` foi corretamente ignorada por se tratar de prerelease.
- A instância roda a partir da tag `:prerelease`; após o deploy,
  `/app/version.txt` confirmou `0.5.6-rc.12`.
- Aviso não bloqueante do GitHub Actions: algumas actions v4/v3 estão sendo
  forçadas de Node 20 para Node 24. Tratar em PR de manutenção separado.

## 4. Canários reais do Temporal V112 — três aprovados

Todos no perfil Três Lagoas (`profileId=8aa94ed4-3c45-4f31-ba53-55d32c1474cf`,
`organizationId=1ee9556c-5979-447f-9a61-d4fb41c0a416`), todos criados como
`postWorkflowV112`, todos `COMPLETED` na tentativa 1.

### 4.1. Canário 1 — Facebook, `0.5.6-rc.11`

- integração: `cmsd86h9y000jpf9onxne6b8m` (Facebook — Três Lagoas);
- `Post.id`: `cmsn9ns3q0060pf9ojakudd0e`;
- workflow `post_cmsn9ns3q0060pf9ojakudd0e`, run `01a07c40-7774-7240-bfc7-273967107939`;
- `2026-09-07T14:23:14.804Z` → `2026-09-07T14:31:05.611Z`.

### 4.2. Canário 2 — Facebook, `0.5.6-rc.12`

- `Post.id`: `cmsnaauip0063pf9ouojo6okz`, publicado `2026-09-07 15:55:59` UTC;
- workflow `post_cmsnaauip0063pf9ouojo6okz`, run `01a07c91-9939-7a4e-b035-99bd0e45e3ad`;
- `15:51:51.865` → `15:56:04.316`; timer de 246,911 s; mutação em 3,98 s;
- `releaseId=157055657492765_122240368964110468`.

Este é o canário que validou a correção da rc.12. O post tinha uma falha real
registrada em `Errors` em `2026-09-06 17:01:01.667`; foi reagendado, publicou e
terminou com `hasCurrentError=f`, com a linha histórica de `Errors` preservada.
`changeState(id, 'ERROR', err, body)` grava `Post.error` e insere a linha de
`Errors` na mesma chamada, então a existência daquela linha prova que
`Post.error` estava preenchido antes do reagendamento.

### 4.3. Canário 3 — Instagram via Facebook Login, `0.5.6-rc.12`

- integração: `cmshir6830020pf9ou3oumqef` ("Tres Lagoas Residencial",
  `providerIdentifier=instagram`), reconectada em `14:22:36` no mesmo dia;
- `Post.id`: `cmsnabkcg0066pf9onxy6p7tg`, publicado `2026-09-07 16:48:59` UTC;
- workflow `post_cmsnabkcg0066pf9onxy6p7tg`, run `01a07cc3-cb38-7ecd-894b-0212373abe54`;
- `16:46:41.464` → `16:49:40.912`; timer de 137,303 s; mutação em 41,1 s;
- `releaseId=17985720534106294`, <https://www.instagram.com/p/Dc_k-q1jLMM/>;
- `Errors` para esse post: 0 linhas; `Integration.updatedAt` permaneceu
  `14:22:36`, anterior à publicação.

### 4.4. Evidência transversal

- `postSocialPending` com `maximumAttempts: 1` nos três históricos; as demais
  activities, que só tocam o banco do produto, com `maximumAttempts: 3`;
- mutação e plugs nas filas `facebook`/`instagram`; suporte na fila `main`; o
  workflow sempre iniciado em `main`;
- 32 payloads por histórico decodificados e inspecionados por chave e por valor,
  `forbiddenCount = 0` nos três; `postSocialPending` recebe `integrationId` como
  referência e nunca o token; nenhum payload carrega campo `error`;
- o Instagram publica em duas etapas, o que explica os 41,1 s de mutação. É o
  provider com a maior janela entre início da mutação e confirmação.

Cuidado ao auditar históricos exportados pela UI do Temporal: o export já entrega
`payloads[].data` decodificado como JSON. Aplicar base64 por cima produz lixo e
um `forbiddenCount = 0` falso. O campo `metadata.encoding` é que vem em base64.

Não remover ainda o gate por integração. Não ativar `POST_WORKFLOW_V112_ALL=true`.

## 5. Próxima sequência do rollout V112

Documento normativo:
`docs/architecture/temporal-post-workflow-v112-migration.md`.

Runbook de replay:
`docs/operations/temporal-post-workflow-replay.md`.

Estado técnico já entregue pelas PRs:

- PR #235: ADR da migração V102 -> V112;
- PR #236: saúde separada das filas de workflow/activity;
- PR #237: harness de replay V101/V102/V112;
- PR #238: bundle de replay portátil;
- PR #239: contratos, activities, workflow V112 e gates opt-in.

Regras que não podem regredir:

- V101/V102 continuam registrados para replay de históricos;
- V112 é usado apenas para workflows novos selecionados pelo gate;
- uma mutação externa tem `maximumAttempts: 1`;
- timeout depois do início da mutação é resultado não confirmado, não licença
  para publicar novamente;
- tokens são recarregados/descriptografados apenas dentro das activities;
- payloads do workflow não podem carregar credenciais ou erro bruto;
- Zernio continua fixado na V102/fila `main` nesta fase;
- perfis cancelados, recorrência, aprovação e flows do Instagram devem continuar
  respeitados.

Próximos gates práticos:

1. ~~observar por pelo menos um ciclo operacional adicional o Facebook Três
   Lagoas já no V112~~ — concluído (canário 1);
2. ~~fazer um segundo post Facebook controlado e verificar post, integração,
   `Errors` e histórico Temporal~~ — concluído (canário 2);
3. ~~selecionar um Instagram saudável conectado via Facebook Login para o
   próximo canário e repetir a inspeção de segredos~~ — concluído (canário 3);
4. **pendente:** um segundo agendamento real no Instagram, para que o critério
   de encerramento da seção 9 ("mais de um agendamento") valha também para esse
   provider;
5. testar separadamente Instagram Standalone, LinkedIn, Pinterest, Google Meu
   Negócio e WordPress quando houver contas reais disponíveis;
6. só depois considerar o gate por provider. Com Facebook e Instagram fechados,
   a troca natural é de `POST_WORKFLOW_V112_INTEGRATION_IDS` para
   `POST_WORKFLOW_V112_PROVIDERS=facebook,instagram`, que passa a valer para
   todos os perfis desses providers e não só para o Três Lagoas;
7. deixar o gate global para o final e manter rollback pela remoção dos gates de
   novas execuções, sem terminar em massa workflows já iniciados.

Operacional do gate, verificado no código em 07/09/2026:

- `POST_WORKFLOW_V112_INTEGRATION_IDS` é CSV com `trim`, avaliado em
  `selectPostWorkflowVersion` (`libraries/nestjs-libraries/src/temporal/post-workflow-version.ts`);
- o gate é lido quando o workflow é **iniciado**, e o workflow é iniciado quando
  o post é salvo/agendado (`posts.service.ts`, `startWorkflow`), não na hora de
  publicar. Trocar a variável depois de agendar não muda a versão de um workflow
  que já está esperando no timer;
- cada canal é uma `Integration` própria: o id do Facebook não cobre o Instagram
  do mesmo perfil;
- a fila é `providerIdentifier.split('-')[0].toLowerCase()` e os workers das
  filas de provider são criados automaticamente em `temporal.module.ts`. Não é
  preciso criar worker nem mexer em `EXCLUDE_QUEUE` para habilitar um provider.

## 6. Triagem cirúrgica do Postiz — estado consolidado

Fontes principais:

- `docs/planning/upstream-sync-triage-2026-08.md`;
- `docs/planning/upstream-head-refresh-2026-09-03.md`;
- auditorias individuais em `docs/planning/*-upstream-audit-2026-09.md`.

Fotografia mais recente verificada nesta sessão:

- última tag estável do upstream: `v2.23.0` (`1e4c8dd5`);
- `upstream/main`: `36d5fc7b`;
- em 07/09/2026 não havia commit novo desde a fotografia de 03/09;
- nunca fazer `git merge upstream/main` neste fork;
- `release` continua fora do rollout até smoke/decisão explícita.

Portes aceitos e já mesclados:

| Bloco | PR | Estado relevante |
| --- | ---: | --- |
| Triagem inicial | #201 | estratégia cirúrgica registrada |
| Baseline/CI prerelease | #202 e #205 | dependências do frontend e CI saneados |
| Upload/path traversal/limite | #207 | P0 concluído |
| Meta Graph v25 + Insights + Story | #208 | código concluído; smoke real ainda é gate |
| SSRF/DNS-pinning cumulativo | #209 | proteção Axios/Undici/providers/webhooks |
| LinkedIn | #212 | concluído; smoke real pendente |
| Pinterest | #213 | concluído; smoke real pendente |
| Google Meu Negócio | #214 | concluído; smoke real pendente |
| WordPress conexão | #215 | concluído; smoke real pendente |
| WordPress status/categorias/tags | #216 | concluído; smoke real pendente |
| Analytics de providers | #217 | concluído; smokes reais pendentes |
| YouTube/TikTok media identity | #219 | auditado como não aplicável isoladamente |
| Auth por e-mail | #220 | código concluído; auditoria de duplicatas legadas pendente |
| DTO de posts estrito | #223 | concluído com compatibilidade de dados antigos |
| Republicação explícita | #224 | concluído; gate no backend/API e UI |
| MCP stateless | #225 | concluído preservando escopo por perfil/OAuth |
| Erros do gerador | #226 | concluído |
| Falhas Kie.ai | #227 | concluído |
| Dependências de segurança | #228 | concluído |
| Correção da triagem de links X | #229 | não portar código morto |
| Payload Temporal limitado | #230 | concluído |
| Workers de provider activity-only | #231 | concluído |
| Refresh da triagem | #232 | upstream atualizado e classificado |
| Temporal V112 | #235 a #239 | base concluída; rollout real em andamento |

Itens que continuam deliberadamente fora:

- merge integral do upstream;
- TikTok Business sem decisão de produto/credenciais;
- onboarding/MCP visual do Postiz Cloud (`4f296fc0`, `c9382d98`);
- SaaS, billing, telemetria e administração cloud do Postiz;
- remoção automática de links do X, pois a feature base não existe no fork;
- leitura de mídia YouTube/TikTok do pipeline pending sem adotar o épico que a
  utiliza;
- streaming/pending de todos os providers em bloco;
- ativação global do V112 antes dos smokes reais.

O próximo trabalho do Postiz não é outro cherry-pick: é terminar os smokes e o
rollout gradual do V112. Antes de procurar novas atualizações, fazer `git fetch
upstream` e comparar a cabeça com `36d5fc7b`; se não mudou, não repetir a
triagem.

## 7. Incidente de desconexões Meta — Media Solomo

### 7.1. Contexto confirmado

O usuário do Facebook que fez várias conexões originais foi banido pela Meta.
As publicações passaram a falhar com:

- `OAuthException`;
- `code=190`;
- `error_subcode=464`;
- mensagem: sessões não permitidas porque o usuário não é confirmado.

Isso não é um simples erro de permissão da Página. O texto genérico do SDK
(`account is missing some permissions`) escondia a causa real presente no corpo
da Meta. Também houve casos `190/460`, que pertencem à mesma família de sessão
humana inválida.

O banco sozinho não informa de qual pessoa veio um token criptografado. O que é
possível afirmar sem expor o segredo é: integração, provider, timestamps,
presença/formato criptografado, flags de saúde e erro Meta associado. A origem
humana/sistema precisa ser validada pela Meta ou inferida de uma cura registrada
nos logs, não pelo conteúdo visual da coluna.

### 7.2. Correções de produto já existentes em `main`

- erros Meta `190/460` e `190/464` marcam o canal para reconexão;
- perfis cancelados deixam de alimentar Status e rotinas automáticas;
- excluir perfil encerra integrações, posts futuros, autopost, repost, webhooks,
  flows e workflows vinculados;
- UI tem `Forçar reconexão`, inclusive antes de `refreshNeeded`;
- providers Meta com `noNativeRefresh=true` não são mais desconectados pelo cron
  apenas porque o stub de refresh não devolveu token;
- `MetaSystemUserService.resolveHealedToken` tenta rederivar um Page Access Token
  pelo Token de Usuário do Sistema antes de desconectar em uma falha real;
- o token de Usuário do Sistema pode vir das credenciais do perfil/Default ou do
  fallback da instância `META_SYSTEM_USER_TOKEN`;
- o campo de palavras-chave das automações já aceita vírgula digitada.

O fallback de Usuário do Sistema não torna válido o token humano banido. Ele só
funciona quando o Usuário do Sistema, o app e a Página/Instagram estão
corretamente relacionados e os ativos/escopos foram concedidos; então o app
rederiva um token de Página saudável.

### 7.3. Perfis/casos conhecidos

- Construtora Itajaí: `refreshNeeded` foi preparado no banco, o usuário
  reconectou e a publicação funcionou.
- Três Lagoas: passou por reconexões anteriores; houve erros que depois não se
  repetiram ao reagendar. Agora o Facebook é o primeiro canário V112 e publicou
  normalmente em 07/09.
- Alambari: Facebook publicou; Instagram falhou com `190/464` em um teste
  anterior.
- Grec: Instagram também apresentou falha.
- Mega Steel e Moradas da Barra: tiveram falhas Facebook/Instagram em dias
  posteriores às reconexões; devem ser observados na versão atual antes de nova
  conclusão.
- Vibrare: problema externo no Business Manager do cliente. Deixar pendente e
  fora do diagnóstico do app até a BM ser corrigida.
- Incorporadora | ATIVO 177: cliente cancelado e perfil excluído. Ignorar; se
  reaparecer no estado atual do Status, tratar como regressão de filtro, não
  reconectar.
- Bruna: acesso ao app Meta resolvido após validar o cadastro na página do app.
  Não há ação de código pendente nesse tópico.

### 7.4. Procedimento para a próxima queda

Se um canal cair de novo, não reconectar antes desta coleta:

1. anotar nome do canal, `Integration.id`, `Post.id`, horário BRT/UTC, provider e
   se o erro apareceu no post, no Status ou por e-mail;
2. no banco principal, ler apenas:
   `id`, `name`, `providerIdentifier`, `profileId`, `disabled`,
   `refreshNeeded`, `refreshError`, `refreshErrorAt`, `updatedAt`, presença e
   tamanho de `token`/`refreshToken`; nunca selecionar o valor;
3. ler o post: `state`, `publishDate`, `updatedAt`, `releaseId`, `releaseURL` e
   uma versão sanitizada/classificada de `error`;
4. procurar a linha correspondente em `Errors` e comparar `createdAt` com a
   execução atual para não confundir falha antiga com falha nova;
5. consultar o workflow pelo ID `post_<Post.id>` e registrar tipo, run ID,
   status, início/fim e a activity que falhou;
6. nos logs do backend/orchestrator procurar pelo ID e pelos marcadores
   `[meta-system-user]`, `heal falhou`, `OAuthException`, `190`, `460`, `464` e
   `Refresh returned no access token`;
7. confirmar se houve tentativa de self-heal e por que ela falhou: ausência de
   credencial, ativo não atribuído, app incompatível, escopo ausente ou rejeição
   da Graph;
8. somente depois decidir entre republicar, forçar reconexão ou corrigir o
   Usuário do Sistema/BM.

Uma publicação posterior bem-sucedida sem reconexão prova que o token usado
naquela execução estava funcional, mas não prova que o aviso anterior era novo.
Sempre comparar timestamps e `Errors`; esse detalhe explicou o canário de hoje.

### 7.5. Consultas seguras de referência

Adaptar os identificadores, sem selecionar as colunas de token:

```sql
SELECT
  id,
  name,
  "providerIdentifier",
  "profileId",
  disabled,
  "refreshNeeded",
  "refreshError",
  "refreshErrorAt",
  "updatedAt",
  token IS NOT NULL AS "hasToken",
  length(token) AS "tokenLength",
  "refreshToken" IS NOT NULL AS "hasRefreshToken"
FROM "Integration"
WHERE id = '<integration-id>';
```

```sql
SELECT
  id,
  state,
  "publishDate",
  "updatedAt",
  "releaseId",
  "releaseURL",
  error IS NOT NULL AS "hasCurrentError"
FROM "Post"
WHERE id = '<post-id>';
```

```sql
SELECT id, "postId", platform, "createdAt"
FROM "Errors"
WHERE "postId" = '<post-id>'
ORDER BY "createdAt" DESC;
```

Não guardar fingerprint/hash do token no repositório. Se a identidade do token
precisar ser confirmada, usar uma ferramenta oficial da Meta numa sessão segura
e registrar no diagnóstico somente metadados não secretos: app ID, user/system
user ID, validade, escopos e `data_access_expires_at`.

## 8. Consoles de produção já abertos no navegador

- container Multipost:
  <https://painel.solomo.com.br/#!/2/docker/containers/ab3944854d133c49c38e3de2eb470d021d07e819137f84aee433a98845d065ef/exec>
- PostgreSQL do Multipost:
  <https://painel.solomo.com.br/#!/2/docker/containers/71c3e77771c2e0423a2c26e77e2832716a16ae837cf20a9a910af63cc1051ebb/exec>
- container/console Temporal:
  <https://painel.solomo.com.br/#!/2/docker/containers/449f80afe1453e281b66c5bb7d9f4d4c796170258de74bef0ba740387400d023/exec>
- PostgreSQL do Temporal:
  <https://painel.solomo.com.br/#!/2/docker/containers/a9b0d90e402f8bac53cb0926901d89f41d226145a22da4f8ed6af382fa860a32/exec>

Os consoles foram usados para leitura/diagnóstico. Não presumir que continuam
autenticados em outra sessão. Confirmar o alvo e fazer somente consultas
read-only até o estado estar documentado.

## 9. Critério de encerramento desta frente

Esta frente só estará concluída quando:

- ~~a correção de `Post.error` estiver revisada, mesclada e, se necessário,
  presente numa prerelease~~ — concluído: PR #240 mesclada e `v0.5.6-rc.12`
  implantada;
- Facebook e Instagram passarem por mais de um agendamento real no V112 sem
  duplicidade, vazamento de credencial ou desconexão indevida — Facebook com
  dois agendamentos, Instagram com um; falta o segundo do Instagram;
- cada expansão de provider tiver smoke real registrado;
- uma eventual nova queda Meta tiver evidência coletada antes da reconexão e
  causa classificada entre token humano morto, falha do System User/BM, erro do
  provider ou estado antigo da UI/banco;
- somente então houver decisão explícita sobre gate por provider ou promoção
  global.
