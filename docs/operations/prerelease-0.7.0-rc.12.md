# Pré-release 0.7.0-rc.12

Corrige o escopo dos clientes no MCP: uma chave de organização pode listar posts
e automações de todos os perfis ou selecionar um cliente por chamada. Operações
de cliente exigem seleção explícita e validam os recursos contra esse perfil.
Uma chave de perfil continua limitada ao próprio cliente. Não existe troca
persistente de contexto nem queda silenciosa no Default.

## Atualização e compatibilidade

Use `ghcr.io/maiconramos/robo-multipost:0.7.0-rc.12`, faça pull e recrie o serviço
da aplicação preservando os volumes. O build da tag publica amd64/arm64 e
atualiza `:prerelease`, preservando `:latest`. Esta entrega não faz deploy na VPS.

Reconecte o cliente MCP após atualizar o backend para carregar os novos schemas.
Chaves de organização devem informar `profileId` nas operações de cliente e em
cada item `socialPost[]` da criação em lote. A omissão retorna `PROFILE_REQUIRED`.
`getAccountContextTool` continua identificando a credencial; não seleciona o
cliente para as chamadas seguintes. `customer` não substitui `profileId`.

Conexões com chave de perfil mantêm o uso sem seletor e recusam outro perfil.
Canal, post ou mídia registrada incompatíveis são recusados antes da operação;
uma lista vazia não substitui o erro de propriedade do canal. A consulta de
métricas também valida o alvo antes de chamar o provider legado.

O cliente de arquivos grandes aceita `--profile ID` ou `MCP_PROFILE_ID`, além da
chave de perfil já suportada. A retomada fica vinculada à seleção. Sessões ainda
são efêmeras por processo/uma hora; uma atualização encerra sessões pendentes.
Confira a biblioteca antes de repetir um upload com resultado incerto.

Não há migração de banco, dependência nova nem variável obrigatória no backend.
A REST conserva a autenticação e a seleção explícita existente por `?profileId`;
a fachada legada sem perfil mantém seu contrato Default. Não executar
sincronização destrutiva do banco ao atualizar ou fazer rollback.

Associações históricas de automação/perfil/canal incompatíveis são recusadas no detalhe, canvas, aliases, estado e histórico, preservando os registros sem reatribuição automática.

## Validação

Regressões cobrem chaves de organização/perfil, recursos de outra organização,
leituras com canal incompatível, lotes de clientes diferentes, recusa antes de
gravar, contexto reutilizado/concorrente, mídia em anexos/capas/imagens inline,
persona/conhecimento/credenciais selecionados e retomada do upload.

Uma prova em PostgreSQL descartável verifica a listagem de dois clientes e a
recusa de consulta/edição em perfil errado sem alterar os registros. O banco de
teste é removido ao concluir. Contratos REST, TypeScript e testes do cliente de
upload são verificados separadamente. Revisões de código, segurança e aceitação
não encontraram bloqueios remanescentes após as correções. O CI do PR valida
novamente as suítes e os builds antes da tag.

O guia de contrato está em [Perfis de clientes no MCP](../api/mcp-profile-isolation.md).
Não houve publicação de post, mensagem ou mudança de credencial em instância real.
