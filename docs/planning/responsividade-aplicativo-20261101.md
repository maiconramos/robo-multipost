# Responsividade do aplicativo e atualização local — 01/11/2026

Escopo autorizado: completar o porte responsivo do Postiz e atualizar `localmultipost.automacaosemlimites.com.br`, que ainda usava fontes anteriores à RC.5. Base do porte: main na RC.7 (`8be631d2`). Referências upstream: `9fedac40`, `e756fa57` e ajustes de notificações.

## Comportamento

- Até 1025 px, a navegação principal abre em painel com fechamento por botão, fundo, Escape e mudança de rota. Foco é contido e devolvido ao controle de origem; retorno ao desktop fecha o painel. Organização, perfil, idioma e tema continuam acessíveis por toque.
- Canais abrem em painel próprio; criar post permanece acessível conforme o papel do usuário. Filtros e seleção de canais/clientes cabem no celular. Calendário novo no celular começa no dia, respeitando escolhas explícitas na URL/cookie; semana/mês preservam rolagem interna e lista mantém filtros e paginação.
- Configurações usam abas horizontais e conteúdo sem largura mínima de desktop. Notificações ficam dentro do viewport e têm conteúdo rolável. Ajustes de largura/espaçamento do upstream são adaptados nas demais páginas aplicáveis.
- Preservar autorizações por perfil/organização, funções do fork, automações, calendário/fuso UTC/IANA, novo compositor, sanitização, recursos de IA e decisões de billing. Nenhuma nova API, credencial ou mudança de schema neste porte.

## Verificação

Testes de interação dos painéis (Escape, Tab, fundo, rota e retorno ao desktop), precedência de preferências do calendário e filtros. Build do frontend e inspeção em 390, 768 e 1440 px, tema claro/escuro, menu, calendário, configurações, notificações e compositor. Não publicar posts nem mudar contas para validar layout.

## Instalação local

Preservar arquivos locais e criar backup privado do banco antes de atualizar. O checkout local atual é ancestral da main; avançar sem descartar mudanças locais. Recriar somente o app com dependências Linux atualizadas, mantendo volumes, ambiente, túnel e serviços existentes. Aplicar explicitamente o sincronizador guardado da RC.7, pois o serviço local de schema apenas valida. Conferir contagens/conteúdo de tabelas de negócio antes/depois, saúde do backend/worker/frontend e fontes carregados. Nenhum deploy na VPS faz parte desta solicitação.

## Evidências do porte

25 testes Vitest aprovados, incluindo as regressões de fuso/compositor existentes e novos testes de painel, preferência de calendário, notificações e limpeza de cliente. Browser com componentes reais e API sintética em 390/768/1440 px: calendário, menu/canais/filtros, teclado, troca de tema, notificações, configurações e restrições do Visualizador. Sem erros de página nem rolagem horizontal do documento nesses cenários. Semana/mês mantêm rolagem no calendário. Nenhum post publicado nem configuração de conta alterada na validação.

Na composição local, os diretórios `dist` do backend e orchestrator são montados do host; portanto, atualizar somente a imagem não atualiza esses serviços. A instalação recompila ambos com as novas dependências, mantendo o cliente/dependências Linux dentro da imagem. O backup e a conferência de dados antecedem a troca do app.
