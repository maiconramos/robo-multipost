# Comentário após publicar um Story do Facebook

O MultiPost não oferece primeiro comentário ou sequência de comentários após publicar um Story do Facebook. Essa restrição vale para `facebook` e `zernio-facebook`; publicações de feed e Reels mantêm os comentários existentes.

No compositor, selecionar **Story** desabilita a adição de comentários e mostra a orientação. Blocos de comentário já salvos ou herdados de um texto compartilhado permanecem visíveis e removíveis ao editar o canal; nada é apagado automaticamente. Uma publicação com vários arquivos no primeiro bloco continua seguindo o envio de Stories por mídia existente. O bloqueio conta blocos, não arquivos.

No servidor, a combinação Story + mais de um bloco é recusada antes de gravar/agendar/publicar, usando a integração real da organização. Isso cobre painel, REST e MCP, inclusive edição e reagendamento de rascunhos. Rascunhos incompletos podem ser conservados para correção. A validação de publicação e comentário no worker também cobre cadeias antigas e não altera o histórico determinístico dos workflows.

## Diagnóstico do incidente de 06/11/2026

O evento exportado confirmou sucesso na publicação do Story. A atividade posterior tentou `POST /{id}/comments` e recebeu Graph API `100`, subcódigo `33`; em seguida o fluxo terminou com erro. Esse código isolado também pode indicar ID ou acesso incompatível, portanto não comprova token expirado nem uma impossibilidade universal de comentários nas interfaces da Meta. A orientação de reconectar era inadequada para diagnosticar esse caso.

As referências oficiais de [Page Stories](https://developers.facebook.com/docs/page-stories-api/) e [Object Comments](https://developers.facebook.com/docs/graph-api/reference/object/comments/) retornaram bloqueio/HTTP 429 durante a consulta. O bloqueio descrito aqui é o contrato suportado pelo MultiPost para comentários após publicação, sustentado pelo evento observado; não descreve respostas ou comentários manuais no aplicativo Facebook.

Uma falha posterior não desfaz a publicação já confirmada. O incidente não foi reexecutado, republicado ou alterado em produção. A proteção de republicação existente continua necessária quando há um ID remoto salvo.

## Verificação

Testes cobrem seleção reativa de Story/Post, preservação de blocos, rejeição antes de gravar ou enviar, provider real diferente de `settings.__type`, reagendamento, cadeias antigas, rascunhos e regressão de comentários de feed/Reels. Não é necessário publicar um Story real para validar a recusa.
