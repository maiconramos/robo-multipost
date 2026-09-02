# Auditoria e porte cirúrgico do Pinterest — setembro de 2026

> Branch: `codex/upstream-pinterest-provider`  
> Base do fork: `4936239d` (`main`, após o porte do LinkedIn)  
> Upstream conferido: `ec162d2a` em 02/09/2026  
> Estado: implementado com testes automatizados; smoke test real pendente

## Objetivo

Atualizar o provider nativo do Pinterest sem trazer junto o novo pipeline
Temporal e sem afetar o provider alternativo `zernio-pinterest`.

## Alterações adotadas

| Origem                             | Decisão no fork                                                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5015dbb1`                         | Analytics de conta e pin ficam dentro da janela suportada: no máximo 89 dias, com margem para a avaliação em UTC do Pinterest.                                                                                       |
| `be413ec2`, `205f1b80`             | O upload de vídeo usa o anexo MP4 encontrado, mesmo quando a capa aparece primeiro, e remove o status HTTP não utilizado.                                                                                            |
| `638b0712`                         | Status de processamento `failed` interrompe imediatamente com a causa de arquivo corrompido.                                                                                                                         |
| `935d4a46`, `a194b98f`             | O polling deixa de ser infinito e faz no máximo 18 consultas, mantendo a execução abaixo do timeout da atividade antiga.                                                                                             |
| `e3741fe4`, `e1a7b19b`, `62b32e6e` | Erros de board, ID inválido e URL inacessível passam a ter classificação e mensagem específicas.                                                                                                                     |
| Ajuste próprio do fork             | OAuth, troca de código e renovação agora usam `ClientInformation` do perfil ativo, com fallback para `PINTEREST_CLIENT_ID/SECRET`. Isso faz o card de credenciais Pinterest já existente funcionar de ponta a ponta. |

O porte também evita esperar mais 30 segundos quando o primeiro status já é
`succeeded`. A identificação do MP4 considera a extensão real do pathname e
continua funcionando em URLs assinadas com query string.

Downloads do vídeo e a URL intermediária de upload continuam usando o Axios
protegido do `SocialAbstract`; o hardening SSRF/DNS-pinning incorporado na PR
`#209` não foi removido.

## Já coberto antes desta PR

- limite e mensagem de no máximo cinco imagens;
- formato correto de `multiple_image_urls.items` (`{ url }`);
- concorrência do provider em três jobs;
- provider alternativo via Zernio.

## Alterações deliberadamente não adotadas

- `1b53973e`: move a validação de mídia de todos os providers para o servidor e
  altera 55 arquivos. A validação atual do Pinterest permanece no frontend até
  esse contrato global ser auditado em PR própria.
- `907e3399`: mantém `this.fetch` em analytics para preservar retry, refresh de
  token e tratamento compartilhado do fork.
- `e287a14d`: `postPending`/`checkPostStatus`/`finalizePost` pertence ao épico
  Temporal. O provider atual continua compatível com os workflows existentes.
- Helper global `hasExtension`: para não ampliar o blast radius, o provider usa
  um detector local compatível com URLs assinadas.

## Cobertura e gate de produção

Os testes automatizados cobrem os mapeamentos de erro, as três fases de OAuth
por perfil, seleção do MP4 com capa primeiro, payload final da capa, sucesso sem
espera extra, falha de processamento, limite do polling e as duas janelas de
analytics.

Antes de promover para produção ainda é obrigatório testar em conta real:

1. conectar usando credencial configurada apenas no perfil;
2. publicar vídeo com capa antes do MP4;
3. publicar vídeo com MP4 antes da capa;
4. consultar analytics de conta e de pin;
5. confirmar que um pin comum com uma e com múltiplas imagens não regrediu.
