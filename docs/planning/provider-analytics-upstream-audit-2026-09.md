# Auditoria e porte cirúrgico de analytics dos providers — setembro de 2026

> Branch: `codex/upstream-provider-analytics`  
> Base do fork: `7d9615a1` (`main`, após as duas PRs de WordPress)  
> Origem upstream: `907e3399`  
> Estado: implementado com testes automatizados; smoke tests reais pendentes

## Objetivo

Separar consultas de métricas do transporte destinado a publicação sem perder
as proteções e recuperações próprias do Robô MultiPost.

No upstream, `this.fetch` foi substituído por `fetch` em analytics de Facebook,
Instagram, LinkedIn Page, Pinterest, Threads e TikTok. A intenção é correta:
uma leitura de métricas não deve aguardar três retries de cinco segundos em
`429`/`500`, nem transformar uma resposta de analytics em `BadBody` do Temporal.

Copiar essas linhas literalmente, porém, causaria duas regressões no fork:

1. removeria SSRF/DNS-pinning dessas requisições;
2. esconderia `RefreshToken`, que os serviços de analytics usam para renovar o
   canal e, em Facebook/Instagram, acionar o self-heal pelo Usuário do Sistema.

## Solução adotada

O `SocialAbstract` passa a expor um transporte protegido e específico para
métricas, `analyticsFetch`:

- delega a única requisição a `ssrfSafeFetch`;
- retorna a resposta HTTP sem retry para o próprio provider aplicar seu
  fallback de métricas vazias;
- não cria `BadBody` para `400`, `429`, `500` ou outras respostas de analytics;
- preserva `RefreshToken` quando o provider classifica a resposta assim, ou em
  um `401` sem classificação mais específica.

Todas as leituras de métricas de conta e de publicação nos seis providers usam
esse caminho. As leituras de conta que já usavam `fetch` cru também foram
direcionadas ao helper; assim, o contrato fica único e a proteção DNS não varia
entre métricas da conta e do post.

## Compatibilidade preservada

- **Meta:** Facebook e Instagram continuam usando os helpers compartilhados da
  Graph API v25. O Instagram preserva o host recebido
  (`graph.facebook.com`/`graph.instagram.com`) e o token correspondente.
- **Self-heal:** erros Meta 190/460 e 190/464 continuam classificados como
  `RefreshToken`, permitindo a recuperação por Token de Usuário do Sistema.
- **Credenciais:** não há alteração no OAuth, em `ClientInformation`, nos tokens
  armazenados ou na criptografia em repouso.
- **Temporal:** workflows, filas, payloads e atividades de publicação não foram
  modificados. Analytics deixa apenas de produzir `BadBody` e de dormir/repetir
  como se fosse postagem.
- **Publicação:** `post`, uploads, polling de publicação, plugs e descoberta de
  conteúdo ausente continuam em seus caminhos existentes.
- **Providers alternativos:** nenhuma classe Zernio foi alterada.

No TikTok, a consulta de status usada exclusivamente para transformar um
`publish_id` em ID público dentro de `postAnalytics` entra no helper de
analytics. O polling e a publicação de mídia continuam inalterados.

## Cobertura automatizada

O ciclo TDD cobre:

- injeção do dispatcher SSRF pinado;
- uma única chamada em resposta `429`, sem retry nem `BadBody`;
- preservação de `RefreshToken` sem segunda tentativa;
- conta e post de cada um dos seis providers usando `analyticsFetch` em vez de
  `fetch()` de publicação ou `fetch` global;
- `RefreshToken` atravessando os fallbacks de métricas vazias dos seis
  providers, para chegar à renovação/self-heal dos serviços;
- Graph v25 e host selecionado do Instagram;
- as duas consultas de post do LinkedIn Page;
- resolução de `publish_id` e métricas de conta/post do TikTok.

Resultado local: 67 testes direcionados e a suíte completa de 886 testes/86
arquivos passaram. Os builds de backend, orchestrator e frontend também
concluíram com sucesso. O Jest ainda precisa ser encerrado depois do resumo por
um handle assíncrono preexistente da suíte; o processo termina com código zero.

## Gate de produção

Antes de promover a imagem para produção, validar em contas reais:

1. métricas de conta e de post de Facebook e Instagram nos dois tipos de login;
2. token Meta inválido sendo recuperado pelo Usuário do Sistema sem desconectar;
3. métricas de LinkedIn Page, Pinterest, Threads e TikTok;
4. uma resposta de rate limit confirmando retorno rápido e UI vazia/estável;
5. publicação normal em cada provider para provar que o transporte de postagem
   não sofreu alteração.
