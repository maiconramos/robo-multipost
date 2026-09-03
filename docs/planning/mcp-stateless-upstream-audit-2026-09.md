# Auditoria e porte do MCP stateless — setembro de 2026

> Base do fork: `0f8e850b` (`main`, após a republicação explícita)
> Upstream analisado: `e11477ee`, `7f8a8328` e os follow-ups posteriores em `upstream/main`

## Objetivo

Eliminar o estado de sessão mantido pelo servidor MCP externo sem substituir a
autenticação própria do Multipost. O mesmo porte corrige o escopo da descoberta
OAuth para que os conectores por chave na URL continuem sendo tratados como
conectores por chave, não como clientes OAuth.

## Causa e impacto

Nos três endpoints Streamable HTTP, `sessionIdGenerator` fazia o
`@mastra/mcp` guardar um transporte e uma instância de servidor por sessão. A
remoção dependia do cliente encerrar explicitamente a sessão; conectores que
abrem sessões e não enviam `DELETE` faziam o mapa crescer durante toda a vida do
processo. Depois de um restart, o cliente ainda enviava um ID desconhecido e
perdia a capacidade de se recuperar automaticamente.

O pacote efetivamente instalado no fork é `@mastra/mcp` 1.4.2. A implementação
e os tipos dessa versão confirmam que `serverless: true`:

- cria servidor e transporte transitórios por requisição;
- usa `sessionIdGenerator: undefined` e não grava no mapa de transports;
- aceita chamadas sem sessão;
- ignora um header `Mcp-Session-Id` antigo em vez de procurar o estado perdido.

O problema de descoberta era adjacente: os middlewares montados com `app.use`
respondiam metadados também na raiz do domínio. Clientes que sondam os caminhos
well-known podiam concluir que `/mcp/:id` exigia OAuth. O porte passa a responder
somente em:

- `/.well-known/oauth-protected-resource/mcp-oauth`;
- `/.well-known/oauth-authorization-server/mcp-oauth`.

O `issuer`, `authorization_servers` e o parâmetro `resource_metadata` do
`WWW-Authenticate` apontam para o recurso `/mcp-oauth`, mantendo os endpoints
reais de autorização e token existentes.

## Adaptação ao fork

O código upstream não foi copiado integralmente. O fork possui autenticação por
perfil desde `5570f457`; por isso o porte mantém a resolução em três camadas:

1. token OAuth `pos_`;
2. chave de API do perfil, carregando `profileId`;
3. chave de API da organização.

Todos os caminhos continuam entrando em `runWithContext` com organização e, se
aplicável, perfil antes de chamar o Mastra. O contexto vive durante o
`await startHTTP`, portanto as ferramentas recebem o mesmo escopo apesar de o
transporte ser transitório.

## Matriz de compatibilidade

| Caminho                    | Transporte                      | Autenticação                        | Decisão                                          |
| -------------------------- | ------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `/mcp-oauth`               | Streamable HTTP stateless       | OAuth `pos_`                        | Alterado somente o transporte e os metadados RFC |
| `/mcp`                     | Streamable HTTP stateless       | Bearer de perfil ou organização     | Preservado                                       |
| `/mcp/:id`                 | Streamable HTTP stateless       | Chave na URL, perfil ou organização | Preservado; não herda descoberta OAuth da raiz   |
| `/sse/:id`, `/message/:id` | SSE legado com servidor próprio | Chave na URL                        | Intocado                                         |
| agente interno             | chamada Mastra em processo      | contexto da aplicação               | Não atravessa `startMcp`; intocado               |

O repositório não usa sampling, elicitation, notificações iniciadas pelo servidor
nem `MCPClient`; portanto nenhuma ferramenta depende de estado entre requisições.

## Follow-ups upstream deliberadamente fora

Os commits posteriores de submissão a diretórios, restrição por e-mail,
registro dinâmico, endpoints OAuth adicionais, filtro de ferramentas e status de
vídeo têm outro escopo e não entram neste porte. O retorno explícito `405` para
GET/DELETE em Streamable HTTP também fica para uma correção isolada, pois não é
necessário para eliminar retenção de sessão ou corrigir a descoberta.

## Evidência automatizada

Os testes novos reproduziram em vermelho:

- presença de `sessionIdGenerator` nos três endpoints;
- descoberta OAuth respondendo indevidamente na raiz;
- issuer e URL `resource_metadata` apontando para o domínio inteiro.

Depois do porte, validam:

- `serverless: true` e ausência de `sessionIdGenerator` nos três endpoints;
- requisição sem sessão e requisição com ID antigo usando o mesmo caminho;
- organização e `profileId` presentes dentro do `AsyncLocalStorage`;
- SSE ainda usando `startSSE`;
- raiz well-known delegada como não encontrada;
- metadados RFC e `WWW-Authenticate` no caminho inserido correto.

Também foi executado um smoke local por HTTP contra o `@mastra/mcp` 1.4.2 real,
sem mocks: `initialize` retornou `200` sem header `Mcp-Session-Id`, um
`tools/list` com `Mcp-Session-Id: stale-from-previous-process` retornou `200` e
o mapa `streamableHTTPTransports` permaneceu com tamanho zero.

## Gate de pré-release

Antes de promover para produção, conectar ao menos um cliente OAuth e um cliente
por `/mcp/:id` na imagem de pré-release, reiniciar o backend e confirmar que
ambos voltam a executar `tools/list` e uma ferramenta somente-leitura sem recriar
o conector. O teste automatizado prova o contrato da aplicação e da versão
instalada do Mastra; esse smoke externo continua sendo uma validação operacional
separada.
