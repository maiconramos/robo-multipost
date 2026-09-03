# Auditoria upstream — workers Temporal activity-only

## Escopo

Porte manual e isolado dos commits upstream `5b0288fd` e `6e1c103e` sobre a
base `3bd3e8eb` do fork. O objetivo é reduzir o custo dos workers por provider e
permitir distribuir suas activities entre containers, sem incorporar o novo
pipeline de publicação do Postiz.

## Evidência da topologia atual

Todos os pontos que iniciam workflows no fork usam `taskQueue: 'main'`:
publicação V102, autopost, repost, flows, notificações, e-mails, refresh de
tokens, streak e enriquecimento de comentários. As filas `facebook`,
`instagram` e demais filas por provider recebem somente activities chamadas
por esses workflows.

Por isso, somente o worker `main` precisa de `workflowsPath`. Manter o bundle
em cada provider criava um isolate V8 e sticky workflow cache sem que aquela
fila pudesse consumir um workflow.

## Adaptação aplicada

- `main` preserva bundle de workflows e todas as activities;
- cada provider preserva as mesmas activities e seu `maxConcurrentJob`, mas
  deixa de receber `workflowsPath`;
- `WORKER_CONCURRENCY_DIVIDER` aceita apenas inteiro positivo e divide o limite
  por provider, com piso de uma activity;
- valor ausente ou inválido preserva divisor `1`, evitando reduzir capacidade
  silenciosamente;
- `EXCLUDE_QUEUE` remove filas de provider por nome exato e separado por
  vírgulas;
- tentar excluir `main` interrompe o boot com erro explícito, pois isso deixaria
  todos os agendamentos sem workflow poller;
- o log de boot informa quantidade de workers, modo activity-only, divisor e
  filas excluídas, sem imprimir segredo.

Sem as duas variáveis novas, o número de workers e os limites de concorrência
permanecem iguais aos do fork antes do porte.

## Decisões de compatibilidade

Não foram adotados os follow-ups upstream que elevam concorrência sem limite
para `1.000.000`, alteram heartbeat ou introduzem workflows V1.0.8–V1.1.2. O
LinkedIn continua com o limite `2` escolhido no porte próprio do provider, em
vez da redução incidental para `1` do commit upstream.

Filas cujo limite é `1` não podem ser divididas matematicamente entre vários
containers. Nesse caso, atribua a fila a exatamente um deles e inclua-a em
`EXCLUDE_QUEUE` nos demais.

O endpoint `/health/workers` consulta pollers de workflow. Portanto,
`TEMPORAL_HEALTH_TASK_QUEUES` deve continuar contendo somente `main`; uma fila
activity-only não é uma sonda válida para esse endpoint.

## Validação

Os testes unitários cobrem:

1. bundle somente na fila `main` e activities em todos os workers;
2. capacidade padrão preservada;
3. divisão com piso de uma activity;
4. fallback de divisores inválidos;
5. exclusão exata de providers;
6. bloqueio da exclusão de `main`;
7. falha explícita quando bundle ou activities não são fornecidos.

Também devem passar a suíte completa das bibliotecas e do backend, além dos
builds de backend e orchestrator. Não há schema, token, provider ou versão de
workflow alterado; não é necessária reconexão de canal.

## Gate de prerelease

Depois do rebuild/restart do orchestrator:

1. confirmar no log de boot `providerWorkers=activity-only` e as filas
   esperadas;
2. confirmar no Temporal UI um workflow poller em `main`;
3. confirmar activity poller nas filas de provider usadas pelo teste;
4. publicar um post inofensivo em canal de homologação e conferir o workflow e
   sua activity até `Completed`;
5. se houver mais de um container, validar que divisor e exclusões produzem a
   distribuição documentada sem excluir `main`.

Esse smoke não deve ser executado automaticamente no checkout local, pois as
variáveis dessa instalação podem apontar para banco e Temporal reais.
