# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Fork do [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0).

## [Unreleased]

### Adicionado
- Rebranding: Postiz renomeado para "Robo MultiPost" em todo o frontend
- Traducoes pt-BR para componentes principais (canais, email, erros, midia)
- Documentacao de build e publicacao Docker (validardockerimage.md)
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
