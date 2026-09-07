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

Em 07/09/2026, o primeiro canário real da prerelease `0.5.6-rc.11` publicou no
Facebook pela integração Três Lagoas. A execução foi criada como
`postWorkflowV112`, terminou `COMPLETED`, salvou estado `PUBLISHED` e URL remota,
manteve a integração ativa (`disabled=false`, `refreshNeeded=false`) e não criou
uma nova falha. A inspeção dos 32 payloads decodificados do histórico não
encontrou campos de autorização, cookie, API key, token, segredo ou senha. O
teste também revelou um problema independente: uma falha antiga permanecia em
`Post.error` após a republicação; o ciclo atual passa a limpar esse estado ao
reagendar e ao publicar com sucesso, preservando a tabela histórica `Errors`.

Ainda não concluídos: smoke real dos demais providers, monitoramento prolongado
do canário e promoção gradual. Portanto, os gates continuam desligados por
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
