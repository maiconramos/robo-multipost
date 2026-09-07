# Credencial congelada em workflows V102 agendados

Este runbook trata um modo de falha do `postWorkflowV102` que aparece quando um
canal é reconectado depois que os workflows dos posts agendados já começaram.
Ele não se aplica ao `postWorkflowV112`, que é imune por construção.

## O modo de falha

O `postWorkflowV102` busca o post **e a integração inteira** logo no início da
execução, pela activity `getPostsList`, e carrega esse retrato através do timer
até a hora de publicar. Como um post pode ser agendado com semanas ou meses de
antecedência, o workflow chega na publicação usando a credencial que existia no
dia do agendamento.

Enquanto o token daquele retrato continuar válido, nada acontece. O problema
surge quando o canal é reconectado no intervalo: o banco passa a ter um token
novo, mas o workflow em execução continua com o antigo. Na hora de publicar:

1. `postSocial` falha imediatamente — normalmente em poucas centenas de
   milissegundos, porque é rejeição de autenticação e não erro de rede;
2. em canais Meta, a falha vem como `OAuthException` com `code: 190` e
   `error_subcode: 190/460` ou `190/464`, classificada como `refresh_token` e
   marcada `nonRetryable`;
3. o workflow chama `refreshTokenWithCause`, que não consegue recuperar — o
   token do retrato pertence a uma sessão que não existe mais;
4. `changeState` grava `Post.error`, insere a linha em `Errors` e, pela cadeia
   de refresh, o canal recebe `refreshNeeded=true` e
   `refreshError='Refresh returned no access token'`.

O efeito colateral é o mais grave: **um canal saudável fica bloqueado**. Com
`refreshNeeded=true`, o `post.workflow.v1.0.2.ts` desvia antes de publicar e
apenas emite a notificação `notif_post_reconnect`. Os posts seguintes desse
canal deixam de sair — inclusive os que usariam a credencial nova, que funciona
— até que alguém reconecte outra vez. Uma única execução com retrato velho
derruba o canal inteiro.

O sintoma é contraintuitivo e vale reconhecê-lo: o canal publica com sucesso
quando testado na mão, e ainda assim um agendamento antigo falha por
autenticação minutos depois.

## Por que o V112 não sofre disso

O `postWorkflowV112` passa apenas `integrationId` no payload e recarrega a
credencial **dentro** da activity, no momento da publicação. O retrato deixa de
existir; o que vale é o estado do banco na hora do envio.

Isso não é só uma melhoria de segurança do payload: é a correção deste modo de
falha. Enquanto houver workflows V102 dormindo, a exposição continua
proporcional à quantidade deles.

## Diagnóstico

Antes de qualquer remediação, confirme que é este caso e não uma queda real de
credencial. Sinais que apontam para retrato velho:

- o workflow é `postWorkflowV102` e o `StartTime` é bem anterior à publicação;
- `Integration.updatedAt` é **posterior** ao início do workflow;
- o canal publica normalmente em execuções iniciadas depois da reconexão.

Compare os dois timestamps sem selecionar as colunas de token:

```sql
SELECT p.id,
       p."publishDate",
       p."updatedAt"  AS post_atualizado,
       i."updatedAt"  AS integracao_atualizada,
       i."refreshNeeded"
FROM "Post" p
JOIN "Integration" i ON i.id = p."integrationId"
WHERE p.id = '<post-id>';
```

E confirme a versão e a idade do workflow:

```bash
temporal workflow describe --address temporal:7233 --workflow-id post_<post-id> \
  | grep -E 'Type|StartTime|OriginalStartTime'
```

## Remediação: reset do workflow

`temporal workflow reset` re-executa as activities a partir do ponto de reset.
Resetando para o primeiro workflow task, o `getPostsList` roda de novo **agora**
e busca a integração atual; o timer é recriado a partir do `publishDate` e a
mutação passa a usar a credencial boa. O `workflowId` é preservado e o run
antigo é encerrado.

O reset **não** altera a versão do workflow: um V102 continua V102. Ele corrige
a credencial congelada. Migrar para V112 continua sendo reagendamento do post,
com o gate ativo para aquela integração.

Um post por vez:

```bash
temporal workflow reset --address temporal:7233 \
  --workflow-id post_<post-id> \
  --type FirstWorkflowTask \
  --reason "stale integration snapshot"
```

### Regra de segurança do lote

**Nunca aplique o reset por query de visibilidade do Temporal.** Uma consulta
como `WorkflowType="postWorkflowV102" AND ExecutionStatus="Running"` também
alcança workflows que **já publicaram** e ainda estão rodando as etapas finais
(notificação, webhooks, plugs). Resetar um desses re-executa `postSocial` e
**duplica a publicação**.

A lista precisa vir do banco do produto, restrita a posts que comprovadamente
ainda não publicaram:

- `state = 'QUEUE'` e `"deletedAt" IS NULL`;
- `"publishDate"` no futuro com folga — 30 minutos evita a corrida entre montar
  a lista e executar o lote.

O filtro `i."updatedAt" > p."updatedAt"` seleciona exatamente os retratos mais
velhos que a credencial atual. Ele superestima um pouco, porque `updatedAt`
também muda em refresh de token, mas resetar um workflow que não precisava é
inofensivo.

### Lote

Com acesso ao host, `docker exec` liga os dois containers num comando só. O
heredoc entre aspas simples evita qualquer expansão de shell dentro do SQL.

Confira o alcance antes:

```bash
docker exec -i <container-postgres> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A' <<'SQL'
SELECT count(*) FROM "Post" p JOIN "Integration" i ON i.id = p."integrationId"
WHERE p.state = 'QUEUE' AND p."deletedAt" IS NULL
  AND p."publishDate" > now() + interval '30 minutes'
  AND i."updatedAt" > p."updatedAt";
SQL
```

Depois execute:

```bash
IDS=$(docker exec -i <container-postgres> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A' <<'SQL'
SELECT p.id FROM "Post" p JOIN "Integration" i ON i.id = p."integrationId"
WHERE p.state = 'QUEUE' AND p."deletedAt" IS NULL
  AND p."publishDate" > now() + interval '30 minutes'
  AND i."updatedAt" > p."updatedAt";
SQL
)
N=0
for P in $IDS; do
  N=$((N+1))
  docker exec <container-temporal> temporal workflow reset --address temporal:7233 \
    --type FirstWorkflowTask --reason stale-snapshot --workflow-id "post_$P" \
    >/dev/null 2>&1 && echo "$N ok $P" || echo "$N FALHOU $P"
done
```

O endereço é o nome do serviço (`temporal:7233`). `127.0.0.1:7233` não funciona
nem de dentro do container do servidor.

## Verificação

Amostre workflows de canais diferentes e confirme que o retrato foi trocado:

```bash
temporal workflow describe --address temporal:7233 --workflow-id post_<post-id> \
  | grep -E 'StartTime|OriginalStartTime'
```

`StartTime` deve ser recente e `OriginalStartTime` deve preservar a data
original. Para provar que a credencial é a atual, decodifique os payloads e
compare com `Integration.updatedAt`:

```bash
temporal workflow show --address temporal:7233 --workflow-id post_<post-id> \
  --output json 2>/dev/null > /tmp/h.json
grep -o '"data": *"[A-Za-z0-9+/=]*"' /tmp/h.json \
  | sed 's/.*"data": *"//; s/"$//' \
  | while read b; do echo "$b" | base64 -d 2>/dev/null \
      | grep -o '"updatedAt":"[^"]*"'; done | sort -u
```

O `updatedAt` da integração no payload tem que bater com o do banco. Note que
`temporal workflow show` mantém os payloads em base64 — ao contrário do export
da UI, que já vem decodificado.

Acompanhe o progresso do lote pela contagem de execuções reiniciadas:

```bash
temporal workflow count --address temporal:7233 \
  --query 'ExecutionStatus="Running" AND StartTime > "<inicio-do-lote-ISO8601>"'
```

## O que o reset não resolve

- **Post em `QUEUE` sem workflow no Temporal.** O `describe` falha porque não há
  execução para resetar. Só reagendamento recria o workflow.
- **Canal com `refreshNeeded=true`.** O workflow resetado vai desviar para a
  notificação em vez de publicar. Limpe o estado do canal antes, reconectando —
  a flag pode ser falso positivo deixado por esta mesma falha.
- **Migração de versão.** Continua sendo reagendamento com o gate ativo.
