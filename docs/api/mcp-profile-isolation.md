# Perfis de clientes no MCP

Uma conexão com chave de organização pode atender vários clientes. `profileId`
é uma seleção validada **para uma única chamada**, sem trocar a sessão. A
organização vem da autenticação e nunca é aceita como argumento. Uma chave de
perfil ou token OAuth vinculado a perfil continua limitado ao próprio perfil;
selecionar outro retorna `PROFILE_KEY_MISMATCH` antes de consultar o recurso.

## Descoberta para agentes com chave de organização

A mesma chave da organização serve para operar os clientes autorizados. O ID de
perfil é um identificador de recurso, não uma chave de autenticação. Não crie ou
solicite uma chave por cliente somente porque uma operação exige `profileId`.

1. Chame `getAccountContextTool` sem argumentos para identificar o escopo da
   credencial e obter `profiles[].id` e nome.
2. Relacione o cliente solicitado aos perfis retornados. Se houver ambiguidade,
   pergunte qual cliente; não escolha o primeiro nem o Default automaticamente.
3. Chame `integrationList` com o `profileId` escolhido para obter seus canais.
4. Reutilize a mesma credencial e passe `profileId` em cada operação de cliente.
   No agendamento em lote, preencha `socialPost[].profileId` em cada destino.
5. Ao receber `PROFILE_REQUIRED`, consulte o contexto e refaça a chamada com a
   seleção explícita; a seleção não permanece para as próximas chamadas.

Chaves de perfil continuam limitadas ao perfil autenticado. `PROFILE_KEY_MISMATCH`
não autoriza ampliar o acesso; informe a incompatibilidade e use somente uma
conexão já autorizada para o cliente correto. Perfis ausentes na descoberta não
podem ser inventados. Instruções de inicialização, descrições das ferramentas,
schema do seletor e orientações de erro reforçam esse fluxo. Alguns clientes
podem ignorar instruções de inicialização; a recuperação não depende só delas.

## Contrato

| Operação                                                                          | Chave de organização                                                                  | Chave de perfil                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `getAccountContextTool`                                                           | Lista perfis acessíveis; não aceita seletor nem troca contexto                        | Mostra apenas o perfil autenticado                               |
| `integrationList`, `mediaListTool`, `listPostsTool`, `listCommentAutomationsTool` | Sem seletor: consulta geral da organização; `profileId` opcional restringe ao cliente | Consulta apenas o próprio perfil; aceita omissão ou o próprio ID |
| Detalhe, edição, ações e histórico de um post/automação                           | Exige `profileId` explícito                                                           | Usa o perfil autenticado                                         |
| Criar posts em lote                                                               | Exige `socialPost[].profileId` em **cada destino**                                    | Só permite o próprio perfil                                      |
| Criar automação, upload e fases de upload em partes                               | Exige `profileId` na chamada                                                          | Usa o perfil autenticado                                         |
| Geração de imagem/vídeo, base de conhecimento, busca e funções de canal           | Exige o perfil para selecionar biblioteca, conhecimento e credenciais corretos        | Usa o próprio perfil                                             |

Schemas/catálogos públicos de redes e ferramentas sem dados de cliente não exigem
seleção. Nenhuma operação de cliente cai silenciosamente no Default. Para operar
o Default, selecione seu ID explicitamente. Não é necessário criar um conector
por cliente.

`getAccountContextTool` descreve o vínculo da **credencial**: numa chave de
organização, `profile=null`, `postAutomationScope=organization` e
`writeProfileRequired=true`. Isso continua válido após qualquer chamada que
selecionou um cliente.

Listagens de canais e posts identificam `profileId` e `profile: {id,name}`.
Mídias com `profile=null` são compartilhadas na organização; uma chave de perfil
pode consultar essas mídias e as próprias. Novos uploads MCP exigem um destino de
perfil para evitar criar mídia compartilhada por omissão. Canais legados sem
perfil aparecem identificados como tal na consulta geral; isso não autoriza
movê-los para um perfil ou criar conteúdo neles automaticamente.

## Exemplo de agência

1. Chame `getAccountContextTool` e identifique o ID do cliente pelo nome.
2. Consulte `integrationList({profileId: "CLIENTE"})`.
3. Consulte `listPostsTool({profileId: "CLIENTE", state: "QUEUE"})`, com datas
   e canais desejados. Sem `profileId`, a chave geral lista a organização com
   paginação e identifica os clientes de cada resultado.
4. Envie a mídia com `profileId: "CLIENTE"`.
5. Crie com `socialPost[].profileId: "CLIENTE"` e o canal correspondente.
6. Para editar, consulte o detalhe com o mesmo `profileId`, preserve a versão e
   envie o patch nesse perfil. ID de outro cliente não autoriza uma edição.

`customer` é um agrupamento legado de canais, **não é o perfil**. Não use esse
campo para selecionar um cliente/perfil do MultiPost.

## Validações e concorrência

- A seleção deve pertencer à organização autenticada e estar ativa.
- Perfil selecionado e canal devem corresponder. O lote inteiro é validado antes
  da primeira gravação; um destino incompatível impede iniciar o lote.
- Cada destino guarda seu próprio perfil validado até a persistência. Recibos
  confirmados e IDs de resultado incerto incluem `profileId` para recuperação.
- Associações históricas inconsistentes (automação em A com canal de B) são recusadas também no detalhe, canvas, aliases, estado e histórico. Não são migradas nem reatribuídas automaticamente.
- Posts e automações existentes continuam passando pelos serviços com escopo
  obrigatório de organização e perfil; a consulta geral é um caminho separado,
  somente de leitura. Cursor/canal de outra organização são recusados.
- Chamadas simultâneas não compartilham seleção. A identidade autenticada da
  requisição prevalece sobre contexto reutilizado por bibliotecas do MCP.
- IDs e caminhos de mídias **registradas** de outro cliente/organização são
  recusados em anexos, capas, miniaturas e imagens inline. Mídia compartilhada sem
  perfil é permitida. URLs públicas externas continuam aceitas conforme as regras
  de segurança da API; isso não garante que o agente escolheu semanticamente a
  imagem ou legenda correta para a marca.
- Perfil e sessão precisam corresponder em todas as fases de um upload em partes.
  O cliente local aceita `--profile ID` ou `MCP_PROFILE_ID` e vincula a retomada a
  esse perfil. Alterar o cliente no meio da retomada é recusado.

## Compatibilidade

Conexões de perfil mantêm o uso sem seletor. Integrações com chave de organização
precisam passar o perfil nas operações de cliente; a omissão agora retorna
`PROFILE_REQUIRED`. Reconecte o cliente MCP após instalar a versão para atualizar
os schemas e descrições. A autenticação REST e sua escolha explícita por
`?profileId` permanecem; a fachada REST legada sem perfil conserva seu contrato
Default. Não confundir esse caminho com a nova listagem geral do MCP.

Não há migração de banco nem troca de credenciais nesta correção.
