# Auditoria e porte cirúrgico da conexão WordPress — setembro de 2026

> Branch: `codex/upstream-wordpress-connect`
>
> Base do fork: `b00d93c3` (`main`, após o porte do Google Meu Negócio`)
>
> Upstream conferido: `ec162d2a` em 02/09/2026
>
> Estado: implementado com testes automatizados; smoke test real pendente

## Objetivo

Substituir o erro genérico de credenciais do WordPress por diagnósticos
acionáveis, normalizar o domínio informado e orientar o uso de Senha de
Aplicativo sem enfraquecer a proteção SSRF/DNS-pinning do Robô MultiPost.

## Alterações adotadas

| Origem | Decisão no fork |
|---|---|
| `3c7a6863` | A URL perde espaços e barras finais antes da consulta a `/wp-json/wp/v2/users/me`. Falha de rede, rejeição `401/403`, outros HTTP não bem-sucedidos e resposta `200` não JSON agora têm mensagens distintas. |
| Compatibilidade do fork | A chamada continua obrigatoriamente em `ssrfSafeFetch`. O `fetch` nativo do upstream não foi copiado, pois reabriria a janela de DNS-pinning já fechada no fork. |
| Observabilidade segura | O log estruturado contém somente origem, status HTTP e `code` do WordPress. Usuário, senha, cabeçalho Basic e corpo HTML retornado por proxy ou plugin não são registrados. |
| Interface | O campo de senha ganhou ajuda traduzida em pt-BR/en orientando a criar uma Senha de Aplicativo em Usuário > Perfil, em vez de usar a senha do wp-admin. |

## Compatibilidade preservada

- o token armazenado continua sendo o payload Base64 original;
- o `internalId` mantém o domínio original, evitando duplicar canais antigos
  que foram cadastrados com barra final;
- publicação, upload de mídia, tipos de post e workflows Temporal não mudam;
- todas as chamadas posteriores continuam passando pelo tratamento e pela
  proteção SSRF de `SocialAbstract`.

## Alterações deliberadamente separadas

- `d027d6f7` (categorias, tags e status) será uma PR própria, pois altera DTO,
  formulário e payload de publicação;
- `daffe5b4` (componente `MultiSelect`) só será avaliado junto dessa feature;
- `cc54137d`, citado na triagem inicial, não altera WordPress e foi removido da
  cadeia de dependências do provider;
- a validação global de mídia `1b53973e` e o pipeline Temporal novo não fazem
  parte desta correção.

> A segunda etapa foi implementada depois, com auditoria própria em
> [`wordpress-terms-upstream-audit-2026-09.md`](./wordpress-terms-upstream-audit-2026-09.md).

## Cobertura e gate de produção

Os testes automatizados cobrem normalização sem bypass de SSRF, contrato de
sucesso, escolha do maior avatar, site inalcançável, `401`, `403`, outro status
HTTP, resposta não JSON, ausência de segredos no log e a dica de Senha de
Aplicativo.

Antes de promover para produção ainda é necessário conectar um WordPress real
em ambiente de pré-release com:

1. domínio com barra final;
2. Senha de Aplicativo válida;
3. senha inválida para confirmar a mensagem `401/403`;
4. publicação simples após a conexão.
