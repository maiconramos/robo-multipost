# Auditoria e porte cirúrgico de termos/status do WordPress — setembro de 2026

> Branch: `codex/upstream-wordpress-terms`
>
> Base do fork: `8756b623` (`main`, após o fix de conexão WordPress)
>
> Upstream conferido: `ec162d2a` em 02/09/2026
>
> Estado: implementado com testes automatizados; smoke test real pendente

## Objetivo

Permitir escolher status, categorias e tags do WordPress por publicação sem
alterar posts antigos, sem regredir a proteção SSRF/DNS-pinning e sem levar ao
fork a suposição desatualizada do upstream sobre o contexto do Temporal.

## Alterações adotadas

| Origem | Decisão no fork |
|---|---|
| `d027d6f7` | O DTO aceita opcionalmente `categories`, `tags` e `status`. O provider lista até 100 termos de cada taxonomia e envia as seleções no payload da REST API. |
| `daffe5b4` | Adicionado o `MultiSelect` controlado e reutilizável à biblioteca React, mantendo os tokens visuais e os erros do `react-hook-form`. |
| Compatibilidade do fork | `categoriesList`, `tagsList` e `postTypes` usam `SocialAbstract.fetch`, que já chama `ssrfSafeFetch` e funciona fora de activities nesta base. O `fetch` nativo e o `@ts-ignore` do upstream não foram copiados. |
| Compatibilidade de dados | Os três campos são opcionais. O status padrão entra pelo `defaults` do `withProvider`, portanto preenche apenas posts novos ou settings sem o campo e não sobrescreve um valor salvo durante edição/duplicação. |
| Defesa adicional | IDs precisam ser inteiros positivos no DTO e são normalizados, filtrados e deduplicados novamente no provider. O domínio armazenado permanece intacto, mas todas as URLs de consulta, mídia e publicação são normalizadas no momento do uso. |
| Interface | Status, categorias, tags, tipo e mídia do WordPress usam traduções pt-BR/en. Falhas ao carregar termos não geram uma promise rejeitada sem tratamento; o seletor fica oculto, como já ocorre com tipos sem opções. |

## Contrato

As settings WordPress passam a aceitar:

```json
{
  "title": "Título",
  "type": "posts",
  "status": "draft",
  "categories": [2, 5],
  "tags": [8, 13]
}
```

- `status`: `publish`, `draft`, `pending` ou `private`;
- `categories` e `tags`: arrays opcionais de IDs inteiros positivos;
- ausência de `status` continua publicando imediatamente;
- arrays vazios são omitidos do payload enviado ao WordPress.

## Alterações deliberadamente não adotadas

- o helper `wpGet` do upstream usa `fetch` nativo com dispatcher e justificava
  a troca por um `Context.current()` que não existe mais no `SocialAbstract`
  deste fork; manter o helper compartilhado preserva também o mapeamento de
  erros HTTP;
- o novo pipeline Temporal e a validação global de mídia não são dependências
  desta feature;
- a REST API limita `per_page` a 100. Paginação completa de taxonomias pode ser
  avaliada depois se um workspace real ultrapassar esse volume.

## Cobertura e gate de produção

Os testes automatizados cobrem compatibilidade com settings legadas, quatro
status permitidos, rejeição de status inválido, arrays e IDs inválidos,
listagem segura das duas taxonomias, resposta inesperada, normalização do
domínio, filtragem/deduplicação de IDs e omissão de arrays vazios.

Antes de promover para produção ainda é necessário, em uma instalação
WordPress de pré-release:

1. abrir um post novo e confirmar `Publicar` como padrão;
2. selecionar múltiplas categorias e tags e reabrir o post para verificar a
   persistência;
3. publicar um rascunho e confirmar status/termos no wp-admin;
4. publicar sem termos e confirmar o comportamento legado;
5. repetir com o domínio do canal salvo com barra final.
