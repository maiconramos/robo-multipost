# Pré-release 0.7.0-rc.14

## Alterações

- Envio direto de arquivos por base64 no MCP HTTP de até **6 MiB**, com corpo JSON limitado a **12 MiB** após autenticação. Envio em partes continua em **2 MiB** por parte; limites totais de imagem **10 MiB** e MP4 **1 GiB**.
- Com chave da organização, o agente descobre o cliente por `getAccountContextTool`, consulta seus canais e reutiliza a mesma chave com `profileId` em cada operação. No agendamento em lote, informa `socialPost[].profileId` em cada destino. Não exige chave por cliente nem seleciona Default automaticamente.
- Instruções de conexão, schemas, contexto, erros seguros, skill local e guia do botão **Skill para Agentes de IA**, em Integrações, passam a orientar o mesmo fluxo. Chaves de perfil continuam restritas ao próprio perfil.
- Transporte HTTP usa as APIs públicas do SDK para encaminhar o corpo validado, com instâncias por requisição e compatibilidade com protocolos 2025/2026. SSE legado conserva seu transporte anterior; para envio direto acima de 2 MiB, use os endpoints HTTP.

## Atualização e teste

Imagem: `ghcr.io/maiconramos/robo-multipost:0.7.0-rc.14`.
O workflow da tag publica `linux/amd64` e `linux/arm64`, atualizando `:prerelease` após concluir os builds. A tag estável `:latest` e a branch `release` não são promovidas.

Faça pull e recrie apenas o serviço da aplicação no Compose/Portainer, preservando volumes. Depois reconecte o MCP para renovar instruções e catálogo. Se o agente usa uma skill copiada ou instalada localmente, atualize essa cópia; o guia servido pela instância já acompanha esta versão.

Teste com a conexão MCP da organização: peça ao agente que descubra um cliente, consulte os agendamentos e envie uma mídia de até 6 MiB para esse perfil. Confira o perfil no recibo. A seleção não persiste entre chamadas. Arquivos maiores continuam disponíveis por URL pública/Google Drive ou envio em partes.

Não há migração de banco nem variável obrigatória nova. Atualizar a aplicação interrompe sessões efêmeras de upload em partes; confira a biblioteca antes de repetir operações com resultado incerto. Esta entrega não faz deploy na VPS.

## Validação

331 testes direcionados em 38 suítes, verificação de tipos e revisões aprovados. A CI completa do PR #354 passou, incluindo testes e builds. A prova HTTP real cobre os três endpoints, protocolos 2025/2026, bytes de um envio de 6 MiB, limites, concorrência e isolamento. Serviços de identidade e storage foram isolados; não houve publicação nem teste de MCP em produção.

PR: [#354](https://github.com/maiconramos/robo-multipost/pull/354).
Contratos: [mídia no MCP](../api/mcp-media-parity.md) e [perfis de clientes](../api/mcp-profile-isolation.md).
