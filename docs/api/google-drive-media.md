# Importação de mídia pública do Google Drive

## Contrato API e MCP

A entrada existente permanece igual: `POST /public/v1/upload-from-url` recebe
`{ "url": "https://drive.google.com/file/d/ID/view?resourcekey=CHAVE" }`.
O MCP usa `uploadMediaFromUrlTool` com `url` e o `profileId` do cliente quando a
chave é de organização. Autenticação e isolamento são os mesmos do upload por URL;
a resolução do Drive não escolhe perfil nem altera o destino.

O servidor aceita links HTTPS individuais `/file/d/ID/view`, `/open?id=ID` e
`/uc?id=ID`, preserva `resourcekey` e tenta baixar o arquivo sem login Google.
O proprietário precisa permitir acesso por link e download. Pastas, arquivos
privados e documentos nativos (Docs/Sheets/Slides) não são importados.

O retorno continua sendo a mídia salva, incluindo `id` e `path`. Use esses campos
no agendamento; não use a URL transitória do Google como mídia do post. A operação
somente importa: não agenda, publica nem altera permissões no Drive.

## Transferência e segurança

Downloads por URL usam arquivo temporário privado e escrita por streaming;
validam tipo real, limite de imagem de 10 MiB e MP4 de 1 GiB. A etapa de download tem
prazo de até cinco minutos, incluindo a confirmação do Drive. A gravação final
no storage e no banco ocorre depois e pode levar mais tempo. Proxy, storage
e cliente MCP podem impor outros prazos; tamanho permitido não garante que uma
transferência lenta conclua. Consulte a biblioteca após resposta incerta antes de
repetir, pois importações não são idempotentes.

Há no máximo quatro importações simultâneas por processo e duas por organização,
com verificação conservadora de espaço livre antes de começar: duas cópias de
1 GiB por importação ativa, mais 64 MiB de margem, inclusive para arquivos pequenos.
Temporários são removidos ao terminar ou falhar. Um encerramento abrupto do processo pode deixar temporários
para a limpeza do diretório temporário do sistema.

O HTML de confirmação tem limite de 256 KiB; HTML com cabeçalho de binário
é interrompido pelo prefixo, sem ser importado como vídeo. A confirmação só pode levar ao download HTTPS
do Google para o mesmo ID. Não se seguem links arbitrários do HTML, não há execução
de scripts e não se usam cookies ou credenciais Google. DNS e redirecionamentos
mantêm a proteção SSRF, inclusive com opt-out global habilitado. Nenhuma nova
biblioteca, SDK Google, conta de serviço ou OAuth é necessária.

## Falhas

Na API REST, as falhas abaixo retornam HTTP 400 com `msg` e `code`, exceto as
exceções indicadas. No MCP, `errors` continua sendo JSON serializado, com o código
estável em `error` e uma orientação opcional em `message` para os códigos
mapeados no catálogo. `UNSAFE_URL` conserva somente o código. A
orientação vem de um catálogo fixo; mensagens da origem, HTML e URLs não são
repassados. Erros desconhecidos continuam devolvendo apenas o código.

Por exemplo, um MOV renomeado para `.mp4` é recusado pelo conteúdo e o agente
recebe em `errors`:

```json
[{"error":"UNSUPPORTED_MEDIA_TYPE","message":"O conteúdo real não é uma imagem compatível nem um vídeo MP4. Envie uma imagem compatível ou converta o vídeo para MP4; apenas renomear a extensão não converte o formato."}]
```

A conversão não é automática. Em resultado incerto de transporte, o agente deve
consultar a biblioteca antes de repetir a importação.

| Código | Orientação |
|---|---|
| `DRIVE_LINK_UNSUPPORTED` | Enviar link individual de foto ou vídeo, sem login obrigatório |
| `DRIVE_ACCESS_DENIED` | Conferir compartilhamento e permissão de download; não prova qual permissão falta |
| `DRIVE_DOWNLOAD_LIMIT` | Google sinalizou limite de requisições; tentar mais tarde |
| `DRIVE_CONFIRMATION_UNSUPPORTED` | Não foi possível resolver a confirmação pública; não pressupõe arquivo privado |
| `UNSAFE_URL` | URL ou redirecionamento recusado pela proteção de rede |
| `MEDIA_TOO_LARGE` | Arquivo acima do limite do tipo |
| `UNSUPPORTED_MEDIA_TYPE` | Conteúdo real não é uma imagem permitida ou MP4 |
| `MEDIA_FETCH_FAILED` | Falha de rede, timeout ou resposta inesperada |
| `MEDIA_IMPORT_BUSY` (429) | Aguardar importações em andamento |
| `MEDIA_TEMP_SPACE` (503) | Liberar espaço temporário no servidor |

Não são devolvidos URL assinada, HTML, token de confirmação ou detalhes internos.
A descrição das ferramentas explica o uso do link comum; o agente não precisa
transformar a URL nem baixar o arquivo no próprio computador.

## Referências

- [Download de arquivos no Drive](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Chaves de recursos](https://developers.google.com/workspace/drive/api/guides/resource-keys)
- [Permissões de download](https://support.google.com/drive/answer/2423534?hl=pt-BR)

## Validação desta implementação

- 244 testes passaram em 20 suítes direcionadas (193 de upload/MCP/perfis e
  consultas operacionais,
  40 do controller REST e 11 de consumidores existentes do fetch). TypeScript
  do backend, Prettier e verificação do diff também passaram.
- Os testes cobrem os links comuns, confirmação GET, resourcekey,
  quotas em HTTP e HTML, redirecionamentos, HTML disfarçado, limites reais,
  escrita em vários chunks, falhas, limpeza e isolamento do perfil em REST/MCP.
- Tentativas reais com dois arquivos públicos de exemplo do projeto gdown
  encontraram quota excedida no Google. O formulário real de confirmação foi
  reconhecido e seguido; a quota posterior é devolvida como
  `DRIVE_DOWNLOAD_LIMIT`, sem tentar contornar a restrição ou usar login/cookies.
- Em 04/11/2026, o arquivo público fornecido pelo usuário percorreu a confirmação
  real e concluiu o download grande em aproximadamente 33 segundos. O Google
  declarou 790.429.970 bytes (753,81 MiB) e `video/mp4`. A gravação foi recusada
  com `UNSUPPORTED_MEDIA_TYPE`: inspeção independente dos primeiros 64 KiB,
  obtidos por Range, identificou `video/quicktime`, com marca `ftypqt`, apesar
  da extensão `.mp4`. O suporte atual aceita MP4, não MOV.
- Esse teste usou o serviço compartilhado e storage local isolado, sem banco de
  produção, agendamento ou publicação. A gravação da mídia não foi executada
  após a rejeição do formato. Os temporários foram removidos. Esse caso valida
  o download grande real e a rejeição pelo conteúdo.
- Na mesma data, o primeiro dos dois novos arquivos públicos enviados pelo usuário
  concluiu a confirmação, download e gravação no storage local isolado em
  12,18 segundos: 301.421.058 bytes (287,46 MiB), reconhecidos pelo conteúdo como
  `video/mp4`. SHA-256 do arquivo baixado e da cópia armazenada coincidiram;
  o perfil informado foi preservado na chamada de registro. O segundo arquivo
  não foi necessário, pois era alternativa em caso de falha.
- O teste positivo executou `MediaTransferService.fromUrl` com download, detecção
  real e `LocalStorage.uploadFromFile`; somente o registro no banco foi substituído
  por recibo de teste. Não criou mídia no banco da instância nem chamou seu MCP/API
  em produção. Nada foi agendado ou publicado, e todos os arquivos do teste foram
  removidos ao terminar.
