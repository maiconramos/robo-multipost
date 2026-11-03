# Posts e agendamentos por API e MCP

Para importar arquivos e consultar contexto, métricas e notificações, consulte
[Mídia e consultas operacionais pelo MCP](mcp-media-parity.md).

Gerenciamento de um destino existente, preservando ID, grupo, conta, comentários encadeados e vínculos com automações. Complementa [Automações por API e MCP](automations-agent-api.md). Publicar em Instagram e Facebook gera dois destinos: cada um tem seu ID e pode ter seu horário/automação.

## Autenticação e escopo

REST usa `Authorization: CHAVE_API`, sem Bearer. Uma chave de perfil só acessa o próprio perfil; `?profileId=outro` é recusado. Na nova fachada, chave de organização sem `profileId` resolve somente Default. No MCP, a organização e o vínculo da credencial vêm do contexto autenticado. O seletor `profileId` é validado por chamada conforme [Perfis de clientes no MCP](mcp-profile-isolation.md).

Uma chave de organização pode operar a agência inteira no MCP: listagens gerais abrangem a organização; operações de cliente exigem `profileId` explícito, validado contra a credencial e os recursos. Na criação, cada `socialPost[]` possui seu perfil. Chaves de perfil continuam limitadas ao próprio. Nenhuma operação MCP de cliente resolve Default por omissão. A fachada REST conserva sua semântica legada quando não recebe `?profileId`.

## Matriz de operações

| Recurso | API | MCP |
|---|---|---|
| Criar/agendar/rascunho | POST `/public/v1/posts` | integrationSchedulePostTool |
| Descobrir campos/limites comuns | GET `/public/v1/post-management/capabilities` | getPostOptionsTool, resource=capabilities |
| Configurações/regras por rede | GET `/public/v1/integration-settings/:integrationId` | integrationSchema |
| Listar posts existentes | GET `/public/v1/post-management` | listPostsTool |
| Consultar configuração completa | GET `/public/v1/post-management/:id` | getPostTool |
| Editar no mesmo ID | PUT `/public/v1/post-management/:id` | updatePostTool |
| Reagendar/cancelar/publicar/excluir/recuperar | POST `/public/v1/post-management/:id/actions` | managePostScheduleTool |
| Tags/horário livre | GET `/public/v1/post-management/options?resource=tags\|free_slot` | getPostOptionsTool |

As rotas antigas `/public/v1/posts` permanecem compatíveis. Para editar, use a fachada nova; ela evita reorganizar o grupo ou recriar registros. Esta entrega cobre o gerenciamento de posts/agendamentos e automações descrito nestas referências; não é uma promessa de expor administração de cobrança, marketplace, aprovações de clientes ou qualquer ação remota que o produto não implemente.

## Listagem, detalhe e versão

Filtros da lista: `startDate`, `endDate` (ISO com fuso), `integrationId`, `state` (QUEUE/PUBLISHED/ERROR/DRAFT), `customer`, `cursor` e `limit` (1–100, padrão 20). Sem datas, a consulta pode percorrer todos os registros do perfil por cursor. Retorno: `posts` e `nextCursor`.

O detalhe retorna ID interno, `version`, estado, grupo, dados públicos da conta, resultado remoto (`releaseId`/`releaseURL`), indicador `hasError` e `configuration`. Não retorna tokens, Integration completa nem erros brutos de publicação. `version` é um snapshot da cadeia e tags, não uma revisão inventada pelo agente.

Antes de alterar, consulte o detalhe e copie `version` para `expectedVersion`. `409 POST_VERSION_CONFLICT` exige reler e reconciliar a intenção. Não repetir cegamente uma edição antiga nem criar outro post para contornar o conflito. A transação valida o snapshot e as operações gerenciadas permanecem serializadas até concluir a sincronização Temporal.

## Campos editáveis

`updatePostTool` recebe `postId`, `expectedVersion`, `configuration` e `localOnly` opcional. Na REST, o ID está na URL e os demais campos no corpo.

| Campo em configuration | Uso |
|---|---|
| date | Data ISO com fuso. Em QUEUE, reagenda e sincroniza o workflow; rascunho continua rascunho |
| messages | Cadeia completa quando informada: raiz primeiro, depois comentários/partes do thread |
| messages[].id | Preserve os IDs existentes. A raiz não pode ser substituída. Novos comentários omitem ID |
| messages[].content | Texto HTML, sanitizado e validado pelo contrato nativo |
| messages[].delay | Atraso em **minutos**, inteiro 0–10080 |
| messages[].media | Lista completa de mídia daquela mensagem; `[]` remove mídia |
| media[].id / path | ID e caminho/URL. Use o upload existente; caminhos locais ficam confinados a UPLOAD_DIRECTORY e URLs remotas devem ser HTTPS público |
| media[].alt / thumbnail | Texto alternativo e URL pública de miniatura opcionais |
| settings | Pares `{key,value}` com value em JSON-string. Faz merge, preservando as chaves omitidas |
| removeSettingKeys | Remove explicitamente configurações opcionais. Não pode remover/mudar o provider |
| tags | `{value:ID,label:NOME}`; IDs obtidos em options/tags. `[]` remove tags; tags de outro perfil são recusadas |
| intervalInDays | Inteiro 1–3650 ou null para remover recorrência, em posts ainda não publicados |
| shortLink | true transforma links somente nas mensagens fornecidas. Não é estado persistido; false não desfaz URLs já encurtadas |

Campos omitidos permanecem. `messages`, quando enviada, substitui a cadeia inteira: não enviar só a raiz se houver comentários que devam permanecer. Até 100 mensagens, 100 mídias por mensagem, 100 settings e 100 tags. Limites de texto, tipo de publicação, colaboradores, capa, Trial Reel e demais opções específicas são os do provider: descubra-os antes de editar e use settings JSON.

Exemplo de reagendamento sem tocar em conteúdo/mídia:

```json
{
  "postId": "ID_INTERNO_EXISTENTE",
  "expectedVersion": "VERSION_DO_DETALHE",
  "configuration": { "date": "2026-11-05T15:00:00-03:00" }
}
```

Exemplo de configuração específica do Instagram, preservando as demais chaves:

```json
{
  "postId": "ID_INTERNO_EXISTENTE",
  "expectedVersion": "VERSION_DO_DETALHE",
  "configuration": {
    "settings": [
      { "key": "post_type", "value": "\"post\"" },
      { "key": "is_trial_reel", "value": "false" },
      { "key": "collaborators", "value": "[{\"label\":\"parceiro\"}]" }
    ]
  }
}
```

## Ações e efeitos

Todas exigem `expectedVersion`. No MCP também informe `postId`.

| operation | Efeito |
|---|---|
| schedule | Exige `date` futura com mais de 60s; agenda/retoma o mesmo ID |
| cancel | Cancela futuros envios. QUEUE/ERROR/DRAFT vira DRAFT e desliga recorrência. Publicado mantém PUBLISHED e seus resultados, removendo repetição futura |
| publish_now | Publica de verdade o mesmo destino, com data atual |
| delete | Exclui localmente só a cadeia desse destino e para futuros workflows; não remove conteúdo já publicado na rede nem apaga a automação |
| sync | Recupera a sincronização de QUEUE futuro ou DRAFT sem reconstruir o post. Nunca inicia PUBLISHED |
| stop | Persiste DRAFT e desliga recorrência antes de parar Temporal, inclusive depois do horário previsto. Publicados conservam estado e resultados; excluídos permitem repetir a parada sem restaurar o registro |
| retry_publish | Nova tentativa explícita que pode publicar novamente; exige `republish=true`, após conferir o resultado anterior e com autorização do usuário |

Em PUBLISHED, schedule/publish_now exigem `republish=true` explícito. Não usar essa opção para uma simples edição. `retry_publish`, publish_now, republicação e exclusão não são ações de diagnóstico.

Uma operação de edição/cancelamento normal de QUEUE é recusada nos 60 segundos anteriores ao horário previsto (`POST_PUBLICATION_WINDOW`). Isso é margem defensiva, não detecção absoluta de processamento. Um envio já iniciado no provedor pode terminar mesmo após parar o workflow; a resposta informa `inFlightPublicationMayComplete`.

`stop` também funciona nessa janela: preserva conteúdo e IDs, mas retira QUEUE da recuperação automática de posts faltantes. Assim, parar um envio de resultado incerto não permite que o recuperador o publique mais tarde sem uma ação explícita.

Em publicação recorrente já realizada, patch local **não reinicia** o workflow. Mudar o intervalo exige reagendamento explícito da próxima execução; cancel remove a recorrência e pode ser repetido para recuperar uma falha da parada. O post publicado e seus IDs remotos continuam preservados.

## Falha parcial e recuperação

A gravação é confirmada antes do RPC Temporal. O RPC é aguardado, tem deadline real de dez segundos e não é deixado rodando por um simples Promise.race. O orçamento da trava inclui a espera para adquiri-la, com verificação de validade antes de gravar e sincronizar.

Se salvar e a sincronização falhar, retorna `saved=true`, o mesmo ID, configuração/versão e `synchronizationError=POST_SCHEDULE_SYNC_FAILED`. Não criar outro post.

- QUEUE futuro/DRAFT: reler e usar sync.
- Publicado/recorrência cancelada: reler e usar stop para repetir a parada.
- Excluído: getPostTool com `includeDeleted=true` (REST: query equivalente), depois stop com a versão retornada.
- QUEUE que já chegou ao horário, especialmente após publish_now: sync não reinicia às cegas. Retorna `POST_PUBLICATION_OUTCOME_REVIEW_REQUIRED`. Confira a publicação na rede e use stop ou, somente quando explicitamente autorizado, retry_publish com republish=true.

Na criação MCP, o lote inteiro é validado antes da primeira gravação. Uma falha de armazenamento durante um destino ainda pode ter resultado parcial no caminho legado: a resposta distingue IDs confirmados em `output` e IDs de resultado incerto em `uncertainPosts`, com `outcomeUnknown=true`. Inspecione esses IDs antes de repetir qualquer criação. Nome/horário não oferecem idempotência automática.

## Criação MCP: campos antes ausentes

O payload anterior permanece aceito. Cada item de `socialPost` mantém `integrationId`, `isPremium`, `date`, `shortLink`, `type` (draft/schedule/now), `settings` e `postsAndComments`. Foram acrescentados:

- `tags` com IDs/nomes do perfil;
- `intervalInDays` opcional para recorrência;
- `postsAndComments[].delay` em minutos;
- `postsAndComments[].media` com id/path/alt/thumbnail, como alternativa a `attachments` de URLs. Não enviar os dois preenchidos.

Valores de settings são convertidos do JSON antes da validação nativa; `"false"` representa o boolean false, não uma string verdadeira. O tipo do provider é definido pela conta; não forneça `__type` manualmente nem chaves de prototype pollution.

## Publicados, automações e limites

Editar PUBLISHED exige `localOnly=true`: a alteração vale no registro do MultiPost, **não edita o post já publicado na Meta**. Também não republica nem encerra uma recorrência por efeito colateral. Exclusão local não promete excluir a publicação remota.

Ao editar/reagendar, o ID interno e os targets de automação permanecem. Os IDs remotos congelados da primeira publicação também são mantidos nos targets; republicar explicitamente um registro não troca silenciosamente a automação para a nova publicação. Outros canais e destinos do grupo não são editados pela operação.

As ferramentas são schemas concretos, sem organização ou credenciais em input e com seleção de perfil validada, e usam o mesmo domínio da REST. Esta entrega não altera SDK/CLI, credenciais nem a interface. Testes são automatizados e usam banco temporário isolado; validação local de catálogo é somente leitura. Nenhum post real é criado, reagendado, publicado, cancelado ou excluído nesta revisão.
