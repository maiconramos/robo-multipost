# Triagem cirúrgica do upstream Postiz — agosto de 2026

> Data da análise: 28/08/2026
> Branch de trabalho: `codex/upstream-triage-v2.23.0`
> Base do fork (`main`): `c9d5b56ee28669619da405b0f6d7b6cf7a146bcd`
> Espelho local (`postiz`): `e3b3b82faee0000b5e637ab0e4cbfe8774c27c23`
> Última versão publicada pelo upstream: `v2.23.0` (`1e4c8dd5`)
> Cabeça do upstream analisada: `0f1647f7491a217d43eb5ae7a480484bdf0aff3e`

> Atualização de execução em 02/09/2026: o espelho `postiz` foi avançado para
> `db1a49e2` (mesma cabeça de `upstream/main`). Não surgiu nova tag estável.
> A baseline de CI foi saneada na PR `#205`, e o primeiro porte P0 foi
> concluído e incorporado pela PR `#207`. O segundo porte está isolado em
> `codex/upstream-meta-graph-v25`.

## 1. Decisão executiva

**Não fazer merge integral de `postiz` em `main`.** O risco de regressão é alto:

- `postiz..upstream/main`: 390 commits, 300 arquivos alterados e 27.993 adições;
- 137 desses arquivos também foram modificados pelo Robô MultiPost;
- o fork acumula 452 commits próprios desde a base `postiz`;
- as maiores sobreposições estão em providers Meta/X/LinkedIn, uploads/SSRF,
  `posts.service.ts`, `post.activity.ts`, workflows Temporal, autenticação e MCP;
- a `main` recebeu recentemente regras próprias de perfil, exclusão de recursos,
  reconexão Meta, criptografia de tokens, automações e isolamento multi-tenant.

O sync recomendado é um conjunto de portes manuais pequenos, cada um em PR
independente. A cadeia nova de publicação/Temporal deve ser tratada como um
épico isolado, nunca como cherry-pick ou merge em bloco.

## 2. O que exatamente saiu no Postiz

Há dois alvos diferentes e eles não devem ser confundidos:

| Alvo | Estado | Delta contra `postiz` | Decisão |
|---|---|---:|---|
| `v2.23.0` (`1e4c8dd5`, 04/08) | versão publicada | 293 commits; 218 sem merge; 259 arquivos | base estável da triagem |
| `upstream/main` (`0f1647f7`, 27/08) | desenvolvimento após a tag | +97 commits sobre `v2.23.0`; 70 sem merge | somente watchlist |

Desde o fechamento da triagem anterior em 07/06, a tag `v2.23.0` acrescenta
99 commits efetivos (sem contar merges). A cabeça atual acrescenta mais 70.

## 3. Prioridade P0 — portar agora, manualmente

### 3.1. Bloqueio de path traversal no servidor local de uploads

- **Upstream:** `79360622`.
- **Problema:** a rota monta o caminho com concatenação; `..` pode escapar de
  `UPLOAD_DIRECTORY`.
- **Estado do fork:** vulnerável. O fork adicionou `existsSync`, mas ainda usa
  `UPLOAD_DIRECTORY + '/' + path.join('/')` sem confinamento por `resolve()`.
- **Ação:** portar apenas a validação `resolve(base, requested)` + prefixo
  `base + sep`, preservando o 404 atual para arquivo inexistente.
- **Teste obrigatório:** caminho válido, `../`, segmentos URL-encoded, caminho
  irmão com prefixo semelhante e arquivo inexistente.
- **Execução em 02/09:** implementado manualmente no PR 1, ampliando o commit
  upstream com validação do caminho real para também rejeitar symlink interno
  que aponte para fora. O 404 para arquivo inexistente e diretório foi
  preservado.

### 3.2. Meta Graph API v25 + métricas novas do Facebook

- **Upstream:** `ce32dccb` e `3fab214f` (este último ainda está após a tag).
- **Problema:** o fork ainda dependia da Graph API v20 enquanto o upstream já
  havia adotado v25; várias métricas usadas pelo Facebook também deixaram de
  ser aceitas em produção em junho de 2026.
- **Estado do fork:** Instagram já usa v25 na maioria das rotas, mas Facebook
  continua em v20 e ainda solicita métricas antigas. Há também rotas de
  analytics/mensagens do Instagram em v21.
- **Ação:** criar uma constante compartilhada e migrar Facebook/Instagram
  linha a linha. Não aceitar as partes antigas do upstream que usam apenas
  `process.env`: preservar `ClientInformation`, credenciais por perfil e
  `resolveIgRoute`.
- **Teste obrigatório:** URLs de OAuth, listagem de páginas/BM, publicação
  feed/reel/story, erro 190/460/464 e analytics de página/post.
- **Execução em 02/09:** implementado manualmente em
  `codex/upstream-meta-graph-v25`, com constante compartilhada, Graph v25 em
  Facebook/Instagram/messaging/webhooks, métricas substitutas e polling de
  Story de vídeo. As suítes automatizadas e os builds passaram; a promoção
  continua condicionada ao smoke test real de publicação e analytics.

### 3.3. Limite de tamanho no upload por URL

- **Upstream:** `a21a7d4b` e `c96935a0`.
- **Problema:** o endpoint público pode baixar o corpo inteiro em memória e
  causar OOM; falha de rede também pode virar 500 em vez de 400.
- **Estado do fork:** há DNS-pinning, magic bytes e escopo por perfil, mas o
  corpo ainda passa por `response.arrayBuffer()` sem limite de download.
- **Ação:** portar o limite sem perder as três proteções do fork. O limite deve
  funcionar também quando o servidor remoto omite ou falsifica
  `Content-Length`.
- **Teste obrigatório:** imagem válida, MIME falso, `Content-Length` acima do
  limite, transferência chunked acima do limite, timeout/falha DNS e vínculo ao
  perfil da chave pública.
- **Execução em 02/09:** implementado manualmente no PR 1. Diferente do patch
  upstream, o limite autoritativo é contado durante o streaming e cancela a
  resposta assim que ultrapassa o teto, portanto também cobre corpo chunked ou
  `Content-Length` falso. Depois da detecção por magic bytes, o limite próprio
  do MIME é reaplicado. A chamada continua usando `isSafePublicHttpsUrl` +
  `ssrfSafeDispatcher`, mantém o quinto argumento `publicApiProfileId` de
  `MediaService.saveFile` e normaliza rejeição/timeout para HTTP 400. O caminho
  de ferramenta de agente citado pelo upstream não existe neste fork; não há
  segundo consumidor equivalente a portar.

### 3.4. Expandir DNS-pinning/SSRF para providers e webhooks reais

- **Upstream:** `db65072f`, `05b05fc5`, `1e4c8dd5` e `6c4a8ca4` (cumulativos).
- **Problema:** alguns caminhos validam a URL e depois fazem uma nova resolução
  DNS; chamadas Axios e downloads de mídia de providers não usam o dispatcher
  seguro.
- **Estado do fork:** `ssrfSafeDispatcher` já existe e protege upload público e
  webhooks próprios, mas não oferece o cliente Axios protegido nem cobre todos
  os providers do upstream.
- **Ação:** portar cumulativamente o helper Axios/Undici e revisar cada chamada.
  Proteção ligada por padrão; eventual opt-out para rede privada self-hosted
  precisa ser explícito e documentado.
- **Teste obrigatório:** IPv4/IPv6 privado, IP literal, DNS rebinding, redirect
  para IP privado, Axios e Undici, com e sem opt-out permitido.
- **Execução em 02/09:** implementado manualmente na PR 3 sobre o helper já
  existente do fork. Undici e Axios compartilham o mesmo lookup pinado; o
  `SocialAbstract`, o SDK do Bluesky, providers self-hosted, downloads de mídia,
  URLs intermediárias de upload e webhooks de saída foram cobertos. O opt-out
  `DISABLE_SSRF_PROTECTION=true` ficou explícito e documentado para redes
  self-hosted confiáveis, sem liberar upload/importação pública por URL. Foram
  adicionados testes de IPv4/IPv6, resposta DNS mista, rebinding, clientes
  Axios/Undici e isolamento do opt-out.

## 4. Prioridade P1 — alto valor, PRs separados

| Bloco | Commits | Veredito e cuidado principal |
|---|---|---|
| Facebook Story | `7edeadd5` | Adotar manualmente: reconhecer `upload_complete` evita polling preso. Preservar implementação própria de Stories. |
| Payload/Workers Temporal | `cc79e129`, `5b0288fd`, `6e1c103e` | Implementado em duas PRs isoladas. O limite de `ApplicationFailure` preserva os códigos Meta; os workers de provider agora são activity-only, com divisão/distribuição opcional e proteção contra exclusão da fila `main`. O fork mantém seus limites por provider e não traz o default de 1 milhão nem o pipeline novo. Ver [`temporal-failure-payload-upstream-audit-2026-09.md`](./temporal-failure-payload-upstream-audit-2026-09.md) e [`temporal-activity-workers-upstream-audit-2026-09.md`](./temporal-activity-workers-upstream-audit-2026-09.md). |
| LinkedIn | `b0c8da12`, `5daee690`, `c8d8de8b`, `84bee82b`, `db1f84ff`, `671946b5` | Implementado cirurgicamente em `codex/upstream-linkedin-provider`, incluindo os follow-ups `60ffa4df` e `c98ea046` e a dependência de HTTP Range. Preserva OAuth por perfil e SSRF; smoke test real ainda obrigatório. Ver [`linkedin-upstream-audit-2026-09.md`](./linkedin-upstream-audit-2026-09.md). |
| Pinterest | `5015dbb1`, `be413ec2`, `205f1b80` | Implementado cirurgicamente em `codex/upstream-pinterest-provider`, junto aos limites/falhas do polling e OAuth por perfil. Mantém SSRF e não traz o pipeline Temporal. Smoke real ainda obrigatório. Ver [`pinterest-upstream-audit-2026-09.md`](./pinterest-upstream-audit-2026-09.md). |
| Google Meu Negócio | `f700b8a1`, `1d965049` | Implementado cirurgicamente em `codex/upstream-google-business-provider`: rejeição/resposta inconclusiva não vira sucesso, e o porte integra credenciais por perfil e reconnect seguro do fork. Mantém Temporal e Zernio inalterados; smoke real ainda obrigatório. Ver [`google-business-upstream-audit-2026-09.md`](./google-business-upstream-audit-2026-09.md). |
| Analytics dos providers | `907e3399` | Implementado por helper dedicado nos seis providers. Remove retry/`BadBody` de publicação, mantém SSRF/DNS-pinning e preserva somente `RefreshToken` para renovação/self-heal do fork. Meta v25, host/token do Instagram e credenciais por perfil permanecem intactos. Ver [`provider-analytics-upstream-audit-2026-09.md`](./provider-analytics-upstream-audit-2026-09.md). |
| Leitura de mídia YouTube/TikTok | `5a9b1cc9` | Não aplicável à arquitetura atual: os helpers HEAD/Range corrigidos pertencem aos commits de streaming/pending-post que não estão no fork. YouTube usa stream Axios contínuo e TikTok usa `PULL_FROM_URL`. Reavaliar junto ao épico Temporal, nunca como patch isolado. Ver [`youtube-tiktok-media-identity-upstream-audit-2026-09.md`](./youtube-tiktok-media-identity-upstream-audit-2026-09.md). |
| WordPress | `3c7a6863`, `daffe5b4`, `d027d6f7` | Implementado em duas PRs: conexão/diagnóstico seguro e, separadamente, categorias/tags/status. Ambos preservam o fetch SSRF-safe e a compatibilidade com posts/canais antigos. `cc54137d` foi removido da cadeia por alterar apenas TikTok. Ver [`wordpress-connect-upstream-audit-2026-09.md`](./wordpress-connect-upstream-audit-2026-09.md) e [`wordpress-terms-upstream-audit-2026-09.md`](./wordpress-terms-upstream-audit-2026-09.md). |
| Auth por e-mail | `dbb48601`, `dcb1b018` | Implementado com busca case-insensitive para contas locais e impersonação, mais normalização de novos cadastros locais que faltava no fork. O email-lock dos convites e OAuth permanecem intactos. Auditar duplicatas legadas por caixa antes do deploy. Ver [`auth-email-upstream-audit-2026-09.md`](./auth-email-upstream-audit-2026-09.md). |
| DTO estrito | `c3de376f`, `cc54137d`, `40324535` | Implementado com rejeição de tipos inválidos na entrada e compatibilidade de execução para flags legadas em Instagram, LinkedIn, TikTok e X. UI, CLI e exemplos públicos já estavam conformes; o X preserva a omissão de opções falsas. Ver [`strict-post-dto-upstream-audit-2026-09.md`](./strict-post-dto-upstream-audit-2026-09.md). |
| Republicação explícita | `b6310364` | Implementado API-first com opt-in booleano estrito, default seguro para mudança de data e UI que informa canal/data/recorrência. Preserva a posição do `profileId` no serviço e, para posts publicados, só reinicia o Temporal após confirmação. Ver [`explicit-republish-upstream-audit-2026-09.md`](./explicit-republish-upstream-audit-2026-09.md). |
| Transporte MCP stateless | `e11477ee`, `7f8a8328` | Implementado cirurgicamente nos três endpoints HTTP, com descoberta OAuth limitada a `/mcp-oauth`. Preserva `runWithContext`, OAuth, chave por organização/perfil e SSE legado; testes cobrem cliente sem sessão, header de sessão antiga e os metadados RFC. Ver [`mcp-stateless-upstream-audit-2026-09.md`](./mcp-stateless-upstream-audit-2026-09.md). |
| Falhas de geração | `95f08f57`, `2de87c33`, `fe40b587`, `1785cf91`, `b12c03f3`, `9ef99bc4`, `88008142` | Implementado em duas adaptações isoladas: o gerador encerra NDJSON com erro controlado e recompõe chunks; o Kie possui timeout de socket, estados terminais estritos, mensagem sanitizada, `taskId` correlacionável e erro controlado no agente. `uploadFromUrl` não existe no fork e o helper OpenAI legado conflita com `AiImageService`. Ver [`generator-stream-errors-upstream-audit-2026-09.md`](./generator-stream-errors-upstream-audit-2026-09.md) e [`kie-video-errors-upstream-audit-2026-09.md`](./kie-video-errors-upstream-audit-2026-09.md). |
| Atualização de dependências | `8d23e5ed`, `7a02bd6b` | Implementada cirurgicamente com Next 16.3.1, mínimos Nest 11.1.21 e linhas corrigidas de Axios/Multer/XML/file-type/PostCSS/Vite. O lock foi regenerado no fork, preservando seus overrides; a allowlist de upload central foi adaptada uma única vez e validada no Node 22 real. Ver [`security-dependencies-upstream-audit-2026-09.md`](./security-dependencies-upstream-audit-2026-09.md). |
| Links em conteúdo | `e986d9e4`, `1f123f17` | Não aplicável ao comportamento atual. A auditoria corrigiu a premissa anterior: o helper não existe no fork e o segundo commit apenas corrige uma feature opt-in de remoção de links do X que também não foi adotada. Portar só o fix criaria código morto; portar ambos exige uma decisão de produto. Ver [`x-strip-links-upstream-audit-2026-09.md`](./x-strip-links-upstream-audit-2026-09.md). |

## 5. Épicos — não fazer cherry-pick

### 5.1. Pipeline de publicação Temporal v1.0.6 → v1.1.0

Commits principais:

`e2cdd5e0`, `9944a5fc`, `3587e44d`, `e287a14d`, `07f8122b`,
`8de27bb7`, `7dc3d9fb`, `44a611cf`, `1b71e75e`, `0f1647f7`.

O conjunto tenta evitar duplicidade, introduzir fases pending/finalize, heartbeat,
reciclagem de workflows, repetição e diagnóstico de atividade travada. É valioso,
mas substitui o pipeline inteiro e toca providers divergentes.

**Riscos específicos do fork:**

- `postWorkflowV102` ainda é a versão registrada e tem histórico em produção;
- exclusão de perfil agora termina workflows e preserva histórico de posts;
- posts de perfis cancelados são filtrados defensivamente;
- tokens de integração são criptografados no banco e desencriptados no uso;
- Instagram tem `refreshNeeded`, credenciais por perfil e erros Meta específicos;
- o fork possui autopost, repost, aprovação e escopo por perfil não presentes no
  mesmo formato no upstream.

**Decisão:** criar um ADR/plano de migração de workflow, manter V102 executável
para históricos antigos e introduzir uma versão nova adaptada. Testar replay
Temporal antes de qualquer deploy.

### 5.2. Streaming/pending em todos os providers

Commits principais:

`5e82d460`, `9980825a`, `1b121d0c`, `c2944e14`, `b0bb1c85`,
`4013c1af`, `e287a14d`.

**Decisão:** extrair primeiro o helper genérico com testes. LinkedIn pode ser o
piloto. X não pode receber o arquivo upstream inteiro: o fork usa upload v1.1 e
credenciais OAuth por perfil, divergências documentadas no workflow de sync.

### 5.3. TikTok Business

Commits principais:

`4ace3a7a`, `cae2565e`, `885f9a5c`, `306b6e94`, `25b47887`,
`4e959fa4`, além da cadeia de concorrência/heartbeat de junho.

**Decisão:** feature opcional, não atualização obrigatória. O fork já oferece
TikTok via provider nativo e Zernio; exige decisão de produto e credenciais
próprias antes de qualquer porte.

### 5.4. MCP/ChatGPT/Claude Connector

Commits principais:

`61cc2d47`, `95f30de4`, `b59b5b05`, `0e4ce463`, `267fd175`,
`117e945a`, `b1f47664`, `eabac3d3`, `d26c68dc`, `74b01ada`.

**Decisão:** não portar em bloco. O fork tem MCP, CLI, flows, OAuth e chaves por
perfil próprios. Revisar contratos e segurança em um projeto separado.

## 6. Já coberto ou parcialmente coberto no fork

| Upstream | Estado no Robô MultiPost |
|---|---|
| `7bf1d8b7` (avatar fail-soft) | Já coberto: falha de storage não derruba mais a conexão do canal. |
| `3fab214f` (Graph v25) | Coberto no segundo porte: Facebook/Instagram unificados em v25, sem substituir `resolveIgRoute`, credenciais por perfil ou self-heal. Falta apenas validação real antes da promoção. |
| `a21a7d4b`/`c96935a0` | SSRF, magic bytes e `profileId` já existem; falta limite de download e normalização de falha. |
| `db65072f` e sucessores | DNS-pinning base já existe; falta ampliar Axios/providers sem regredir self-hosted. |
| `eaf866ad` (áudio em Reels) | Backend tem busca de música, mas UI/DTO completos do upstream não existem; feature parcial, opcional. |
| `b6310364` (republicação) | Coberto com gate no backend/API, opt-in estrito e confirmação contextual na UI. |
| Next da tag `v2.23.0` | Tag usa 16.2.6; o fork já força 16.2.6 por override. |
| Fixes triados até 07/06 | Segurança, NestJS 11, XSS, SSRF, Pinterest/Threads/IG e quatro cherry-picks já estão documentados na triagem anterior. |

## 7. Opcional — só adotar com demanda de produto

- **Instagram áudio em Reels:** `eaf866ad`.
- **Backgrounds de texto no Facebook:** `f328583c`.
- **Tumblr:** `3b9a7896`, `fc07ab8d`.
- **Tags/categorias/status no WordPress:** `d027d6f7` após o fix de conexão.
- **API/Agente para atualizar settings de post:** `48ab8df0`, `f5d30a2b`.
- **X Articles:** `173f92ed`, `a4088abc`; exige porte profundo no provider X.
- **Apple Login:** `14c3a2f8`, com os follow-ups `44a611cf` e `84aeb318`.
- **Exclusão da conta inteira:** `afd034b2`, `3757881e`; não confundir com
  exclusão/cancelamento de perfil já implementada no fork.
- **Melhorias visuais pequenas:** `1950d7ed`, `1fcbe332`, `73673097`,
  `1dc655db`, `25a4f26b`.

## 8. Não adotar

### 8.1. SaaS, billing e telemetria do Postiz Cloud

Ignorar Chatbase, trial/lifetime/unlimited, Stripe/coupons, tracking GTM,
estatísticas de superadmin SaaS e ajustes de Sentry voltados ao cloud. Principais
commits: `ebe3a6b6`, `bcfce92c`, `387d85da`, `be42a595`, `b92f0314`,
`c2359308`, `9d0919f8`, `dce1cd05`, `dbb331e4`, `ad7c8796`,
`8c4ed8e2`, `45aecfbe`, `2de6dd76`, `ff3019b4`, `debafb36`,
`9f92adc1`, `c35753f0`, `81af6c97`.

### 8.2. Metadados/documentação do upstream

Não trazer README, SECURITY/CLA, regras Claude do upstream, badges, templates e
alterações de CI que substituam as regras do fork. Exemplos: `a98ed6bf`,
`1c8d9b88`, `0e197ec2`, `b1f4989c`, `3ce14f2a`, `9a9b2de8`,
`ab3b1edb`, `68c8ea6e`, `eaefe98f`, `1f17f9b4`, `a653536b`,
`c90b6c62`, `48bf76af`.

### 8.3. Administração cloud que conflita com perfil/agência

Não portar diretamente `f5adddf2`, `3754c30e`, `fbaca33f`, `5b39006c`,
`06e19ffd`, `6c1c5dd6`, `651e5bc1`, `ec8ac6d2` e `0b6dc6c5`.
O fork tem papéis por perfil, OWNER/MANAGER/EDITOR/VIEWER e guard global; essas
features precisam nascer sobre esse modelo, não sobre impersonação cloud.
Os ajustes de convite `39d91fcf` e `5ef964e3` também devem ser reimplementados
sobre o fluxo de convite por perfil/i18n do fork, caso ainda sejam necessários.

## 9. Inventário consolidado

Os 99 commits efetivos novos da tag foram agrupados acima. Os itens restantes
da tag são correções pequenas ou dependências de séries já classificadas:

- **TikTok/concorrência:** `b3a24c70`, `33011a35`, `1af24c39`, `d03ceeb6`,
  `fb26a046`, `cd5bbc6a`, `ab6f081a`, `2beeaf72`, `b3712201`,
  `935d4a46`, `a194b98f`, `9dd2c62d`, `be74536f`, `0cdb8e55`,
  `1fb3983b`, `75d9eef0` — revisar apenas dentro do épico do provider.
- **Agent/chat do upstream:** `95f08f57`, `2de87c33`, `155e67de`,
  `f10d6715`, `c44d18c0`, `7f8a8328` — aproveitar o comportamento, não o
  código em bloco.
- **Infra/configuração:** `5b0288fd`, `4157b9ab`, `d167233e` — portar apenas
  o primeiro após teste das filas; os demais não agregam ao deploy atual.
- **Correções triviais/absorvidas:** `c95b9909`, `ec91d106`, `d2f27b05` —
  não justificam PR isolado se a suíte e o build atuais já passam.
- **Não portar supressão de tipos:** `3686d8ab` ignora erro de tipos no Bluesky;
  o fork deve corrigir o contrato em vez de silenciar o compilador.

Os 70 commits efetivos após `v2.23.0` ficam em watchlist. Além dos P0/P1/épicos
já citados, há duplicações/reaplicações (`80f74750`/`d8bec202`,
`08e0a560`/`81547fc6`, `0321796e`/`741adbfd`) e features ainda não lançadas.
Nenhuma delas deve entrar no sync da tag por acidente.

## 10. Ordem segura de implementação

A baseline de CI foi corrigida separadamente na PR `#205`: o frontend passou a
declarar Blueprint no próprio workspace e o workflow usa pnpm 10.6.1 com
lockfile congelado. Assim, uma falha nos portes abaixo volta a representar a
mudança em análise, não dívida anterior da instalação.

1. **PR 1 — segurança de uploads (concluída, PR `#207`):** `79360622` +
   limite/falha de upload por URL (`a21a7d4b`, `c96935a0`), reimplementados
   sobre as proteções próprias de perfil, magic bytes e DNS-pinning.
2. **PR 2 — Meta (implementada, aguardando smoke/PR):** Graph v25 + métricas
   novas + Story `upload_complete`, preservando credenciais por perfil,
   System User fallback e reconexão 190/460/464.
3. **PR 3 — SSRF cumulativo:** Axios/Undici + providers/webhooks, com testes de
   DNS rebinding e self-hosted.
4. **PR 4 — providers isolados:** LinkedIn e Pinterest foram implementados e
   mesclados; GMB está implementado em branch própria e WordPress segue depois.
   Cada provider mantém specs e smoke test real quando necessário.
5. **PR 5 — dependências:** Next/Nest e pacotes de segurança, sem feature junto.
6. **Épico Temporal:** desenho/migração V102 → nova versão, replay e teste de
   publicação real antes de qualquer promoção para `release`.

## 11. Gates antes de produção

- specs co-localizadas para cada service/provider alterado;
- instalação reproduzível com pnpm 10.6.1 e `pnpm install --frozen-lockfile`;
- `pnpm test`, builds de backend, frontend e orchestrator;
- teste de replay/compatibilidade no Temporal para qualquer workflow novo;
- smoke tests reais de Facebook, Instagram, LinkedIn, Pinterest e GMB quando o
  provider correspondente for alterado;
- validar reconexão Meta, exclusão de perfil e posts futuros após cada bloco;
- somente depois: merge em `main`; `release` continua intocada até aprovação e
  tag SemVer do Robô MultiPost.

## 12. Estado da triagem

A triagem foi incorporada à `main` pela PR `#201`, sem cherry-pick nem código do
upstream. A baseline de CI foi saneada na PR `#205`. Em 02/09, o espelho
`postiz` foi atualizado para `db1a49e2` e enviado ao origin; `release` continua
intocada. O PR 1 de uploads segue independente, com testes e revisão de impacto
antes de qualquer merge ou promoção para produção.
