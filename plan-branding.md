Prompt para o Agente de Branding

  Você é um agente de desenvolvimento trabalhando no projeto Robô MultiPost, um fork do Postiz (AGPL-3.0).

  ## Missão
  Substituir a marca "Postiz" por "Robô MultiPost" nos textos visíveis ao usuário da interface.

  ## Regras obrigatórias
  1. NÃO renomear chaves de tradução (ex: a chave "webhooks_are_a_way_to_get_notified_when_something_happens_in_postiz_via_an_http_request" deve permanecer — só o valor visível muda)
  2. NÃO alterar referências internas de código como imports, nomes de pacotes npm (@postiz/node), variáveis de ambiente, nomes de containers Docker
  3. NÃO modificar URLs do GitHub (github.com/gitroomhq/postiz-app) — são créditos AGPL obrigatórios
  4. NÃO mexer no arquivo de schema Prisma
  5. NÃO modificar os caminhos de arquivos ou pastas
  6. Preservar conformidade AGPL: manter créditos ao Postiz original

  ## O que DEVE ser alterado

  ### 1. Textos visíveis nas traduções
  Arquivo: `libraries/react-shared-libraries/src/translation/locales/en/translation.json`
  Arquivo: `libraries/react-shared-libraries/src/translation/locales/pt/translation.json`

  Substituir "Postiz" por "Robô MultiPost" apenas nos VALORES (não nas chaves) onde aparece como nome do produto para o usuário. Exemplo:
  - "Use a API do Postiz para integrar..." → "Use a API do Robô MultiPost para integrar..."
  - Manter links para github.com/gitroomhq/postiz-app intactos

  ### 2. Componente de logo textual
  Arquivo: `apps/frontend/src/components/ui/logo-text.component.tsx`
  O SVG atual renderiza o texto "Postiz" em formato gráfico. Substituir o conteúdo do SVG por um componente de texto simples que exiba "Robô MultiPost" usando Tailwind CSS e a fonte atual do projeto. Manter o mesmo nome do componente
  LogoTextComponent.

  ### 3. Logo ícone
  Arquivo: `apps/frontend/src/components/new-layout/logo.tsx`
  O SVG atual é o ícone "P" do Postiz. Substituir por um emoji 🤖 dentro de um container SVG/div compatível com o tamanho atual (60x60), mantendo o nome do componente Logo e as classes CSS existentes.

  ### 4. Referências de domínio de analytics
  Arquivo: `apps/frontend/src/app/(app)/layout.tsx`
  Existem referências a `postiz.com` usadas para Plausible Analytics. Comentar ou remover essas referências de analytics (não são necessárias no self-hosted).

  ### 5. Meta tags e títulos de página
  Nos arquivos de layout e páginas do frontend que definem `metadata` (title, description, og:title, etc.) com o nome "Postiz", substituir por "Robô MultiPost".
  Buscar em: `apps/frontend/src/app/`

  ### 6. Textos hardcoded nas páginas
  Os seguintes arquivos contêm "Postiz" em textos visíveis:
  - `apps/frontend/src/app/(app)/auth/layout.tsx`
  - `apps/frontend/src/app/(app)/auth/page.tsx`
  - `apps/frontend/src/app/(app)/auth/login/page.tsx`
  - `apps/frontend/src/app/(app)/(site)/settings/page.tsx`
  Ler cada arquivo, identificar onde "Postiz" aparece como texto visível ao usuário e substituir por "Robô MultiPost".

  ### 7. Criar arquivo NOTICE
  Criar o arquivo `NOTICE` na raiz do projeto com o seguinte conteúdo:
  Robô MultiPost
  Copyright (c) 2025 Automação Sem Limites

  This product is based on Postiz (https://github.com/gitroomhq/postiz-app)
  Copyright (c) Postiz / GitRoom HQ
  Licensed under AGPL-3.0 (https://www.gnu.org/licenses/agpl-3.0.html)

  The original Postiz source code has been modified.
  All modifications are also licensed under AGPL-3.0.

  ## Validação após as alterações
  Após fazer as mudanças, rodar:
  ```bash
  pnpm lint
  E confirmar que não há erros de lint nos arquivos modificados.

  O que NÃO fazer

  - Não rodar pnpm dev ou pnpm build
  - Não alterar os outros 15 idiomas além de en e pt
  - Não criar novos componentes ou arquivos além do NOTICE
  - Não alterar lógica de negócio, só textos visíveis e identidade visual