# Guia visual do MultiPost

Inventário de 24/10/2026. Acesso autenticado em `/settings/guia-visual`.

O projeto tem componentes compartilhados, variáveis de tema e convenções de UI, mas a investigação deste checkout não encontrou um catálogo visual existente ou Storybook configurado. A base atual ainda não constitui um design system uniforme: vários estilos e tamanhos são definidos nas telas consumidoras.

## Tema inicial

Novas instalações e navegadores sem preferência salva iniciam no tema claro, inclusive na tela de autenticação. O seletor de tema continua permitindo o modo escuro, e o cookie `mode` preserva a escolha existente. Cookies inválidos usam o padrão claro, sem aplicar classes arbitrárias.

Os layouts principal e da extensão resolvem a preferência no servidor e fornecem o mesmo valor ao contexto de tema do cliente, evitando um primeiro quadro escuro e divergências de hidratação. Calendário, gráficos, imagens de estado vazio, cobrança e seletor de emojis usam a mesma preferência inicial. O tema do sistema operacional não substitui a escolha salva.

## Como usar

- Abra o guia para comparar os exemplos reais nos temas claro e escuro. O seletor altera somente a prévia, sem salvar preferências nem modificar o tema da aplicação.
- Os botões são demonstrações locais: os cliques mostram uma confirmação no próprio guia e não aprovam, salvam ou excluem dados.
- Cada amostra informa se é componente compartilhado ou ajuste local. “Ver origem no código” identifica o arquivo de referência.
- “O que falta definir” separa lacunas observadas de propostas ainda não aplicadas. Este incremento não altera os componentes existentes nem o comportamento das integrações.
- O acesso é por URL, dentro das configurações e com a autenticação normal. Não foi acrescentado um item ao menu principal.

## Base e amostras encontradas

| Elemento | Situação atual | Origem |
| --- | --- | --- |
| Botão primário | Vermelho da marca `#CD2628`, altura de 40 px, 24 px de espaço lateral. Fonte e arredondamento herdados do contexto. | `libraries/react-shared-libraries/src/form/button.tsx` |
| Botão secundário | Propriedade `secondary`, fundo branco/escuro conforme o tema, sem contorno próprio. | Mesmo componente |
| Contorno, 36 px | Secundário com borda, raio de 8 px, texto de 14 px e espaço lateral de 12 px. | `apps/frontend/src/components/settings/facebook-automation-setup.component.tsx` |
| Verde e âmbar | Classes locais `green-600/700` e `amber-600/700`, usadas para aprovar e pedir alterações. Não são variantes da API do botão. | `apps/frontend/src/components/preview/comments.components.tsx` |
| Compacto, 24 px | Texto de 12 px, borda e raio de 4 px. | `apps/frontend/src/components/settings/profiles.component.tsx` |
| Login, 52 px | Altura local maior e raio de 10 px. | `apps/frontend/src/components/auth/login.tsx` |
| Confirmação destrutiva | `DecisionModal` usa o primário tanto na confirmação como no cancelamento. Não existe variante `danger` no botão de base. | `apps/frontend/src/components/layout/new-modal.tsx` |
| Cores | Variáveis modernas `--new-*` convivem com as antigas `--color-*`. O guia mostra uma seleção, não a paleta completa. | `apps/frontend/src/app/colors.scss` e `apps/frontend/tailwind.config.cjs` |
| Fonte principal | Plus Jakarta Sans no layout autenticado. | `apps/frontend/src/components/new-layout/layout.component.tsx` |

As alturas 24, 36, 40 e 52 px são amostras de uso, não um levantamento exaustivo de todas as medidas do frontend. Os exemplos copiam as classes específicas de cada origem e importam o `Button` real; estilos externos exclusivos da tela original podem produzir diferenças de contexto.

“Negativo” pode significar visual invertido/com contorno ou uma ação destrutiva. Convém usar nomes distintos: **secundário com contorno** para a aparência e **destrutivo** para a intenção de excluir. O vermelho da marca, sozinho, não diferencia essas intenções.

## Lacunas registradas para uma próxima etapa

- Não há API central de variantes semânticas nem tamanhos no `Button`.
- Algumas confirmações dão o mesmo destaque visual a confirmar e cancelar.
- O modo legado `loading` oculta o texto e reduz a opacidade. Desde 25/10, o opt-in `loadingLabel` mantém texto visível, spinner `currentColor`, `aria-busy` e `disabled` real; adotado nas ações Meta. O catálogo continua demonstrando o legado, sem ações reais.
- O spinner branco legado tem contraste insuficiente no secundário claro; o opt-in `loadingLabel` acompanha a cor do texto.
- Os exemplos de carregamento também reproduzem um aviso de desenvolvimento já presente em `ReactLoading`: mistura de `border` com `borderTopColor` durante a renderização. O catálogo registra esse comportamento sem modificar o componente compartilhado.
- `body *` remove o `outline` no CSS global; o botão base ainda não fornece um tratamento consistente de foco por teclado.

São candidatos para decisão, não correções incluídas neste catálogo: definir os papéis principal, secundário, discreto e destrutivo; avaliar uma escala curta de tamanhos; corrigir foco e carregamento na base; migrar uma tela por vez depois da aprovação visual. Verde não deve ser aplicado automaticamente a toda ação positiva.

## Manutenção e validação

- Página: `apps/frontend/src/app/(app)/(site)/settings/guia-visual/page.tsx`.
- Catálogo: `apps/frontend/src/components/style-guide/style-guide.component.tsx`.
- Textos: chaves `ui_guide_*` em `pt/translation.json` e `en/translation.json`.
- Ao acrescentar um exemplo, use o componente real ou as classes verificadas na origem, identifique o arquivo e diferencie claramente uma proposta de um padrão já existente.
- Testes de isolamento: `pnpm exec vitest run --config tools/vitest.style-guide.config.mts`.
- Regressão das telas Meta/automações: `pnpm exec vitest run --config tools/vitest.facebook-panel.config.mts`.
- Typecheck: `pnpm exec tsc --project apps/frontend/tsconfig.json --noEmit --incremental false`.

Os testes do guia verificam a alternância local de tema e que as demonstrações de aprovar/excluir produzem apenas feedback local, sem chamadas à API. A conferência visual complementa esses testes; não é uma auditoria completa de acessibilidade de todo o produto.

### Conferência de 24/10/2026

- 2 testes do catálogo e 43 testes de regressão das telas Meta/automações passaram; typecheck do frontend passou.
- 75 chaves novas conferidas com paridade pt/en. Revisão de código e documentação concluída; foco visível adicionado aos controles próprios do guia.
- Navegador autenticado no perfil Escorpiano: prévias clara/escura, navegação entre seções, exemplos de tamanhos/cores e feedback local de Aprovar conferidos. O tema do cabeçalho e da navegação da aplicação permaneceu intacto.
- Avisos de desenvolvimento do spinner reproduzidos e registrados acima; não houve envio de mensagens nem alteração de credenciais.
- Capturas em `output/style-guide-20261024/`.
- Docker local atualizado somente no serviço `app`, imagem `multipost-facebook-local:style-guide-20261024` (também `:source`), SHA `c72a63bef3997d3e5f8d83540861b2ce228793c6d0edc4945d5e4618812168f9`. Imagem anterior para reversão: `multipost-facebook-local:webhook-simple-20261024`. Banco, volumes e configuração das contas preservados.
