# Auditoria e migração Meta Graph API v25

> Data: 02/09/2026  
> Branch: `codex/upstream-meta-graph-v25`  
> Upstream de referência: Postiz `ce32dccb`, `3fab214f` e `7edeadd5`

## Objetivo

Migrar as chamadas versionadas da Meta para Graph API `v25.0` sem substituir
as customizações do Robô MultiPost: credenciais por perfil, descoberta de
ativos do Business Manager, roteamento Instagram por host/token,
`MetaSystemUserService`, tratamento de sessão `190/460` e `190/464`, Stories e
webhooks.

Não foi feito cherry-pick dos providers do Postiz. O porte foi manual e
testado sobre o código do fork.

## Inventário antes da mudança

| Versão literal | Ocorrências | Área principal |
|---|---:|---|
| `v20.0` | 24 | Facebook e configuração de webhook |
| `v21.0` | 7 | Analytics/messaging do Instagram e `/me` do Instagram Login |
| `v25.0` | 44 | Publicação Instagram, messaging, flows e seus testes |

Antes do porte não existia uma fonte única de versão.
`InstagramMessagingService` possuía duas bases locais em v25, `FlowsService`
gravava v25 diretamente, o provider do Instagram misturava v25 e v21, e o
provider do Facebook permanecia em v20.

## Decisão de arquitetura

Criar `meta-graph.constants.ts` como fonte única para:

- versão `v25.0`;
- hosts `graph.facebook.com`, `graph.instagram.com` e `www.facebook.com`;
- bases versionadas e helper para host dinâmico.

`instagram-route.resolver.ts` continua sendo o ponto único que escolhe
**host + token**. A constante compartilhada escolhe apenas a versão e monta a
URL; ela não pode decidir credenciais nem converter Page Access Token em IG
User Token.

Continuam deliberadamente sem prefixo de versão:

- `https://api.instagram.com/oauth/access_token`;
- `https://graph.instagram.com/access_token`;
- `https://graph.instagram.com/refresh_access_token`;
- o endpoint app-token `https://graph.facebook.com/oauth/access_token` usado
  apenas para validar o par App ID/Secret.

Esses endpoints têm contrato próprio de OAuth e não são chamadas comuns de
nós/arestas da Graph API.

## Mudanças funcionais incluídas

### Facebook Insights

A [documentação oficial da Graph API v25](https://developers.facebook.com/docs/graph-api/changelog/version25.0)
anuncia a remoção global das métricas de impressão/alcance antigas quando a
v26 for aplicada. As substituições adotadas são:

| Removida | Substituta |
|---|---|
| `page_impressions_unique` | `page_total_media_view_unique` |
| `page_posts_impressions_unique` | removida da consulta |
| `page_video_views` | `page_media_view` |
| `post_impressions_unique` | `post_total_media_view_unique` |

`page_post_engagements`, `page_daily_follows`, reações e cliques permanecem.
Valores de `page_media_view` que vierem separados por origem serão somados
para manter o contrato atual de um total por dia.

### Facebook Story de vídeo

Antes do porte, o fork chamava `finish` imediatamente após enviar `file_url`.
O fluxo agora consulta o status do vídeo e aceita tanto `upload_complete`
quanto `ready` antes da publicação. Estado `error` ou espera excedida falham de
forma explícita, sem disparar `finish` prematuramente.

### Demais itens do changelog oficial v25

- **Node metadata (`metadata=1`):** não há consumidor desse parâmetro no
  monorepo; nenhuma alteração necessária.
- **Webhooks mTLS:** o repositório não solicita nem valida certificado cliente
  da Meta. Não há trust store mTLS para alterar no código. Se Nginx/Traefik ou
  outro proxy externo à stack validar esse certificado, a CA deve ser auditada
  separadamente na infraestrutura antes do deploy.
- **Marketing API:** o MultiPost não usa os endpoints de campanhas ou relatórios
  assíncronos afetados nessa versão; nenhuma alteração foi incorporada por
  acidente.

## Invariantes do MultiPost

- `ClientInformation` continua prioritário sobre variáveis de ambiente em
  OAuth e autenticação.
- `resolveIgRoute` continua escolhendo `graph.facebook.com` + Page Access Token
  ou `graph.instagram.com` + IG User Token.
- `facebook` e `instagram` continuam com `noNativeRefresh`; a migração não
  transforma Page Access Token em refresh token.
- `MetaSystemUserService` continua chamando `reConnect(internalId, internalId,
  systemUserToken)` e aproveita as mesmas rotas v25 de descoberta de páginas.
- erros Meta `190/460` e `190/464` continuam classificados como sessão inválida
  para acionar reconexão/self-heal.
- nenhuma coluna, token salvo ou histórico Temporal será migrado.

## Cobertura obrigatória

- OAuth e troca de token do Facebook usam v25 e preservam credenciais por
  perfil;
- descoberta `/me/accounts`, `owned_pages` e `client_pages` usa v25;
- feed, Reel, comentário e Story usam v25;
- Story de vídeo aguarda `upload_complete`/`ready`;
- Page Insights e Post Insights não pedem métricas removidas;
- Instagram Facebook Login e Instagram Login usam v25 nas rotas Graph;
- configuração/leitura de webhook e messaging usam a mesma constante;
- configuração de webhook usa `graph.instagram.com` quando o App ID/Secret é
  do produto Instagram Login e `graph.facebook.com` quando é Facebook Login;
- testes existentes de System User, `resolveIgRoute` e erros 190 continuam
  verdes;
- busca final não encontra literais `v20.0` ou `v21.0` em código executável da
  Meta.

## Promoção

Esta mudança não exige reconectar canais apenas por alterar a versão da API.
Antes da promoção para `release`, executar specs de providers/credenciais/
flows, todas as suítes de libraries/backend, os três builds e smoke test real
de Facebook + Instagram com postagem e leitura de analytics.
