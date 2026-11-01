# Thumbnail do YouTube — diagnóstico e correção (29/10/2026)

## Achados confirmados

- VideoFrame sempre exibia o vídeo em 0,1 segundo e não recebia a imagem salva. O editor, o painel de configurações e a biblioteca usavam esse componente. A prévia maior do YouTube também reproduzia apenas o vídeo.
- O seletor atribuía currentTime e permitia capturar antes de seeked. O canvas podia copiar o quadro anterior com o timestamp da posição nova.
- Upload e salvamento de metadados não verificavam HTTP ok. Uma recusa podia fechar o modal e parecer sucesso, mantendo a informação antiga.
- Zero era convertido em null ao reabrir; limpar a capa não limpava o timestamp.

## Comparação com upstream e publicação

Foi atualizado o ref upstream/main via fetch; a versão consultada foi `64f00fd6`. O upstream ainda mantém os problemas de preview/captura examinados. O porte #2285/#2295/#2302 contém o envio de imagem para o YouTube; não foi identificada uma chamada faltante a thumbnails.set.

O payload do composer e updateMedia preservam thumbnail; as activities V102/V112 encaminham a mídia. O provider usa `settings.thumbnail.path` quando presente (compatibilidade com posts antigos), senão `media[0].thumbnail`. A prévia agora segue a mesma prioridade. Há aviso e ação Remover na configuração específica do YouTube.

A falha do vídeo de produção relatado ainda não foi atribuída a uma causa: foi solicitado o link para distinguir salvamento recusado, override antigo, resultado da API e comportamento da plataforma. Não houve publicação nem alteração de vídeo real durante estes testes.

## Correção

VideoFrame mostra a thumbnail salva quando estático e usa poster quando há reprodução explícita. Os consumidores passam a imagem atual. A captura aguarda seeked e dados do quadro; erro/timeout não gera imagem antiga. O save confere as duas respostas e a imagem retornada, mantém o modal em erro e impede clique duplo. Nenhuma regra de envio do provider foi alterada.

## Referências oficiais

A [API thumbnails.set](https://developers.google.com/youtube/data/reference/rest/v3/thumbnails/set) envia uma imagem para um vídeo e pode recusar a operação por falta de permissão ou imagem inválida. A [ajuda do YouTube](https://support.google.com/youtube/answer/72431?hl=pt-BR) distingue Shorts, verificação da conta e superfícies de exibição; também informa que mudanças podem demorar a aparecer. Essas possibilidades não substituem a análise do post concreto.

## Validação

- 39 testes direcionados passaram: 17 Vitest (preview, captura e salvamento) + 22 Jest (mapeamento e provider). O provider foi mockado: nenhuma chamada de publicação ao Google foi executada.
- Typecheck e build de produção do frontend passaram. O painel de teste temporário foi removido antes do build final.
- Navegador com componentes reais e API local simulada: vídeo de 4 segundos começando vermelho e terminando azul. Seleção do último quadro gerou thumbnailTimestamp 3999; o JPEG enviado ficou azul (RGB médio 0/0/255), enquanto o quadro inicial era vermelho (254/0/0). Preview atualizou para a imagem enviada e o modal reabriu preservando a seleção.
- HTTP 500 no save manteve o modal aberto e não expôs o corpo privado do erro. Limpar enviou thumbnail vazia e timestamp null, voltando ao preview padrão do vídeo.
- Revisão de código sem bloqueadores remanescentes; defaults de áudio/reprodução da galeria preservados e o fallback da prévia do YouTube continua mudo/em loop.
- Servidores/rotas temporários de teste foram encerrados/removidos. Produção e vídeos publicados não foram alterados.
- Node local 22.22.3, abaixo do mínimo 22.23.4 declarado pelo projeto; repetir os checks de release no runtime declarado. Lint mantém a limitação de configuração já diagnosticada nesta sessão.

Para fechar o diagnóstico do incidente de produção ainda é necessário o link do vídeo ou post relatado. O conserto local não é confirmação de que a thumbnail de um vídeo já publicado foi alterada.


## Avanço de quadros lento na RC.8 — 01/11/2026

Investigação somente de leitura confirmou `0.7.0-rc.8` na VPS, com o digest publicado `5c962248…` e sem reinícios. Logs enviados pelo operador misturavam registros anteriores da RC.5 e falha OAuth de 31/10 com a inicialização atual de 01/11. O aviso de pgvector indisponível é separado da captura de quadros no navegador.

A mesma mídia MP4 de 22.829.226 bytes devolveu `206`, `Content-Range: bytes 1024-2047/22829226` e 1.024 bytes quando acessada diretamente; o proxy `/api/public/stream` devolveu `200`, sem Content-Range, com tamanho do arquivo inteiro para a mesma requisição Range. O seletor usa esse proxy e mantém a captura desabilitada durante `seeking`; o operador confirmou que carregou após longa espera. O proxy anunciava Accept-Ranges mesmo sem encaminhar Range.

Contrato da correção: aceitar somente um intervalo HTTP bytes válido (fechado, aberto ou sufixo), encaminhá-lo em cada redirect validado, preservar respostas 206 e 416 com seus cabeçalhos e não anunciar suporte inexistente quando a origem devolve 200. Rejeitar Range inválido/múltiplo antes do fetch. Manter validação SSRF, dispatcher com DNS pinado e cancelamento ao fechar o player; nunca encaminhar cookies ou credenciais da requisição. Não alterar Google OAuth, publicação, schema ou dados de posts.

Validação exigida: regressões do controlador, respostas HTTP e navegador atravessando o proxy real com vídeo de quadros distintos. A prova antiga com API simulada não cobria o transporte real do vídeo.


A revisão identificou ainda um risco pré-existente na mesma rota: ela podia servir HTML/SVG da origem com o Content-Type original sob o domínio da aplicação. A correção recusa tipos inesperados, permite os tipos MIME `video/mp4`, `application/mp4` e `application/octet-stream` (também quando ausente), normaliza a resposta para `video/mp4` e aplica `nosniff`/CSP com sandbox. Não executado payload ativo na VPS; regressão local usa corpos inertes e cobre recusa/cancelamento e cabeçalhos seguros.


Resultado local: 24 testes do controlador aprovados, incluindo intervalos fechados/abertos/sufixo, 416, fallback 200, rejeição prévia de intervalos inválidos, redirects/abort e tipos de conteúdo; 17 regressões existentes de thumbnail aprovadas. Browser com o componente real e o controlador HTTP real, origem local controlada com MP4 de 19 MB e envio limitado: antes da correção, avanço para 19.999 ms ficou em seeking (readyState 1, só 0,329 s disponíveis) e excedeu o limite de 5 s; depois, requisitou os intervalos `bytes=0-` e `bytes=18874368-`, terminou o seek e capturou o JPEG azul correto (RGB 0/0/254), timestamp 19.999 ms, sem erros de página. A prova final repetiu a captura com MIME fixo, nosniff e CSP ativos. A substituição controlada da origem é exclusiva do fixture; não representa teste de SSRF real, coberto separadamente pelos guards e regressões.

Rota/arquivo de teste temporários e AGENTS gerado pelo Next removidos após a prova. Nenhum conteúdo publicado no YouTube, nenhuma credencial alterada e nenhuma mudança aplicada à VPS durante este diagnóstico/correção.

Build de produção do backend aprovado após a correção final. A validação completa em Node 22.23.4 e os três builds são conferidos no CI antes da nova imagem.

Publicação da correção: `0.7.0-rc.9`, após integrar o PR #349. [CI 41336840910](https://github.com/maiconramos/robo-multipost/actions/runs/41336840910) aprovado para `6723289c`, com os três builds em Node 22.23.4. O commit posterior altera somente a versão e este registro operacional. A publicação da imagem atualiza `prerelease`, preservando `latest`, sem deploy automático na VPS.
