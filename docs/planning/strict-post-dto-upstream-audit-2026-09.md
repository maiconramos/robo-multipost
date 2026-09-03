# Auditoria e porte cirúrgico de tipos estritos em posts — setembro de 2026

> Branch: `codex/upstream-strict-post-dtos`  
> Origem upstream: `c3de376f`, `cc54137d` e `40324535`  
> Estado: implementado com TDD e validação completa

## Problema confirmado

`PostsService.mapTypeToPost` usava `enableImplicitConversion: true`. No
class-transformer, uma string não vazia como `"false"` pode ser convertida para
o booleano `true`. Assim, um cliente fora do contrato podia ativar opções sem
querer. O mesmo risco existia ao executar posts antigos cujas configurações
foram salvas como texto: verificações JavaScript por truthiness tratavam
`"false"` como verdadeiro.

O RED reproduziu os efeitos concretos:

- `shortLink: "false"` era aceito e virava `true`;
- `is_trial_reel: "false"` adicionava `trial_params` no Instagram;
- `post_as_images_carousel: "false"` acionava o PDF no LinkedIn;
- flags TikTok chegavam invertidas ou como strings no payload;
- `made_with_ai: "false"` e `paid_partnership: "false"` eram enviados como
  ativos ao X.

## Decisão

- desabilitar conversão implícita no único boundary de criação/edição de posts;
- manter os DTOs como contrato e responder HTTP 400 para booleanos/números em
  formato textual;
- adicionar `SocialAbstract.assetBoolean` para a execução defensiva de dados
  legados já persistidos;
- aplicar o helper somente nos caminhos afetados existentes no fork:
  Instagram, LinkedIn, TikTok e X.

O commit `cc54137d`, apesar do título upstream mencionar WordPress, contém a
normalização necessária do payload TikTok e é dependência funcional do porte.
O commit posterior `40324535` move esse helper para `SocialAbstract`.

## Compatibilidade verificada

- o formulário web monta `shortLink` e settings de checkbox como booleanos;
- o CLI monta `shortLink: false` e repassa JSON tipado;
- os exemplos de `docs/api/public-api.md` já usam valores JSON reais;
- categorias/tags do WordPress já são arrays numéricos;
- integrações internas do backend constroem o mesmo contrato tipado.

Portanto, clientes conformes não mudam. Clientes externos que enviam
`"false"`, `"true"` ou números como texto passam a receber 400, que é uma
correção intencional do contrato, não uma coerção silenciosa.

## Divergências preservadas do fork

- o X omite `made_with_ai` e `paid_partnership` quando falsos, pois algumas
  contas rejeitam campos opcionais sem permissão; o porte apenas normaliza a
  decisão, sem copiar o payload upstream que sempre inclui false;
- Meta Graph v25, `metaGraphUrl`, tokens, self-heal e rotas do Instagram não
  foram alterados;
- SSRF/DNS-pinning, uploads e Temporal não foram tocados;
- o fork ainda não contém a camada upstream de `checkValidity` no servidor
  introduzida por `1b53973e`. Por isso não foram adicionados métodos mortos nem
  copiada a alteração de validação do Instagram standalone; ele já delega a
  publicação ao `InstagramProvider`, onde a flag foi protegida.

## Cobertura

Os testes direcionados cobrem:

- aceitação de booleano real e rejeição da string no boundary;
- tabela de conversão do helper compartilhado;
- ausência de `trial_params` para `"false"` no Instagram;
- não conversão para PDF no LinkedIn;
- payload TikTok com strings true/false normalizadas;
- preservação da omissão de flags falsas no X e ativação para `"true"`.

Não há alteração visual; validação em navegador não se aplica. O gate final é a
suíte completa das bibliotecas e os builds de backend, orchestrator e frontend.

Resultado local:

- direcionados: 6 suites / 56 testes;
- bibliotecas: 89 suites / 896 testes;
- backend: 14 suites / 127 testes;
- builds de backend, orchestrator e frontend concluídos.
