# Pré-release 0.7.0-rc.8

## Escopo

Publica os ajustes responsivos integrados pelo PR #346: navegação móvel, canais e filtros em painéis, calendário, configurações, notificações e larguras das demais telas. Inclui o provider compartilhado do CopilotKit em transporte de endpoint único, compatível com as rotas do backend, nos consumidores do compositor, agentes e prévias.

O botão de automações antes identificado como “Logs do Instagram” passa a “Log”, em pt-BR e inglês. A mudança é apenas de texto: mantém rota, filtros, permissões e comportamento. A tela de comentários sem automação acessada por esse botão ainda seleciona somente canais Instagram; unificar a entrada de comentários do Facebook não faz parte desta alteração de nome.

## Compatibilidade e publicação

Mantém as correções de atualização desde a série 0.5 e do índice legado Mastra entregues na RC.7. Não acrescenta migração ou dependência. Preserva o novo compositor, as customizações do fork e o schema guardado; não usar sincronização destrutiva para atualizar ou fazer rollback.

Versão proposta: `0.7.0-rc.8`. Tag Git anotada sobre `main`, imagem `ghcr.io/maiconramos/robo-multipost:0.7.0-rc.8`, alias `:prerelease` e arquiteturas `linux/amd64` e `linux/arm64`. O canal estável `:latest` permanece preservado. Sem deploy na VPS nesta tarefa.

## Validação

O lote responsivo possui 27 testes de UI aprovados, revisão de código/segurança/aceitação, prova em 390/768/1440 px e build de produção. CI do código integrado aprovou 3.255 testes e os três builds. O ajuste do rótulo passa por leitura do consumidor e dos catálogos pt/en e pelo CI de release; imagem, plataformas e versão são conferidas após publicação.

O local foi atualizado com backup e comparação dos dados de oito tabelas de negócio. A prova real da thumbnail do YouTube continua adiada; a publicação desta imagem não equivale a esse teste.
