# Auditoria e porte cirúrgico de republicação explícita — setembro de 2026

> Branch: `codex/upstream-explicit-republish`
> Origem upstream: `b6310364`
> Estado: implementado com TDD e validação técnica completa; visual pendente

## Problema confirmado

O formulário já perguntava se o usuário queria apenas atualizar ou republicar,
mas essa decisão não fazia parte do contrato. Tanto `POST /posts` quanto a API
pública podiam receber um post já `PUBLISHED` com `type: schedule`/`now` e
recolocá-lo na fila. O endpoint de mudança de data tinha ainda `schedule` como
padrão quando o cliente não enviava `action`.

Na prática, uma chamada direta, um cliente antigo ou um agente MCP podia zerar
`releaseId`/`releaseURL`, voltar o estado para `QUEUE` e iniciar o workflow sem
passar pela confirmação visual.

O RED reproduziu que:

- um post publicado era salvo como `schedule` sem opt-in;
- a alteração de data sem `action` assumia `schedule` e iniciava o Temporal;
- o reagendamento publicado escrevia no banco antes de qualquer confirmação;
- valores textuais poderiam ser confundidos com opt-in por truthiness.

## Decisão adaptada ao fork

- adicionar `republish?: boolean` ao `CreatePostDto` estrito;
- rejeitar `schedule`/`now` sobre post publicado, antes da escrita, salvo quando
  `republish === true`;
- usar `update` como padrão seguro em `PUT /posts/:id/date`;
- anexar `republish` ao fim da assinatura de `PostsService.changeDate`, depois
  do `profileId`, preservando todas as chamadas posicionais próprias do fork;
- exigir o booleano real `true` também no serviço, pois os parâmetros
  individuais do controller não passam pela conversão do `CreatePostDto`;
- validar organização e `profileId` de todos os IDs existentes antes do
  `upsert`, inclusive quando `republish: true`, fechando o bypass que o patch
  upstream deixaria aberto no repositório próprio do fork;
- fazer a UI enviar o opt-in apenas depois da confirmação e exibir canal, data
  e o efeito sobre recorrências;
- manter o modal aberto e mostrar o erro quando o backend recusar a operação,
  em vez de apresentar sucesso ou mover o card localmente.

Posts `DRAFT`/`QUEUE` e `type: update` continuam com o comportamento anterior.

## Compatibilidade preservada

- o `profileId` continua sendo o quinto argumento de `changeDate`; o novo flag
  é o sexto, evitando interpretar um ID de perfil como confirmação;
- a validação de pertencimento ao perfil continua antes de qualquer escrita;
- o workflow só é iniciado quando a ação efetiva é `schedule` e o gate passou;
- Meta Graph v25, tokens, self-heal, providers, SSRF/DNS-pinning, storage e
  payloads de publicação não foram alterados;
- não há migração de banco e posts já publicados permanecem intactos.

## Contrato para API e MCP

Para editar um post publicado sem nova publicação, use `type: "update"` (ou
`action: "update"` na mudança de data). Para publicar novamente de propósito,
envie `republish: true`. Strings como `"true"` e `"false"` não confirmam a ação.

O template de instruções do agente e a referência da API pública foram
atualizados para que automações não tentem contornar o gate.

## Cobertura

Os testes direcionados cobrem o bloqueio antes da escrita, opt-in verdadeiro,
rejeição de string, default `update`, preservação e isolamento do `profileId`,
ID inexistente, validação integral de lotes, início do workflow somente após
confirmação, edição sem republicação e ausência de regressão em posts na fila.

Como há mudança visual no modal, além das suítes e builds, a promoção exige
validar no navegador os caminhos cancelar, apenas atualizar, republicar e erro
HTTP apresentado sem fechar o compositor.

Resultado local:

- direcionados: 3 suites / 18 testes;
- bibliotecas: 90 suites / 910 testes;
- backend: 15 suites / 129 testes;
- builds de frontend, backend e orchestrator concluídos.

### Browser Validation

Não executada neste checkout: não havia frontend local ativo. Subir o backend
local usando a configuração disponível poderia conectar no banco configurado e
executar reconciliações de startup/Temporal, portanto esse risco não foi aceito
apenas para abrir o modal. O smoke visual permanece como gate de promoção da
pré-release, em ambiente isolado ou após o deploy de teste.
