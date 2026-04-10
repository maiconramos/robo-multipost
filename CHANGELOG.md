# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Fork do [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0).

## [Unreleased]

### Upstream
- Sincronizado com Postiz upstream ate commit `e3b3b82f` (2026-04-10, 24 commits)
- Instagram: melhor tratamento de erros, fix de refresh token e recuperacao de sessao invalidada
- YouTube: preserva refresh token existente para evitar re-auth diario
- Reddit: correcao de postagem em subreddits via API
- Facebook/Instagram: melhorias no fluxo de refresh de integracao
- Backend: endpoint de download de faturas (`/download-invoices`)
- Backend: correcoes de seguranca (security fixes)
- Backend: nova versao de post workflow (`postWorkflowV102`)
- Deps: axios upgrade, gitignore limpo, ajustes no workflow de PR quality
- **NAO sincronizado** (major upgrade deixado para sync dedicado): langchain 0.3 -> 1.x, mastra 0.x -> 1.x, @mastra/mcp upgrade, @mastra/rag removido upstream. Mantidos em 0.x porque nossa feature Knowledge Base RAG depende de `@mastra/rag@2.1.3` e a migracao para mastra 1.x requer reescrita das tools de chat (copilot.controller, load.tools, generate.image.tool) — deixar para um sync focado separado

### Corrigido
- Traducao dos textos restantes no painel de configuracoes de publicacao (X e LinkedIn): placeholder de comunidade, toggles "Feito com IA" e "Parceria paga", finalizador de thread, plug "Adicionar repostadores", label e opcoes de atraso (Imediatamente, 1 hora, ...) e mensagem "Nenhuma conta disponivel"
- Verificacao de credenciais do X (Twitter) falhava com "Unable to verify your credentials" mesmo com chaves validas — endpoint e fluxo corrigidos usando `twitter-api-v2.appLogin()`
- Isolamento de credenciais OAuth do X por perfil — cada perfil do workspace agora usa suas proprias Consumer Keys em todo o fluxo OAuth 1.0a, incluindo publicacao, comentarios, analytics e plugs de repost, sem vazar credenciais entre perfis e sem depender de X_API_KEY/X_API_SECRET globais
- Logs de diagnostico adicionados ao teste de credenciais (backend e frontend) e ao wrapper `runInConcurrent` (para exibir erros reais de APIs de provider no worker do Temporal)
- Upload de midia no X: o upstream Postiz usa `client.v2.uploadMedia` (endpoint novo `/2/media/upload` da X API v2) que nao funciona no tier Free da X e resulta em falha silenciosa ("Unknown Error") no Temporal. Migrado para `client.v1.uploadMedia` (`/1.1/media/upload.json`) que e disponivel em todos os tiers. Adicionalmente, o upstream convertia toda imagem para GIF via sharp mas declarava o MIME type original no request — fix preserva o formato original (PNG/JPEG/WebP/GIF/MP4) com mimeType coerente
- Reconhecimento do erro `CreditsDepleted` (HTTP 402) do X em `handleErrors`: em vez de "Unknown Error" generico, agora exibe mensagem clara orientando o usuario a verificar o tier do app no developer.x.com quando a cota mensal de creditos para criacao de tweets se esgota
- Crash no preview do TikTok ao abrir o modal de canais sem midia anexada (`Cannot read properties of undefined (reading 'map')`)
- Correcoes na tela publica de compartilhamento de post (`/p/:id?share=true`): logo renderizava quebrado, textos e data permaneciam em ingles com idioma pt-BR, botao de login/cadastro ficava comprimido com texto longo e aparecia warning de key do React nas imagens
- Contraste dos textos no node Trigger — contagem de posts e palavras-chave agora usam cor legivel em ambos temas claro e escuro
- Acentuacao faltante nas traducoes em portugues do wizard de automacoes
- Multiplas DMs em sequencia no flow de automacao — apenas a primeira usava private reply (limitacao da Meta), as seguintes agora usam DM direta via IG-scoped user ID
- Configuracao de webhook Instagram movida da pagina de Automacoes para dentro da credencial Facebook em Configuracoes > Credenciais

### Adicionado
- Modo "Proxima Publicacao" em automacoes do Instagram: permite criar a automacao antes do post existir e vincula-a automaticamente ao proximo feed ou reel publicado, seja pelo Robo MultiPost ou direto no Instagram (stories excluidos)
- Tag Docker `:prerelease` que aponta sempre para a ultima RC publicada, permitindo atualizacao automatica sem especificar numero de versao
- Selecao de posts no wizard com grid de 4 thumbs + modal "Mostrar Todos" com scroll infinito
- Secao "E esse comentario possui" estilo ManyChat — radio cards, input com virgulas, chips de exemplo, toggle para interagir com comentarios
- Respostas de comentario multiplas com randomizacao — orchestrator escolhe aleatoriamente entre as variacoes configuradas
- Preview do celular dinamico — aba ativa muda automaticamente conforme o usuario edita (post ao selecionar, comentarios ao digitar palavra-chave, DM ao escrever mensagem)
- Edicao de automacoes simples via Wizard — botao "Editar no Assistente" na tela de resumo abre o wizard preenchido com os dados existentes (POST /flows/:id/quick-update)
- Avatar e nome da conta Instagram refletem no preview do celular ao selecionar a conta no wizard
- Wizard "Nova Automacao Rapida" — formulario guiado com preview em tempo real (celular mockup) para criar automacoes simples sem precisar do editor de nodes
- Endpoint POST /flows/quick-create que gera nodes/edges automaticamente a partir do wizard
- Endpoint GET /flows/integrations/:integrationId/posts para buscar posts Instagram sem precisar de um flow existente
- Palavras-chave (keywords) no node Trigger — elimina necessidade do node Condition para 99% dos casos de uso
- Toolbar de nodes melhorada com cards coloridos, descricao curta e clique para adicionar alem de arrastar
- Modo Summary vs Advanced no editor de flows — flows simples abrem em visualizacao resumo, complexos abrem no editor React Flow
- Historico de execucoes detalhado — timeline vertical com status de cada node visitado (log de execucao)
- Campo executionLog no schema FlowExecution para armazenar trace de nodes visitados em cada execucao
- Endpoint GET /flows/:id/executions/:executionId para detalhe de uma unica execucao
- Botao "Nova Automacao" (wizard) como acao primaria na lista de automacoes, "Comecar do zero" como secundario
- Knowledge Base por perfil via RAG com pgvector — usuarios enviam PDFs, TXT ou MD e o agente pode citar fatos desses documentos ao gerar posts
- Nova tool `knowledgeBaseQuery` no agente Mastra que consulta vetores por perfil antes de gerar conteudo com informacoes factuais
- API de gestao de documentos (GET/POST upload/DELETE em /settings/profiles/:id/knowledge)
- Schema ProfileKnowledgeDocument com status PROCESSING/READY/FAILED e cascade delete por perfil
- Inicializacao automatica da extensao pgvector no startup (CREATE EXTENSION IF NOT EXISTS vector)
- Feature flag ENABLE_KNOWLEDGE_BASE (default true) — permite desabilitar em setups sem pgvector
- Tela de Knowledge Base nas configuracoes com upload, listagem com polling de status e exclusao
- Traducoes pt/en para a tela de KB
- Persona de IA por perfil — agencias podem configurar tom de voz, publico-alvo, CTAs preferidos, restricoes de conteudo e estilo de imagem por cliente
- API de gestao de Persona por perfil (GET/PUT/DELETE /settings/profiles/:id/persona) restrita a ADMIN
- Tela "Persona de IA" nas configuracoes com presets de tom e estilo, CTAs como tags e ate 5 posts de exemplo
- Persona injetada automaticamente no agente Mastra (chat), no Generator LangGraph e nas geracoes de imagem DALL-E
- Traducoes pt/en completas para a tela de persona
- Documentacao de arquitetura para Persona (docs/architecture/profile-ai-persona.md) e Knowledge Base RAG (docs/architecture/knowledge-base-rag.md)
- Plano detalhado de implementacao para Persona de IA por perfil e Knowledge Base via RAG (docs/planning/profile-ai-persona-knowledge-base.md)
- Imagem Docker do PostgreSQL atualizada para pgvector/pgvector:pg17 (necessario para Knowledge Base)
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
- Modo ilimitado para creditos de IA via variavel AI_CREDITS_MODE (default: unlimited para self-hosted)
- Creditos de IA configuraveis por perfil no modo gerenciado (AI_CREDITS_MODE=managed)
- API de gestao de creditos de IA por perfil (GET/PUT /settings/profiles/:id/ai-credits, GET /settings/ai-credits/summary)
- Validacao de API key (OPENAI_API_KEY) antes de consumir credito de IA — retorna 503 se nao configurada
- Tela de gestao de creditos de IA no painel de configuracoes (visivel apenas para admins no modo managed)
- Indicador visual de creditos restantes nos componentes de geracao de imagem e video
- Botao de geracao desabilitado com tooltip quando creditos zerados
- Traducoes pt/en para todas as strings de creditos de IA

### Corrigido
- Automacao completava sem executar acoes (responder comentario, enviar DM) — edge auto-conectada de no de Condicao nao tinha sourceHandle, workflow nao encontrava caminho "match" e pulava todas as acoes
- Env var SKIP_IG_WEBHOOK_HMAC=true para pular validacao HMAC do webhook Instagram quando proxy reverso re-serializa o body
- Validacao pre-criacao de automacao: botao Criar fica desabilitado ate o webhook Instagram estar configurado na Meta para a conta selecionada, com mensagem de ajuda inline no modal
- Verificacao de webhook usa endpoint app-level /{app_id}/subscriptions da Meta Graph API (com app_id|app_secret) — unica forma confiavel de ler o estado do webhook Instagram no modelo de Casos de uso. Tentativa anterior via /subscribed_apps falhava porque token de Business Login nao tem capability para esse endpoint
- Webhook Instagram descartava todos os eventos silenciosamente por filtrar value.item === "comment" (campo so existe em Facebook Page feed, nao em Instagram)
- Validacao HMAC do webhook comparava assinatura com JSON re-serializado (JSON.stringify) em vez do raw body — toda requisicao era rejeitada com 403 quando FACEBOOK_APP_SECRET estava configurado
- Logs detalhados adicionados no webhook handler para facilitar debug de eventos recebidos
- Acao "Responder comentario" postava novo comentario top-level no post em vez de resposta threaded — agora usa POST /{comment_id}/replies conforme docs da Meta
- Acao "Enviar DM" usava /me/messages com recipient.id (so funciona dentro da janela de 24h de mensagem ativa) — trocado para private_replies API (POST /{ig_id}/messages com recipient.comment_id) que eh a unica forma oficial de DM um comentador (janela de 7 dias)
- Toaster cortava mensagens longas (altura fixa 56px) — agora cresce verticalmente com quebra de linha automatica e tempo de exibicao proporcional ao tamanho
- Mensagem de webhook nao configurado mostrava "Detalhe:" vazio quando Meta retornava success=false sem erro
- No de Atraso tinha texto branco sobre fundo branco e borda invisivel no tema claro — agora usa tema laranja consistente com identidade visual
- Inscricao de webhook Instagram usava subscribed_fields=feed (Facebook Page) em vez de comments,messages na conta IG — causava zero eventos chegando mesmo com automacao ativa
- Arestas (conexoes) do flow builder nao podiam ser removidas — agora clique na aresta pede confirmacao para remover; tecla Backspace/Delete tambem remove
- Botao Historico no editor de automacao para visualizar execucoes sem sair da tela
- UX de remocao de arestas estilo n8n — lixeira aparece no hover sobre a conexao
- No de Condicao mostra "Verdadeiro"/"Falso" em vez de "Match"/"Sem match" (mais claro)
- Ao arrastar novo no para o canvas, ele conecta automaticamente ao ultimo no (fluxo linear)

### Alterado
- Renomeacao na interface de automacoes: "Wizard/Assistente" passa a se chamar "Automacao Rapida" (PT) e "Quick Automation" (EN); modo "Avancado/Comecar do zero" passa a se chamar "Flow Builder" (mesmo termo em pt e en) — alinhado com a nomenclatura ManyChat que os usuarios brasileiros ja reconhecem

### Removido
- Botao "Configurar webhook Instagram na Meta" em Credenciais — no modelo de Casos de Uso da Meta (2024) o webhook tem que ser configurado manualmente dentro de cada caso de uso, nao ha endpoint API publico que preencha esses campos

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
