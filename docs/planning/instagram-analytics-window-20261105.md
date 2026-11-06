# Métricas do Instagram — janela de 7 e 30 dias

## Diagnóstico

Reproduzido no navegador da instância: 7 dias retorna cartões; 30 dias retorna a tela vazia. A consulta `GET /api/analytics/:integration?date=30` respondeu HTTP 200 com corpo `[]`; o erro remoto não é exposto nesse contrato. O log fornecido contém eventos de automação e repost, sem o erro de métricas.

O provider enviava `since = agora − dias` e `until = fim do dia atual`. Assim, uma seleção de 30 dias enviava mais de 30 dias, incluindo horas futuras. Além disso, uma resposta da Meta sem `data` podia quebrar em `data2.map`; o serviço capturava a falha e devolvia `[]` sem diagnóstico útil. A resposta específica da Meta nesta instância ainda não foi capturada, portanto a limitação remota permanece uma hipótese compatível com o sintoma.

## Correção

Os dois grupos de métricas usam um único instante Unix como fim, e o início é calculado subtraindo `dias × 86400`. Isso evita horas futuras e variação de duração por horário de verão. A interface continua oferecendo 7 e 30 dias para Instagram; não há redução silenciosa de outro período, soma entre fatias de alcance ou alteração no Facebook.

Respostas com erro HTTP, erro Graph, JSON inválido ou `data` fora do formato de lista são recusadas com erro interno controlado. O diagnóstico registra somente fase, período e códigos/status numéricos; nunca URL, token, mensagem da Meta ou corpo bruto. A exceção mantém a falha fora do cache de respostas bem-sucedidas. Respostas legitimamente vazias e valores reais zero são preservados.

O transporte continua sendo `analyticsFetch`, com proteção de rede e propagação de `RefreshToken` para a recuperação existente. Instagram Login delega ao mesmo cálculo usando seu host/token. Publicação, automações, permissões e dados persistidos não são alterados.

## Validação

130 testes em seis suítes e a verificação de tipos passaram. Testes de regressão simulam o limite remoto, verificam os dois grupos nos períodos de 7/30 dias e em ambos os hosts. Também cobrem falha de cada grupo, diagnóstico sem segredos, resposta inválida, vazio legítimo, zero real e propagação de token inválido. A correção local ainda precisa ser validada na instância após atualização; reproduzir a falha antiga no navegador não valida a nova versão.
