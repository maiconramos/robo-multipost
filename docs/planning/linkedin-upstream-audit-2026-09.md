# Auditoria e porte cirúrgico do LinkedIn — setembro de 2026

> Branch: `codex/upstream-linkedin-provider`  
> Base do fork: `3ab7484c` (`main`, após as PRs de upload, Graph v25 e SSRF)  
> Estado: implementado com testes automatizados; smoke test real pendente

## Objetivo

Trazer os ajustes de LinkedIn classificados na triagem do Postiz sem substituir
o provider inteiro e sem perder as customizações do Robô MultiPost:

- credenciais OAuth por perfil via `ClientInformation`;
- downloads de mídia protegidos contra SSRF/DNS-pinning;
- tratamento próprio de erros e concorrência dos providers;
- confinamento do armazenamento local em `UPLOAD_DIRECTORY`.

## Alterações adotadas

| Origem upstream        | Decisão no fork                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `b0c8da12`             | Já coberto: concorrência do LinkedIn e LinkedIn Page permanece em `2`.                                                                                     |
| `5daee690`             | Imagens são limitadas a uma caixa de 6000 × 6000, mantendo proporção e sem ampliar arquivos menores.                                                       |
| `c8d8de8b`             | PNG/JPEG preservam o formato; PNG mantém transparência. Formatos não aceitos pelo LinkedIn são convertidos para JPEG e GIF continua sem passar pelo Sharp. |
| `84bee82b`             | Vídeos deixam de ser carregados inteiros em memória e passam a ser lidos/enviados em blocos de 2 MiB.                                                      |
| `db1f84ff`, `671946b5` | LinkedIn Page aceita Super Admin e Content Admin, somente em ACL aprovada, e ignora entradas incompletas.                                                  |
| `60ffa4df`             | Analytics de um post específico deixa de enviar `timeIntervals`, que a API não suporta nesse tipo de consulta, e tolera resposta sem `timeRange`.          |
| `c98ea046`             | O provider volta a expor `LinkedinDto` no contrato compartilhado.                                                                                          |
| Parte de `6784a283`    | Imagens e PDFs usam um único PUT; somente vídeo usa upload multipart. Isso é pré-requisito para o streaming e evita corromper arquivos maiores que 2 MiB.  |

O streaming exigia HTTP Range na rota de uploads locais, dependência que não
estava presente no fork. Foi criado um parser estrito de um único byte range e
a rota agora responde `206`, `Content-Range` e `Accept-Ranges`, ou `416` para
intervalos inválidos. A resolução continua passando por `resolveSafeUploadFile`;
portanto, o suporte a Range não reabre path traversal nem acesso por symlink.

Para mídia remota, `HEAD` e cada `GET` parcial passam por `ssrfSafeFetch`.
Resposta diferente de `206` ou quantidade de bytes divergente aborta o envio em
vez de anexar silenciosamente um vídeo corrompido.

## Alterações deliberadamente não adotadas

- Pipeline genérico de streaming (`9980825a`, `1b121d0c`, `4013c1af`) e fluxo
  pending/finalize: continuam no épico próprio, pois alcançam vários providers e
  o contrato Temporal.
- Polling `AVAILABLE` restante de `e18d4a59`/`6784a283`: exige mudança de tempo
  de execução e smoke test real. Não foi misturado a este porte de mídia.
- OAuth upstream baseado apenas em variáveis de ambiente: o fork preserva
  `ClientInformation` e o fallback por perfil já existente.

O commit `907e3399`, inicialmente adiado nesta auditoria, foi posteriormente
portado em uma PR isolada por meio de `analyticsFetch`. O LinkedIn Page deixa de
usar retries/`BadBody` de publicação em métricas, mas não adota `fetch` cru:
SSRF/DNS-pinning e o sinal de token inválido para renovação continuam ativos.
Ver [`provider-analytics-upstream-audit-2026-09.md`](./provider-analytics-upstream-audit-2026-09.md).

## Cobertura e gate de produção

Os testes cobrem preservação de PNG/transparência, limite de 6000 px,
conversão WebP → JPEG, PUT único de imagem acima de 2 MiB, vídeo remoto em dois
blocos, rejeição de origem que ignora Range, parsing de ranges, ACL de Content
Admin e analytics sem `timeRange`.

Antes de promover para produção ainda é obrigatório publicar em uma conta real:

1. imagem PNG transparente;
2. imagem maior que 2 MiB;
3. vídeo maior que 2 MiB em perfil pessoal;
4. vídeo maior que 2 MiB em Página;
5. conexão de Página usando usuário apenas Content Admin;
6. leitura de analytics de uma publicação da Página.
