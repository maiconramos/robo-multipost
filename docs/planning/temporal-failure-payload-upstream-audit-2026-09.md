# Auditoria upstream — payload de falhas do Temporal

> Base do fork: `8ea14a58` (`main`)
> Upstream: `cc79e129`

## Problema

`RefreshToken` e `BadBody` herdam de `ApplicationFailure`. O Temporal serializa
mensagem e detalhes dessas falhas no histórico do workflow e os transporta por
gRPC. Uma resposta extensa do provider — página HTML, stack, debug ou mídia
ecoada — pode inflar o histórico e superar o limite do frame, escondendo a
causa original atrás de `GRPC Message too large`.

## Adaptação aplicada

O ponto único em `social.abstract.ts` agora limita:

- a mensagem da falha a 2.000 caracteres;
- o JSON de resposta a 4.000 caracteres;
- o corpo da requisição a 4.000 caracteres.

O texto cortado recebe um sufixo com a quantidade removida. Valores não string
usam o serializador circular-safe já existente; `null` e `undefined` viram
string vazia.

O porte foi mantido antes dos construtores compartilhados, portanto cobre todos
os providers sem editar cada integração. Mensagens e campos abaixo dos limites
não mudam. O identificador do provider também permanece intacto.

## Compatibilidade com as customizações Meta

Os erros observados no fork usam `code` e `error_subcode` no início do JSON.
Os testes fixam os casos `190/460` e `190/464`, garantindo que esses valores
continuem disponíveis para classificação, reconexão e self-heal por Token de
Usuário do Sistema.

A mudança limita o detalhe já existente, mas não é uma rotina de redação. Os
logs, Status e histórico devem continuar usando somente nome e mensagem
sanitizados, nunca o objeto bruto da `ApplicationFailure`, pois o início do
corpo ainda pode conter credenciais.

## Fora deste porte

- versões e código dos workflows V101/V102;
- filas `main` e de providers;
- retries, timeouts e concorrência;
- criptografia, renovação ou persistência de tokens;
- workers activity-only e divisão entre servidores.

Esses limites não exigem migração de banco, reinício de workflows existentes ou
reconexão de canais. Entram no próximo rebuild do backend/orchestrator.

## Testes

O ciclo RED falhou pela ausência de `truncateForTemporal`. Depois do porte, a
suíte dirigida cobre:

- mensagem curta preservada;
- corte e contador de caracteres;
- `BadBody` grande com `190/464` preservado;
- `RefreshToken` grande com `190/460` preservado;
- objeto circular serializado sem quebrar a criação da falha.
