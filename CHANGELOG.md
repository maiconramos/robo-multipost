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
- Skills Claude Code: /sync-upstream, /release, /changelog, /fork-status

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
