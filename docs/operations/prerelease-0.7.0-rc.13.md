# Pré-release 0.7.0-rc.13

## Escopo

Acrescenta importação de fotos e vídeos públicos do Google Drive à API e ao MCP.
O agente recebe o link compartilhado normal e o servidor resolve a confirmação
pública, baixa o arquivo por streaming e salva no perfil informado. Não exige
OAuth Google, conta de serviço, biblioteca adicional ou acesso ao computador do
usuário. Mantém o isolamento entre clientes da RC.12.

Erros conhecidos do MCP conservam o código e acrescentam orientação segura,
incluindo formato incompatível, tamanho excedido, falta de acesso e quota do
Google. A mensagem vem de catálogo local; erros externos, HTML e URLs assinadas
não são encaminhados. Renomear MOV para MP4 não converte o vídeo: o conteúdo
real continua sendo validado e não existe conversão automática.

## Atualização

Imagem versionada: `ghcr.io/maiconramos/robo-multipost:0.7.0-rc.13`.
O workflow da tag publica `linux/amd64` e `linux/arm64`, atualizando `:prerelease`.
A disponibilidade depende da conclusão dos builds e da conferência do manifest.
Esta pré-release não promove a branch `release` nem o canal estável `:latest`.

Após a publicação, faça pull e recrie somente o serviço da aplicação no
Compose/Portainer, preservando os volumes. Reconecte o cliente MCP para carregar
as descrições e o comportamento atualizados. Não há migração de banco, nova
dependência ou variável obrigatória nesta entrega. Não execute sincronização
destrutiva do banco ao atualizar ou fazer rollback.

Uma atualização interrompe as sessões efêmeras de upload em partes que estavam
em andamento. Confira a biblioteca antes de repetir uma importação com resultado
incerto. O endpoint de importação não é idempotente.

## Limites

- Links individuais de arquivos públicos com download permitido. Pastas,
  documentos Google e arquivos que exigem login ficam fora do escopo.
- Imagens até 10 MiB; MP4 até 1 GiB. O tipo é verificado pelo conteúdo real.
- Prazo de até cinco minutos para download, incluindo confirmação. A gravação
  final ocorre depois; cliente e proxy podem encerrar a resposta antes disso.
- Temporários privados e limites de concorrência/espaço preservam os recursos
  do servidor, sem manter o vídeo inteiro em memória.

## Validação

244 testes direcionados passaram em 20 suítes, cobrindo REST/MCP, isolamento,
links do Drive, confirmação, quotas, SSRF, conteúdo, streaming, temporários e
orientações de erro sem vazamento. TypeScript, Prettier e revisões concluídos.
O CI do PR repete as suítes completas e os builds antes da integração.

Um MP4 público real de 301.421.058 bytes (287,46 MiB) foi baixado e copiado no
storage local isolado em 12,18 segundos. Os hashes SHA-256 coincidiram e o perfil
foi preservado na chamada de registro. Um arquivo de 790.429.970 bytes concluiu
o download e foi recusado porque seu conteúdo era QuickTime/MOV, apesar da
extensão MP4. Quotas reais do Google também foram reconhecidas.

Os testes reais usaram recibo de banco simulado. Não criaram mídia na instância,
publicação, agendamento ou credencial e não representam teste de MCP em produção.
Os temporários foram removidos. Esta entrega não faz deploy na VPS.

Contrato e exemplos: [Google Drive](../api/google-drive-media.md).
