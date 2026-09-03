# Auditoria upstream — remoção de links do X

> Base do fork: `9ae2d716` (`main`)
> Upstream analisado: `e986d9e4` e `1f123f17`

## Escopo

Verificar se o ajuste de detecção de links de `1f123f17` pode ser portado
isoladamente sem alterar o comportamento atual do Robô MultiPost.

## Achado

O arquivo `libraries/helpers/src/utils/strip.links.ts` não existe no fork. Ele
foi criado pelo commit anterior `e986d9e4`, que introduziu uma feature completa
e opcional para remover links de publicações do X quando
`STRIP_LINKS_FROM_X_POSTS` está habilitada. Essa feature também altera:

- a interface e o provider do X;
- a criação e o encurtamento de posts no backend;
- o payload da lista de integrações;
- o editor e o aviso visual do frontend.

O commit `1f123f17` apenas amplia a regex dessa feature para domínios sem
protocolo. Portanto, ele não possui consumidor quando aplicado sozinho.

## Compatibilidade com o fork

A feature-base já havia sido classificada como baixo valor na triagem de junho
de 2026 e não foi adotada. O fork não declara `STRIP_LINKS_FROM_X_POSTS` em
`.env.example` ou `docker-compose.yaml`, e nenhum provider atual expõe o
contrato `stripLinks`.

Introduzir os dois commits agora mudaria o conteúdo persistido e publicado no
X, o fluxo de short links e a validação visual do editor. Isso seria uma nova
decisão de produto, não uma correção isolada ou uma atualização obrigatória.

## Decisão

**Não aplicável ao comportamento atual.** Não foi adicionado código morto nem
ativada implicitamente a remoção de links.

Se houver necessidade comercial de publicar no X sem links, reavaliar os dois
commits juntos em uma feature própria. O porte deverá ser opt-in estrito
(`=== 'true'`) e cobrir por teste URLs com protocolo, domínios sem protocolo,
e-mails, pontuação, múltiplos links, Unicode, short links e posts antigos.

## Evidência

- `git grep` no fork não encontra `hasLinks`, `stripLinks` ou
  `STRIP_LINKS_FROM_X_POSTS`;
- o histórico mostra que `strip.links.ts` nasceu em `e986d9e4` e só foi
  alterado por `1f123f17`;
- no upstream, os únicos consumidores pertencem à feature opt-in do X;
- não houve mudança de código, configuração, banco, UI ou runtime.
