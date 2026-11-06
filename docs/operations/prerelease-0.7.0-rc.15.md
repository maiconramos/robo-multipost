# Pré-release 0.7.0-rc.15

## Alterações desde a RC.14

- Métricas do Instagram usam um instante único de referência e duração exata de 7/30 dias, evitando incluir horas futuras no intervalo. Falhas da Meta recebem diagnóstico seguro e não são armazenadas como respostas vazias bem-sucedidas. O teste de 30 dias na conta real deve ser repetido após atualizar a instância.
- Busca de áudio para Reels preserva links de prévia e exibe capas de músicas ou avatares de sons originais quando disponíveis. Resultados sem arquivo direto oferecem o link para ouvir no Instagram; falhas de reprodução não apagam a lista. Enriquecimento opcional tem cache por canal e limites de concorrência e tempo.
- Primeira visita inicia no tema claro. Preferências existentes de tema claro/escuro são preservadas, incluindo a renderização inicial, calendário, gráficos, extensão e emojis.
- Stories do Facebook bloqueiam comentários após a publicação no editor, REST e MCP. Blocos antigos ficam disponíveis para remoção; validação de agendamento/reagendamento e worker impede o envio incompatível. Posts e Reels mantêm os comentários.

## Atualização

Imagem: `ghcr.io/maiconramos/robo-multipost:0.7.0-rc.15`.

O workflow da tag publica `linux/amd64` e `linux/arm64` e atualiza `:prerelease` ao concluir. A branch `release` e a tag estável `:latest` não são promovidas. O build ocorre no GitHub, sem criar imagem no Mac.

No Compose/Portainer, selecione a imagem acima, faça pull e recrie somente o serviço da aplicação, preservando volumes e variáveis atuais. Não há migração de banco ou variável obrigatória nova. Esta entrega não atualiza a VPS automaticamente.

Após atualizar:

1. Confira métricas do Instagram em 7 e 30 dias. A relação entre o intervalo anterior e a recusa específica da conta ainda precisa da prova real; a resposta original da Meta não foi capturada.
2. Busque música e som original no seletor de áudio, confira imagens e reprodução/link quando disponíveis.
3. Verifique o tema claro em navegador sem preferência; uma escolha anterior de tema escuro deve permanecer.
4. Ao selecionar Story do Facebook, confira a ausência da ação de adicionar comentário. Rascunhos antigos mantêm o texto para remoção. Não republique automaticamente um Story já enviado cujo comentário falhou.

O incidente de Story foi confirmado pelo histórico exportado: publicação concluída e comentário posterior recusado. Nenhum post real foi reenviado para validar esta correção. A regra descreve o primeiro comentário automatizado suportado pelo MultiPost, sem afirmar uma restrição universal da interface de Stories da Meta.

## Validação

Os quatro PRs passaram na CI completa individualmente. A composição preserva as alterações e as seções do CHANGELOG; 151 testes direcionados passaram na composição (116 backend e 35 frontend), além da verificação de tipos do frontend e revisão de integração sem bloqueadores. O bloqueio de Story também foi comprovado pela API local com HTTP 400, antes de criar agendamento. Não houve publicação em produção nesta validação.

PRs: [#356](https://github.com/maiconramos/robo-multipost/pull/356), [#357](https://github.com/maiconramos/robo-multipost/pull/357), [#358](https://github.com/maiconramos/robo-multipost/pull/358) e [#359](https://github.com/maiconramos/robo-multipost/pull/359).
