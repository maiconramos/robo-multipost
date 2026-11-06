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

## Capa de Shorts e processamento — 01/11/2026

O teste real em dois vídeos sintéticos privados do canal autorizado reproduziu uma corrida: enviar a imagem imediatamente após `videos.insert` devolveu sucesso em `thumbnails.set` e `hasCustomThumbnail: true`, mas o Studio mostrou o quadro azul automático do vídeo. Após `processingStatus: succeeded` e `thumbnailsAvailability: available`, reenviar a capa pela mesma API padrão, sem MIME explícito nem campos extras de Shorts, fez a imagem verde aparecer no Studio depois de recarregar. Os vídeos públicos e o workflow n8n de referência não foram alterados. A prova não cobre a exibição no feed público de Shorts.

A hipótese inicial de que seria necessário usar a API interna do Studio não se confirmou. O Studio envia `videoStill.isForShort` e `image.isUploadedForShort`, mas esses campos não são necessários no controle que funcionou. Acrescentar esses nomes à query ou ao corpo de outras operações, assim como acrescentar um parâmetro inventado, pode devolver HTTP 200 sem comprovar que o campo teve efeito. Os GETs do proprietário continuam retornando dimensões tradicionais de miniaturas; `part=shorts` e `part=thumbnailDetails` foram recusados com `400 unknownPart`. `hasCustomThumbnail` sozinho não confirma a capa vertical apresentada no Studio.

Contrato da correção no provider nativo:

- Somente quando existe capa, após obter o ID de `videos.insert`, consultar `videos.list` com `id` do vídeo enviado e `part=processingDetails,status`.
- Exigir simultaneamente `processingDetails.processingStatus=succeeded` e `processingDetails.thumbnailsAvailability=available` para baixar e aplicar a imagem. Ignorar itens de outro ID; ausência ou estado desconhecido nunca libera o envio.
- Limitar a espera total a 120 segundos, incluindo consultas e intervalos. Consultas sem repetição automática, timeout de até 10 segundos limitado ao orçamento restante, intervalos de até 5 segundos.
- Encerrar imediatamente em processamento `failed/terminated` ou upload `failed/rejected/deleted`. Timeout ou erro da API também encerram a etapa de capa.
- Toda falha após o aceite do vídeo permanece dentro do tratamento `PublishedWithError`, preservando o ID e a URL. Não propagar um erro que reinicie o upload. A mensagem usa orientação estática para o Studio; nunca incorpora o corpo bruto da API.
- Sem capa, não consultar nem aguardar o processamento. Preservar a prioridade de `settings.thumbnail.path` sobre `media[0].thumbnail`, download com proteção SSRF e envio pela API pública.

O V112 já mantém heartbeat durante `postSocialPending`; nenhuma alteração de workflow, schema, credenciais, interface ou contrato público é necessária. A espera também vale para vídeos tradicionais com capa, pois não há detecção de Shorts por heurística de duração ou dimensões nesta correção. Se o processamento ultrapassar dois minutos, o vídeo permanece enviado e a capa deve ser definida manualmente no Studio; não há promessa de preenchimento posterior automático.

Referências: [estado de processamento e disponibilidade das miniaturas](https://developers.google.com/youtube/data/reference/rest/v3/videos#processingDetails), [envio da imagem pela API pública](https://developers.google.com/youtube/data/reference/rest/v3/thumbnails/set).

Testes de regressão cobrem a ordem das operações, condições de prontidão independentes, estados ausentes/desconhecidos/terminais, orçamento com consultas lentas, falhas HTTP e preservação do ID sem repetição do upload. A validação do código corrigido e sua disponibilização são registradas separadamente da investigação real acima; a alteração local não é um deploy na VPS.

### Validação do provider corrigido

- Node 22.23.4: 60 testes direcionados do provider/classe base e 33 do orchestrator aprovados; builds de produção do backend e orchestrator aprovados. Prettier e `git diff --check` aprovados.
- Prova real com cópia isolada do `YoutubeProvider.post` corrigido no container local, sem trocar o código ou reiniciar os serviços da aplicação. O arquivo executado tinha o mesmo SHA-256 do provider da branch. Upload único de vídeo sintético privado de sete segundos no Alma Fitness, com a imagem selecionada baixada pelo transporte SSRF existente.
- Sete consultas reais: primeiro `processing/inProgress`, depois `succeeded/inProgress` e finalmente `succeeded/available`. O provider aguardou cerca de 33 segundos após o aceite do vídeo antes de enviar a capa e retornou sucesso com o ID/URL. GET final confirmou privacidade `private` e `hasCustomThumbnail: true`; o Studio mostrou a capa amarela selecionada e reconheceu o link como Short, sem salvamento manual posterior. A prova não valida a exibição no feed público nem o carregamento da correção pelo worker em execução.
- Revisões de plano, código, segurança e documentação sem bloqueadores remanescentes. O caso explícito de `RefreshToken` durante o polling também foi coberto: preserva a referência sem novo upload e não expõe a mensagem original.
- Lint não pôde ser confirmado: a raiz não define script `lint`; `pnpm lint` resolveu o executável externo do sistema, que falhou. Nenhuma mudança de configuração de lint foi incluída nesta correção.
- Sem migração, alteração de credenciais, modificação do workflow n8n ou deploy na VPS. A imagem RC.9 em execução ainda precisa ser substituída por uma versão que contenha esta correção.

### Desbloqueio do CI — 02/11/2026

O primeiro CI do PR #350 falhou em um teste preexistente do diagnóstico do Messenger: a expressão que proibia o ID de remetente `987` também encontrava esses dígitos no timestamp válido de expiração `1793589878041`. Os testes do provider do YouTube passaram nessa execução.

A reprodução fixa `Date.now()` no instante da falha e restaura o relógio ao terminar. A verificação passou a distinguir o ID completo como string e a exigir a estrutura exata da observação, mantendo a recusa de texto, ID de mensagem e campos extras. Nenhum código de produção do Facebook foi alterado. O teste falhou antes do ajuste e, depois dele, os 105 testes direcionados de setup do Facebook, inspeção do Messenger e provider do YouTube passaram em Node 22.23.4.
