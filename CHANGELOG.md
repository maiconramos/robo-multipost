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
- Suporte a pre-release (RC) no workflow de release — permite lancar versoes de teste sem afetar `:latest`
- Workflow `promote-release.yml` para promover RC para estavel sem rebuild da imagem Docker
- Opcoes `rc` e `promote` no skill `/new-release`
- Changelog incremental — Claude Code preenche `[Unreleased]` conforme trabalha

### Alterado
- Skill `/changelog` reescrito para consolidar rascunho incremental em vez de gerar do zero
- CI/CD detecta pre-releases e nao atualiza `:latest` para versoes RC/beta

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
