# Replay dos workflows de publicação Temporal

Este runbook verifica se o código atual ainda consegue reproduzir históricos
dos workflows `postWorkflowV101`, `postWorkflowV102` e, quando existir,
`postWorkflowV112`. Replay aprovado prova compatibilidade determinística; ele
não chama providers, não publica conteúdo e não substitui o smoke test real em
prerelease.

## Segurança dos históricos

Um histórico pode conter argumentos e resultados de activities: texto do post,
URLs de mídia, IDs de perfis e integrações e material de autenticação. Trate o
JSON como segredo mesmo quando os tokens de integração estiverem criptografados
no banco.

- Prefira gerar em prerelease execuções controladas com dados sintéticos. Essa
  é a forma segura de obter um histórico sanitizado sem alterar eventos depois.
- Grave o arquivo somente em `tmp/temporal-replay/`, já ignorado pelo Git. O
  executor recusa qualquer outro diretório e arquivos que não sejam `.json`.
- Nunca cole o JSON em PR, issue, chat ou log; o comando informa apenas nome do
  workflow e do arquivo.
- Não edite payloads de um histórico para “sanitizar”: isso pode mudar decisões
  do workflow e invalidar o replay. Se uma execução real de produção for
  indispensável, mantenha a cópia apenas localmente, com acesso restrito, e
  apague-a assim que registrar o resultado sem payloads.

## Exportação

Crie o diretório temporário:

```bash
mkdir -p tmp/temporal-replay
```

Na stack local deste repositório, suba apenas os serviços Temporal quando eles
ainda não estiverem ativos:

```bash
docker compose -f docker-compose.dev.yaml up -d \
  temporal-postgresql temporal-elasticsearch temporal \
  temporal-admin-tools temporal-ui
```

O container `temporal-admin-tools` já possui o Temporal CLI e aponta para
`temporal:7233`. Para listar apenas metadados dos V102 locais:

```bash
docker exec temporal-admin-tools temporal workflow list \
  --namespace default \
  --query 'WorkflowType="postWorkflowV102"' \
  --output json
```

Com o Temporal CLI apontando para o ambiente e namespace corretos, exporte a
execução pelo `workflowId` e, de preferência, pelo `runId` exato:

```bash
temporal workflow show \
  --workflow-id post_EXEMPLO \
  --run-id RUN_ID_EXATO \
  --output json \
  > tmp/temporal-replay/facebook-success-v102.json
```

Se o CLI existir somente no container local, gere primeiro dentro dele e copie
o arquivo sem despejar os payloads no terminal:

```bash
docker exec temporal-admin-tools sh -c \
  'temporal workflow show --namespace default --workflow-id post_EXEMPLO --run-id RUN_ID_EXATO --output json > /tmp/post-v102.json'
docker cp temporal-admin-tools:/tmp/post-v102.json \
  tmp/temporal-replay/post-v102.json
```

O formato JSON de `temporal workflow show --output json` é próprio para replay
por SDK. Não use `--reverse`, pois o executor espera os eventos na ordem
original.

## Execução

Passe o arquivo e o `workflowId` original, quando disponível:

```bash
pnpm temporal:replay-post -- \
  tmp/temporal-replay/facebook-success-v102.json \
  post_EXEMPLO
```

Saída esperada:

```text
Replay compativel: postWorkflowV102 (facebook-success-v102.json)
```

Uma saída `Replay incompativel` bloqueia a migração. Registre apenas o tipo da
falha e os nomes do workflow/arquivo; não anexe o histórico.

## Matriz mínima antes dos contratos V112

- V101 e V102 concluídos com sucesso;
- V102 com falha do provider e refresh de token;
- Facebook e Instagram, incluindo publicação com comentários/carrossel quando
  houver histórico controlado;
- publicação recorrente;
- execução interrompida ou com timeout de activity.

Depois do replay, ainda são obrigatórios o teste de morte do worker após a
mutação externa e os smokes reais por provider descritos no ADR V112.
