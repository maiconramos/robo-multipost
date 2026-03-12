# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Fork do [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0).

## [Unreleased]

### Adicionado
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

### Alterado
- Skill `/changelog` reescrito para consolidar rascunho incremental em vez de gerar do zero
- CI/CD detecta pre-releases e nao atualiza `:latest` para versoes RC/beta

### Documentacao
- Secao Multi-Tenancy adicionada ao README com link para guia completo
- Guia detalhado de multi-tenancy em `docs/multi-tenancy.md`

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
