# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Fork do [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0).

## [Unreleased]

### Adicionado
- Automacoes de comentarios Instagram (estilo ManyChat) — flow builder visual com React Flow para responder comentarios automaticamente
- 5 tipos de no no editor de automacoes: Gatilho (comentario), Condicao (palavra-chave), Responder Comentario, Enviar DM e Atraso
- Nova secao "Automacoes" no menu lateral com listagem e editor visual de flows
- Webhook de entrada para receber eventos de comentarios do Instagram via Meta Graph API
- Execucao de flows via Temporal workflows com suporte a delay duravel e retries automaticos
- Metodo sendDM() no Instagram provider para enviar mensagens diretas via Instagram Messaging API
- Metodo subscribeToWebhooks() no Instagram provider para inscrever paginas em webhooks da Meta
- Inscricao automatica de webhooks ao ativar uma automacao — nao precisa configurar webhook manualmente no Meta Developer Portal
- Seletor de conta Instagram conectada ao criar automacao (substitui input manual de Integration ID)
- Webhook Verify Token configuravel por perfil em Configuracoes > Credenciais (multi-tenancy: cada perfil pode ter seu proprio App Meta)
- HMAC do webhook Instagram valida com App Secret da credencial do perfil (fallback para variavel de ambiente global)
- Documentacao passo-a-passo de Automacoes Instagram em docs/automacoes-instagram.md (referenciada no README)
- Verify Token padrao "multipost" aceito automaticamente no webhook Instagram (zero config — nao precisa cadastrar verify token nas credenciais)
- Bloco copy-paste na tela de Automacoes com Callback URL e Verify Token prontos para colar no Meta Developer Portal
- Botao "Configurar webhook Instagram na Meta" no card Facebook de Credenciais — configura callback URL e verify token automaticamente via API da Meta (1 clique, elimina passo manual no Meta Developer Portal)
- Historico de execucoes por automacao com status em tempo real
- Traducoes pt/en para todas as strings de automacoes
- Seletor de posts do Instagram no no Gatilho — lista recentes (feed/reels/stories) com thumbnail para escolher quais posts disparam a automacao (estilo ManyChat)

### Corrigido
- Validacao pre-criacao de automacao: botao Criar fica desabilitado ate o webhook Instagram estar configurado na Meta para a conta selecionada, com mensagem de ajuda inline no modal
- Verificacao de webhook trocada de POST (tenta inscrever) para GET (apenas le estado) — nao falsifica erro quando webhook ja foi configurado manualmente na Meta via Casos de uso
- Toaster cortava mensagens longas (altura fixa 56px) — agora cresce verticalmente com quebra de linha automatica e tempo de exibicao proporcional ao tamanho
- Mensagem de webhook nao configurado mostrava "Detalhe:" vazio quando Meta retornava success=false sem erro
- No de Atraso tinha texto branco sobre fundo branco e borda invisivel no tema claro — agora usa tema laranja consistente com identidade visual
- Inscricao de webhook Instagram usava subscribed_fields=feed (Facebook Page) em vez de comments,messages na conta IG — causava zero eventos chegando mesmo com automacao ativa
- Arestas (conexoes) do flow builder nao podiam ser removidas — agora clique na aresta pede confirmacao para remover; tecla Backspace/Delete tambem remove
- Botao Historico no editor de automacao para visualizar execucoes sem sair da tela
- UX de remocao de arestas estilo n8n — lixeira aparece no hover sobre a conexao
- No de Condicao mostra "Verdadeiro"/"Falso" em vez de "Match"/"Sem match" (mais claro)
- Ao arrastar novo no para o canvas, ele conecta automaticamente ao ultimo no (fluxo linear)

### Removido
- Botao "Configurar webhook Instagram na Meta" em Credenciais — no modelo de Casos de Uso da Meta (2024) o webhook tem que ser configurado manualmente dentro de cada caso de uso, nao ha endpoint API publico que preencha esses campos
- Modo ilimitado para creditos de IA via variavel AI_CREDITS_MODE (default: unlimited para self-hosted)
- Creditos de IA configuraveis por perfil no modo gerenciado (AI_CREDITS_MODE=managed)
- API de gestao de creditos de IA por perfil (GET/PUT /settings/profiles/:id/ai-credits, GET /settings/ai-credits/summary)
- Validacao de API key (OPENAI_API_KEY) antes de consumir credito de IA — retorna 503 se nao configurada
- Tela de gestao de creditos de IA no painel de configuracoes (visivel apenas para admins no modo managed)
- Indicador visual de creditos restantes nos componentes de geracao de imagem e video
- Botao de geracao desabilitado com tooltip quando creditos zerados
- Traducoes pt/en para todas as strings de creditos de IA

## [0.3.0] - 2026-04-03

### Corrigido
- Login/registro com Google via Generic OAuth falhava com redirect_uri_mismatch — middleware detectava provider incorreto devido a "googleapis.com" nos parametros de scope
- Contagem de integracoes por perfil incluia canais deletados

### Adicionado
- Link de convite Late — botao "Enviar link de convite" abre modal com selecao de perfil e plataforma, gerando link OAuth direto via Late platform-invites
- Credenciais OAuth independentes por perfil — cada perfil pode ter suas proprias credenciais de redes sociais
- Webhooks, Auto Post e Sets isolados por perfil ativo
- Late API key configuravel por perfil — cada perfil pode conectar sua propria conta Late
- Preferencia de Shortlink independente por perfil
- Script de migracao SQL para mover dados existentes de credenciais, webhooks, autopost, sets, late e shortlink para o perfil default
- Migracao automatica no startup do backend — usuarios Docker nao precisam rodar SQL manualmente ao atualizar
- Multi-tenancy com perfis: suporte a 3 niveis (Workspace > Perfil > Recursos) para agencias gerenciarem multiplos clientes
- Modelo Profile e ProfileMember no banco de dados com roles (OWNER, MANAGER, EDITOR, VIEWER)
- API REST para CRUD de perfis e gerenciamento de membros (`/profiles`)
- Troca de perfil ativo via cookie/header (`POST /user/change-profile`)
- Filtragem de integracoes, posts, midia, tags e assinaturas por perfil ativo
- Script de migracao SQL para criar perfis default e migrar dados existentes
- Seletor de perfil no top bar para trocar entre perfis da organizacao
- Tab "Perfis" nas configuracoes para criar, editar, excluir perfis e gerenciar membros (ADMIN+)
- Cookie `showprofile` enviado como header nas requests para manter perfil ativo no frontend
- Documentacao do fluxo de client login para fase futura
- Provider Late unificado — botao unico "Late" no modal de adicionar canal abre selecao de contas ja conectadas no Late
- Suporte a 13 plataformas via Late: Twitter, Instagram, TikTok, YouTube, Facebook, LinkedIn, Pinterest, Reddit, Bluesky, Threads, Google Business, Telegram, Snapchat
- Modal de selecao Late com 2 etapas: escolher perfil Late e depois selecionar conta (agrupada por plataforma)
- Opcao de conectar nova conta via OAuth do Late diretamente no modal
- Badge visual Late (asterisco oficial) nos icones de canais conectados via Late para diferenciar de conexoes nativas
- Icone de plataforma como foto de perfil para canais Late (Late SDK nao fornece fotos de perfil)
- Suporte a pre-release (RC) no workflow de release — permite lancar versoes de teste sem afetar `:latest`
- Workflow `promote-release.yml` para promover RC para estavel sem rebuild da imagem Docker
- Opcoes `rc` e `promote` no skill `/new-release`
- Changelog incremental — Claude Code preenche `[Unreleased]` conforme trabalha

### Corrigido
- Isolamento completo de dados por perfil — posts, tags, analytics, agents e canais agora respeitam o perfil ativo em todas as operacoes de escrita e leitura
- Posts criados em um perfil nao aparecem mais em outros perfis
- Find-slot calcula horarios livres considerando apenas posts do perfil ativo
- Analytics valida que a integracao/post pertence ao perfil antes de retornar dados
- Agent (copilot) lista apenas canais do perfil ativo e nao consegue postar em canais de outro perfil
- Threads do agent isoladas por perfil — cada perfil tem suas proprias conversas
- Upload de midia pelo agent agora salva com profileId correto
- Enable/disable/delete de canal valida que a integracao pertence ao perfil ativo
- Integracoes sem perfil (org-level) agora aparecem em todos os perfis corretamente
- Edit/delete de tags agora respeita o perfil ativo
- Autopost busca apenas integracoes do perfil correto ao disparar
- Conexao OAuth agora salva profileId atomicamente na integracao (sem race condition)
- Late connect salva profileId diretamente no createOrUpdateIntegration (eliminada race condition)
- Webhooks preservam profileId ao ser atualizados
- API publica aceita profileId como query param para filtrar integracoes
- Quota de canais conta apenas canais do perfil ativo ao habilitar canal
- Migracao automatica no startup associa posts e midias orfaos ao perfil default
- Conexao de canais Late (TikTok/Pinterest) falhava com erro de sessao expirada ao adicionar canal
- Upload de midia nao aparecia na listagem quando perfil ativo estava selecionado (profileId nao era salvo no registro de midia)
- Midia sem perfil associado (upload anterior ao recurso de perfis) agora aparece para todos os perfis
- Icones de plataforma Late quebravam em 15+ componentes por usar identificador `late-xxx` como path de icone (centralizado via `PlatformIconBadge`)
- Componente `PlatformIconBadge` reutilizavel com badge Late (asterisco SVG oficial) substitui codigo duplicado em 8+ componentes
- Canais Late agora mostram icone da plataforma como foto de perfil (Late SDK nao fornece fotos)
- Layout do frontend falhava ao renderizar `PlausibleProvider` como Fragment (corrigido com renderizacao condicional)
- Rota de uploads retornava erro 500 para arquivos inexistentes (agora retorna 404 com verificacao de existencia)
- Rota de uploads falhava quando `UPLOAD_DIRECTORY` nao estava configurado (agora retorna erro 500 descritivo)
- Adicionada traducao `select_or_upload_pictures_max_1gb` em pt e en
- Agendamento de posts via canais Late falhava silenciosamente — providers `late-*` nao estavam registrados no discriminator de validacao do DTO
- Perfis sem Late configurado conseguiam acessar contas Late de outros perfis — fallback para API key da organizacao removido quando perfil ativo esta selecionado
- Toggle "Compartilhar Late com Perfis" nas Configuracoes Globais — permite controlar se perfis sem chave Late propria usam a chave do workspace padrao
- Mesma conta Late pode ser conectada em perfis diferentes sem conflito (internalId composto com profileId)
- Conexao de canais Late falhava com erro ao tentar fazer upload de icone local como URL (`/icons/platforms/tiktok.png`)
- Posts via Late agora verificam o status real da publicacao na plataforma — se o Late aceita mas a rede social rejeita (ex: token expirado), o erro eh detectado e reportado em vez de marcar como sucesso
- Posts via Late ficavam presos na fila porque a task queue `late` nao tinha worker — Late providers agora usam a task queue `main`

### Alterado
- Skill `/changelog` reescrito para consolidar rascunho incremental em vez de gerar do zero
- CI/CD detecta pre-releases e nao atualiza `:latest` para versoes RC/beta

### Upstream
- Sincronizado com Postiz upstream ate commit f55cca51 (2026-04-03)
- Security: validacao de URLs em webhooks (IsSafeWebhookUrl), protecao contra acesso interno via upload URL
- Upgrade Next.js para versao 16.2.1 com Turbopack
- Novo provider ReelFarm para geracao de video
- Import de posts existentes
- Pinterest: exibicao de mais boards
- MCP com suporte a OAuth
- Sentry metrics e health check para Temporal
- Language switch no frontend com suporte a direcao RTL
- Sistema de announcements (banners de aviso)
- Componente SafeImage substituindo next/image direto
- Sincronizado com Postiz upstream ate commit e20565fb (2026-03-13)
- Novo provider MeWe para publicacao em grupos
- Sistema OAuth Apps — apps de terceiros podem autenticar via Postiz OAuth
- Refactor de auth providers (factory → manager pattern)
- MCP com suporte a OAuth2
- Fixes de Stripe (skip subscription check sem Stripe, require API key)
- Facebook/Instagram connect melhorado, Google My Business com paginacao
- Telegram fix, X API update
- AppSumo webhook handling melhorado
- PR Quality workflow no CI

### Documentacao
- Secao Multi-Tenancy adicionada ao README com link para guia completo
- Guia detalhado de multi-tenancy em `docs/multi-tenancy.md`
- Documentacao reorganizada em estrutura `docs/` (architecture, development, operations, planning)

## [0.2.0] - 2026-02-28

### Adicionado
- Rebranding: Postiz renomeado para "Robo MultiPost" em todo o frontend
- Traducoes pt-BR para componentes principais (canais, email, erros, midia)
- Documentacao de build e publicacao Docker (guia-docker-release.md)
- CLAUDE.md e AGENTS.md com instrucoes para agentes IA
- Source maps para estilos CSS globais
- Skills Claude Code: /sync-upstream, /new-release, /changelog, /fork-status

### Corrigido
- Interpolacao i18next no fluxo de conexao de canais
- Logo no README usando asset local em vez de fonte externa
- Registry CI/CD: corrigido de ghcr.io/gitroomhq para ghcr.io/maiconramos

### Alterado
- README reescrito para comunidade brasileira (Automacao Sem Limites)
- Traducoes de notificacoes por email atualizadas
- Versao do fork definida como 0.1.0 (independente do upstream)

### Upstream
- Baseado no Postiz upstream em commit ccd66571 (era ~v2.16.0)
- Sincronizado com Postiz upstream ate commit `6c39e810` (2026-02-28)
  - feat: URL separada para MCP server (`mcpUrl`)
  - feat: Redis throttler para rate limiting
  - feat: Suporte a TLS e API key no Temporal
  - feat: Melhor tratamento de erros no TikTok
  - feat: Funcionalidade de logout
  - feat: Compressao HTTP e melhores indices no banco
  - feat: Cobrancas apenas para sucesso + reembolso e cancelamento
  - fix: Colaboradores em carrossel do Instagram
