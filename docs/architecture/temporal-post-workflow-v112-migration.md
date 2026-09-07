# ADR — migração do workflow de publicação Temporal V102 → V112

## Status

Base incremental implementada com rollout opt-in. O runtime padrão de produção
permanece em `postWorkflowV102`; `postWorkflowV112` só recebe novas execuções
quando um canário é ativado explicitamente.

Origem analisada: sequência upstream até `3e6206f7` (workflow V1.1.2). A
implementação será adaptada às invariantes do Multipost; não será feito
cherry-pick do pipeline upstream.

## Contexto

O upstream dividiu a publicação em fases de envio, espera, consulta e
finalização. Isso melhora operações assíncronas e reciclagem do workflow, mas a
mudança substitui o pipeline inteiro, altera contratos de activities e toca
quinze providers.

O fork possui comportamentos que não podem regredir:

- workflows V102 já têm históricos em produção;
- integrações são isoladas por perfil e seus tokens permanecem criptografados;
- perfis cancelados são filtrados e a exclusão encerra recursos vinculados;
- Meta usa Graph v25, `resolveIgRoute`, credenciais por perfil, diagnóstico
  190/460/464 e self-heal por Usuário do Sistema;
- Instagram mantém o vínculo de flows em `next_publication`;
- notificações de perfil usam payloads internacionalizados;
- X usa upload v1.1;
- Zernio executa suas activities na fila `main`;
- os workers de provider executam somente activities.

Copiar V112 diretamente removeria parte dessas invariantes. Também não é seguro
inferir que uma activity de publicação não executou apenas porque um heartbeat
timeout chegou sem `details`: heartbeats são emitidos pelo worker em execução,
podem ser limitados e o último heartbeat pode não chegar ao servidor antes de
uma falha. Repetir a mutação nesse caso pode publicar duas vezes.

## Decisão

### 1. Coexistência versionada

- V101 e V102 continuam exportadas e registradas para reproduzir históricos.
- A nova implementação será adicionada como `postWorkflowV112`.
- Nenhum workflow existente será migrado ou reiniciado em massa.
- Novos workflows continuam em V102 enquanto todos os gates estiverem
  desligados.

O roteamento para V112 será opt-in e cumulativo:

- `POST_WORKFLOW_V112_INTEGRATION_IDS`: canário por integração;
- `POST_WORKFLOW_V112_PROVIDERS`: expansão por provider;
- `POST_WORKFLOW_V112_ALL=true`: promoção global explícita.

Sem configuração, o comportamento é V102. Zernio permanece em V102/fila
`main` até possuir um teste próprio.

### 2. Contratos aditivos

As fases `post`, `pending`, `checkPostStatus` e `finalizePost` serão introduzidas
por novos contratos. Assinaturas e semântica das activities usadas pelos
históricos V102 não serão alteradas.

O estado pendente deve ser pequeno, serializável e específico do provider. Não
pode conter access token, segredo, cabeçalho de autenticação nem resposta bruta
de terceiros.

### 3. Idempotência de mutações externas

- Cada tentativa de mutação externa terá `maximumAttempts: 1` no Temporal.
- Timeout após o início da mutação produz resultado **desconhecido**, não falha
  seguramente repetível.
- A recuperação consulta o status remoto por identificador idempotente quando o
  provider oferecer esse recurso.
- Consultas de status, por serem somente leitura, podem ter retry limitado.
- Provider sem consulta confiável exige reconciliação/ação humana; nunca um
  segundo envio automático cego.

`Schedule-To-Start` representa ausência/capacidade de poller antes da execução;
heartbeat representa uma activity que já começou. A saúde das filas de
activities será monitorada separadamente antes do primeiro canário.

### 4. Tokens e reconexão

Descriptografia permanece exclusivamente em activity. O workflow recebe apenas
status sanitizado e identificadores. Em V112, após um refresh bem-sucedido, a
activity recarrega do banco a integração criptografada atualizada antes de
prosseguir. O contrato legado de refresh da V102 permanece intacto.

Devem continuar cobertos os erros Meta 190/460/464, `refreshNeeded`, System User
self-heal, credenciais por perfil, Graph v25 e `resolveIgRoute`.

### 5. Rollout e rollback

1. monitorar pollers de workflow e de activity por tipo de fila;
2. congelar históricos V102 representativos e validar replay;
3. adicionar contratos/activities V112 com os gates desligados;
4. executar canário de uma integração Meta em prerelease;
5. expandir um provider por vez, com publicação real controlada;
6. ativar `POST_WORKFLOW_V112_ALL` somente após a matriz de smoke tests.

Para rollback, desliga-se o gate de novas execuções. Workflows V112 já iniciados
devem ser drenados ou reconciliados; não serão terminados em massa enquanto uma
mutação puder estar pendente.

## Gates de teste

- `Worker.runReplayHistory` para históricos V101/V102 e da nova V112;
- testes de unidade de roteamento, estado pendente e classificação de falhas;
- teste controlado em que o worker morre depois do envio e antes do heartbeat,
  provando que não ocorre uma segunda publicação;
- regressões de perfil cancelado, aprovação, recorrência e flow do Instagram;
- regressões de criptografia, Meta 190/460/464, fallback de Usuário do Sistema e
  SSRF/DNS-pinning;
- smoke real em prerelease para cada provider promovido.

Históricos reais usados em replay devem ser exportados de forma sanitizada. Não
serão versionados payloads com tokens, mídias privadas ou dados pessoais.

O executor local está documentado em
[`temporal-post-workflow-replay.md`](../operations/temporal-post-workflow-replay.md).
Em 06/09/2026, a implementação passou por replay local de históricos V101,
V102 (incluindo refresh e rejeição do provider) e V112. O teste sintético em
Docker também derrubou o worker depois de registrar a mutação externa e antes
do próximo heartbeat: a execução terminou como não confirmada, com uma única
mutação. Os arquivos exportados permanecem temporários e não são versionados.

### Canários reais em produção (07/09/2026)

Três execuções reais foram observadas no perfil Três Lagoas, todas criadas como
`postWorkflowV112`, todas `COMPLETED` na tentativa 1, sem nenhum evento
`ACTIVITY_TASK_FAILED` ou `ACTIVITY_TASK_TIMED_OUT`.

| # | Versão | Canal | Integração | Workflow | Duração da mutação |
| ---: | --- | --- | --- | --- | ---: |
| 1 | `0.5.6-rc.11` | Facebook | `cmsd86h9y…e6b8m` | `post_cmsn9ns3q0060pf9ojakudd0e` | — |
| 2 | `0.5.6-rc.12` | Facebook | `cmsd86h9y…e6b8m` | `post_cmsnaauip0063pf9ouojo6okz` | 3,98 s |
| 3 | `0.5.6-rc.12` | Instagram | `cmshir683…umqef` | `post_cmsnabkcg0066pf9onxy6p7tg` | 41,1 s |

Em todas: estado final `PUBLISHED` com `releaseId` e `releaseURL` gravados,
publicação confirmada na rede, integração mantida ativa (`disabled=false`,
`refreshNeeded=false`, sem `refreshError`) e nenhuma linha nova em `Errors`. Nos
canários 2 e 3, `Integration.updatedAt` permaneceu anterior à publicação — o
workflow não reescreveu a credencial nem marcou o canal para reconexão.

Invariantes que deixaram de ser apenas afirmação de projeto e passaram a ter
evidência observada no histórico do Temporal:

- **uma única tentativa na mutação externa.** `postSocialPending` aparece com
  `maximumAttempts: 1` nos três históricos, enquanto as demais activities — que
  só leem e escrevem no banco do próprio produto — mantêm `maximumAttempts: 3`;
- **roteamento por fila de provider.** A mutação e os plugs executam na fila do
  provider (`facebook`, `instagram`) e as activities de suporte na fila `main`;
  o workflow em si é sempre iniciado em `main`. As filas de provider são criadas
  a partir de `providerIdentifier.split('-')[0]`, sem configuração manual;
- **payloads sem credencial.** Os 32 payloads de cada histórico foram
  decodificados e inspecionados por chave e por valor: `postSocialPending`
  recebe `integrationId` como referência e nunca o token. Nenhum campo de
  autorização, cookie, API key, segredo, senha ou erro bruto foi encontrado
  (`forbiddenCount = 0` nos três).

O canário 1 revelou um problema independente do rollout: uma falha antiga
permanecia em `Post.error` após a republicação. A correção entrou na
`0.5.6-rc.12` e foi validada no canário 2, que republicou um post com falha real
registrada em `Errors` no dia anterior e terminou com `Post.error` nulo e a linha
histórica de `Errors` preservada.

O Instagram publica em duas etapas (criação do container de mídia e publicação),
o que explica a mutação de 41,1 s contra 3,98 s do Facebook. É o provider em que
a janela entre o início da mutação e a confirmação é maior e, portanto, aquele em
que a regra de resultado não confirmado após timeout tem mais chance de ser
exercitada na prática.

Ainda não concluídos: um segundo agendamento real no Instagram, smoke real dos
demais providers e promoção gradual. Portanto, os gates continuam desligados por
padrão, exceto pelas integrações explicitamente listadas.

## Implementação entregue

- seletor cumulativo por integração, provider e opt-in global, com Zernio
  permanentemente fixado em V102 nesta fase;
- contratos aditivos `postPending`, `checkPostStatus` e `finalizePost`, com
  fallback para o `post()` legado enquanto o provider não adota fases próprias;
- activities de mutação com uma tentativa, heartbeat e distinção segura de
  `Schedule-To-Start`; heartbeat timeout, com ou sem details, permanece
  resultado desconhecido e nunca dispara segundo envio cego;
- estado pendente normalizado como JSON, limitado a 64 KiB e recusado quando
  contém campos de credencial;
- V112 recebe apenas metadados permitidos da integração. Token, refresh token,
  detalhes customizados e erro bruto do post não entram como argumentos ou
  resultados do workflow; cada activity recarrega e descriptografa no runtime;
- recuperação de posts ausentes respeita o mesmo seletor e não recupera posts
  de perfis excluídos/cancelados;
- notificação específica de resultado não confirmado, orientando conferência
  antes de republicar.

## Consequências

A migração é mais lenta que aplicar o upstream integralmente, mas preserva a
compatibilidade dos históricos e impede que uma falha ambígua vire publicação
duplicada. O probe separado das filas e a base V112 já estão implementados; a
versão efetiva continua V102 até a ativação deliberada de cada canário.

## Referências

- [Temporal — Detecting Activity failures](https://docs.temporal.io/encyclopedia/detecting-activity-failures)
- [Temporal TypeScript — `Worker.runReplayHistory`](https://typescript.temporal.io/api/classes/worker.Worker#runreplayhistory)
- [`upstream-sync-triage-2026-08.md`](../planning/upstream-sync-triage-2026-08.md)
- [`upstream-head-refresh-2026-09-03.md`](../planning/upstream-head-refresh-2026-09-03.md)
