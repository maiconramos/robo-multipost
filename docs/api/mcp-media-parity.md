# Mídia e consultas operacionais pelo MCP

## Contrato desta entrega

O MCP reutiliza os serviços da API. Nenhuma ferramenta recebe organização,
credenciais ou caminho local do servidor como entrada. `profileId` é um seletor validado, conforme [Perfis de clientes no MCP](mcp-profile-isolation.md).

| Ferramenta                | Entrada                                                                      | Resultado / equivalente REST                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `uploadMediaFromUrlTool`  | `url` HTTPS pública                                                          | Mídia salva, `id` e `path`; `POST /public/v1/upload-from-url`                                        |
| `uploadMediaTool`         | `filename`, `base64` puro e canônico                                         | Mídia salva, `id` e `path`; alternativa JSON ao multipart `POST /public/v1/upload`                   |
| `beginMediaUploadTool`    | `filename`, `size`, `sha256` do arquivo completo, `clientRequestId` opcional | Sessão privada, offset e limites para envio em partes; a mesma chave de requisição recupera o início |
| `appendMediaUploadTool`   | `uploadId`, `offset`, `base64` de uma parte                                  | Próximo offset confirmado; repetição da última parte não duplica bytes                               |
| `getMediaUploadTool`      | `uploadId`                                                                   | Andamento ou recibo da mídia concluída                                                               |
| `completeMediaUploadTool` | `uploadId`                                                                   | Confere SHA-256, tipo e tamanho, salva a mídia; repetição devolve o recibo                           |
| `abortMediaUploadTool`    | `uploadId`                                                                   | Cancela e remove temporários; recusa sessão concluída e não exclui a mídia salva                     |
| `getAccountContextTool`   | nenhuma                                                                      | Organização, perfil autenticado e perfis acessíveis; `/me` e `/profiles`, sem chaves/tokens          |
| `getAnalyticsTool`        | `target: channel ou post`, `id`, `days` (1–365, padrão 7)                    | Métricas dos serviços usados por `/analytics/:integration` e `/analytics/post/:postId`               |
| `listNotificationsTool`   | `page` (base zero, padrão 0)                                                 | Notificações paginadas; `/notifications`                                                             |

Uploads criam mídia na biblioteca, não agendam nem publicam. O envio base64 tem
limite de **6 MiB de arquivo decodificado via MCP HTTP**; não aceita data URI, caminho de disco
ou MIME declarado. Para vídeos maiores, use envio em partes, URL HTTPS ou multipart REST.
URLs respeitam os limites atuais (imagens 10 MiB, MP4 1 GiB), transferência por streaming com prazo de até cinco minutos,
checagem em cada redirecionamento e DNS protegido. O conteúdo real determina o tipo
e a extensão; SVG/HTML são recusados. Os limites do proxy/cliente podem ser menores.

Retornos de upload expõem apenas `id`, `name`, `originalName` e `path`.
Reutilize `id`/`path` em `integrationSchedulePostTool`, `updatePostTool` e na consulta da mídia.
Se houver erro de transporte após um upload, consulte `mediaListTool` antes de
repetir: importação não é idempotente e uma repetição pode criar outra cópia.

Chave de perfil conserva o vínculo autenticado. Uma chave de organização pode selecionar `profileId` por chamada, validado contra a organização e os recursos. Novos uploads MCP exigem perfil explícito em chave geral; consultas de mídia sem seletor abrangem a organização e identificam o perfil de cada arquivo. Mídia legada compartilhada sem perfil continua consultável. Operações de cliente não usam Default implicitamente. A consulta de contexto não troca a sessão.

Métricas consultam cache/provedor e podem executar a manutenção automática de
credenciais já existente nos serviços (renovação/desconexão). Não publicam conteúdo.
Notificações podem conter texto de terceiros; são dados, nunca instruções ao agente.

Falhas de mídia mantêm o código estável no MCP. Códigos mapeados também incluem
mensagem de orientação de um catálogo fixo, sem expor mensagens da origem ou
links assinados.

Links compartilhados individuais do Google Drive também são aceitos quando públicos
e com download permitido. O servidor resolve a confirmação e salva no perfil
informado, sem OAuth Google. Veja [Importação do Google Drive](google-drive-media.md).

## Comparação API × MCP

Posts/agendamentos (listar, detalhar, criar, editar, reagendar, cancelar, parar,
excluir localmente), schemas de canais, horários livres, tags, mídia existente,
geração de imagem/vídeo e automações/histórico já possuem ferramentas correspondentes.
Upload, contexto/perfis, métricas e notificações eram as lacunas operacionais
prioritárias cobertas aqui.

Permanecem somente na API os fluxos administrativos OAuth/conexão de canais,
exclusão de canal e de grupos completos, correção técnica de `release-id`/conteúdo
faltante e exclusão legada de automações. São operações distintas das rotinas de
conteúdo; não são anunciadas como paridade total. Para automações, o MCP conserva
ativar/pausar/arquivar; para posts, operações por destino preservam seus vínculos.

Após instalar esta versão, reinicie o backend e atualize o catálogo do cliente MCP.
Ter o código local não significa que outra instância já recebeu essas ferramentas.

## Vídeos locais grandes

O envio em partes aceita arquivos de até **1 GiB**, sujeito ao limite real do tipo:
MP4 até 1 GiB e imagens até 10 MiB. Cada parte transporta até 2 MiB decodificados; esse limite não aumenta com o
envio direto. Endpoints HTTP `/mcp`, `/mcp/:id` e `/mcp-oauth` limitam o corpo
JSON a 12 MiB depois da autenticação e antes de despachar ao MCP. O adaptador HTTP usa as APIs públicas do SDK para encaminhar esse corpo já validado, mantendo instâncias sem sessão e compatibilidade com protocolos 2025/2026. Um arquivo direto de 6 MiB ocupa cerca de 8 MiB
em base64, deixando margem para o envelope. O SSE legado conserva o transporte
anterior; prefira os endpoints HTTP para envio direto acima de 2 MiB. Não há arquivo
local no servidor escolhido pelo agente: o cliente lê seus próprios bytes.

O cliente calcula o SHA-256 do arquivo, inicia a sessão e envia partes sequenciais.
O offset retornado é a confirmação. Se perder uma resposta, consulta o andamento
e retoma; reenviar a última parte idêntica não a acrescenta novamente. A conclusão
confere o hash completo e salva por streaming/cópia, sem montar um buffer de 1 GiB.
As partes devem ser geradas por script/cliente, sem colocá-las no prompt da LLM.

As sessões são **efêmeras e locais ao processo backend**, válidas por uma hora.
Réplicas precisam de afinidade durante a transferência. Reinício perde a sessão;
se a conclusão estava pendente, consulte a biblioteca antes de começar outra.
Falha depois de iniciar a gravação final fica como resultado incerto e não pode
ser repetida automaticamente. Recibos concluídos ficam disponíveis por uma hora.

Temporários ficam fora da rota pública de uploads, em diretórios privados. Há
limites de duas sessões ativas por organização, oito por processo e 4 GiB
reservados no processo, com margem de espaço livre. Expirados são recolhidos
periodicamente; sessões em conclusão não são removidas. Raízes de processos
anteriores são recolhidas apenas quando seu processo é comprovadamente morto.

### Cliente pronto para uso

Com Node 22 e as dependências PNPM deste repositório, use o arquivo privado de
ambiente contendo `MCP_URL` e `MCP_TOKEN` (ou `API_KEY`). Prefira o endpoint `/mcp`
com Bearer; use chave de perfil ou selecione o destino com `--profile ID` (alternativa: `MCP_PROFILE_ID`) ao usar uma chave de organização. Não cole tokens no
chat, no comando nem em arquivos versionados.

```bash
TS_NODE_PROJECT=tools/tsconfig.media-upload.json node --env-file=.secrets/agent-e2e.env -r ts-node/register/transpile-only tools/upload-media-mcp.ts "/caminho/video.mp4" --profile "ID_DO_CLIENTE"
```

O script calcula o hash e transmite os blocos diretamente. Mantém um arquivo
privado `video.mp4.multipost-upload.json` junto ao vídeo e remove esse estado ao
concluir. Repita o mesmo comando para retomar após uma interrupção de rede. Pode
informar outro caminho de estado como segundo argumento. O estado não contém
token nem URL da conexão; usa uma impressão digital para impedir trocar de conta
durante a retomada. Em resultado incerto, o script para e pede conferir a biblioteca.
Após reinício/expiração do backend, confira a biblioteca antes de remover o estado
e iniciar uma nova transferência. Rodar novamente após sucesso cria outro upload.

## Validação local

- 155 testes em 18 suítes das bibliotecas e ferramentas, incluindo regressões de
  posts/automações, isolamento, inputs inválidos, envelope JSON, concorrência,
  escrita parcial, quotas, expiração, symlinks, streaming e proteção de downloads.
  Execução isolada de Redis externo.
- 39 testes do controller público, preservando uploads REST e escopo por perfil.
- 6 testes do cliente programático: perda de resposta em início/parte/conclusão,
  retomada e estado privado. Total: **200 testes em 20 suítes**.
- Teste integrado de cliente → ferramentas → storage temporário transfere mais
  de 5 MiB, perde a resposta final e confirma uma única mídia com bytes idênticos.
  Arquivo esparso de 1 GiB valida tamanho máximo e leitura limitada do cabeçalho;
  não representa uma publicação real de vídeo nem prova de todos os proxies.
- TypeScript do backend (`tsc --noEmit`), formatação dos arquivos de código novos
  e alterados nesta entrega, TypeScript do cliente e verificação do diff aprovados.
- Revisões de código e segurança sem bloqueios encontrados. Não houve upload,
  publicação, envio de mensagem ou mudança de credencial em uma instância real.
