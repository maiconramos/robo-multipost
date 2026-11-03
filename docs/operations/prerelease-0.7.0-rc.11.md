# Pré-release 0.7.0-rc.11

## Escopo

Acrescenta uploads de imagens e vídeos pelo MCP, por URL HTTPS, base64 para arquivos pequenos e transferência em partes para arquivos locais de até 1 GiB. Inclui cliente programático com retomada e conferência SHA-256. API e MCP compartilham validação do conteúdo real, limites e persistência. Agentes também podem consultar contexto da organização/perfil, métricas e notificações.

Mantém todos os recursos integrados na RC.10, incluindo as correções do seletor de quadros e da capa do YouTube. O contrato e os exemplos estão em [Mídia e consultas pelo MCP](../api/mcp-media-parity.md).

## Atualização

Imagem versionada: `ghcr.io/maiconramos/robo-multipost:0.7.0-rc.11`. O build de tags publica `linux/amd64` e `linux/arm64` e atualiza o alias `:prerelease`. Não promove o canal estável `:latest` nem a branch `release`.

Após o build, altere a imagem do serviço da aplicação no Compose/Portainer para a versão acima, faça pull e recrie o serviço. Reinicie/reconecte o cliente MCP para atualizar o catálogo de ferramentas. Não há alteração de schema, migração nova ou variável de ambiente obrigatória nesta entrega. Preserve os volumes existentes; não execute sincronização destrutiva do banco.

## Limites e particularidades

- MP4: até 1 GiB; imagens: até 10 MiB. Base64 direto e cada parte: até 2 MiB decodificados. Cliente e proxy podem ter limites menores.
- Sessões de transferência em partes duram uma hora e são locais ao processo backend. Réplicas precisam de afinidade. Reiniciar o backend perde sessões pendentes; confira a biblioteca antes de começar outro upload após resultado incerto.
- O cliente fornecido lê arquivos no computador do agente e envia bytes pelo MCP, sem colocar o arquivo no prompt. O servidor não aceita caminhos de disco fornecidos pela ferramenta.
- Consultas de métricas mantêm a manutenção automática de credenciais já existente nos serviços. Uploads não agendam nem publicam conteúdo.
- Capa personalizada de vídeo no Facebook e seleção de frame por timestamp no contrato MCP não foram acrescentadas. Não há promessa de paridade administrativa total com a API.

## Validação

200 testes direcionados aprovados em 20 suítes, incluindo API REST, ferramentas MCP, isolamento de organização/perfil, transferências, falhas de transporte, quotas, streaming e storage. TypeScript do backend e do cliente aprovados. Prova integrada com mais de 5 MiB confirma uma única mídia com bytes idênticos após perda da resposta de conclusão. Revisões de código, segurança e aceitação sem bloqueios. O CI do PR valida novamente o código após sincronização com a main; o workflow de containers valida os builds de ambas as arquiteturas antes da imagem ser considerada disponível.

Não houve publicação de posts, upload em instância de cliente nem deploy na VPS nesta entrega.
