# Development Workflow

Este repositorio segue **GitLab Flow** otimizado para um fork de projeto open-source upstream.
O objetivo e manter separacao clara entre codigo upstream, customizacoes e releases de producao.

## Modelo de Branches

| Branch    | Papel                                   | Regra                                  |
|-----------|-----------------------------------------|----------------------------------------|
| `postiz`  | Espelho limpo do upstream Postiz        | Nunca commitar customizacoes aqui      |
| `main`    | Desenvolvimento + todas customizacoes   | Todo codigo custom vai aqui            |
| `release` | Versao estavel para producao            | So recebe merge de `main` quando testado |

## Remotes

| Remote     | URL                                              |
|------------|--------------------------------------------------|
| `origin`   | `https://github.com/maiconramos/robo-multipost`  |
| `upstream` | `https://github.com/gitroomhq/postiz-app`        |

## Fluxo Diario

1. Trabalhar na branch `main` (ou criar `custom/nome-da-feature` para features grandes)
2. Commits usando conventional commits (ex: `feat(backend): adicionar endpoint de analytics`)
3. Push para origin
4. Para releases: merge `main` em `release`, tag, push

## Sincronizacao com Upstream (Postiz)

```bash
git checkout postiz
git fetch upstream
git merge upstream/main

git checkout main
git merge postiz
# resolver conflitos, testar e commitar
```

Use o skill `/sync-upstream` no Claude Code para execucao guiada deste fluxo.

## Fluxo de Release

```bash
git checkout release
git merge main
git tag -a vX.Y.Z -m "Release vX.Y.Z — descricao"
git push origin release
git push origin vX.Y.Z
```

O push da tag dispara GitHub Actions que builda e publica a imagem Docker em
`ghcr.io/maiconramos/robo-multipost`.

Use o skill `/release` no Claude Code para execucao guiada deste fluxo.

## Versionamento SemVer

| Tipo de mudanca            | Incrementa | Exemplo             |
|---------------------------|------------|---------------------|
| Update do upstream Postiz | MINOR      | v0.1.0 -> v0.2.0   |
| Nova feature customizada  | MINOR      | v0.2.0 -> v0.3.0   |
| Correcao de bug           | PATCH      | v0.2.0 -> v0.2.1   |
| Breaking change           | MAJOR      | v0.2.0 -> v1.0.0   |

## Comandos

```bash
pnpm dev                  # Todos os apps em paralelo
pnpm build                # Build completo
pnpm lint                 # Linting (sempre da raiz)
pnpm prisma-generate      # Gerar Prisma client
pnpm prisma-db-push       # Aplicar migracoes
```

## Skills Claude Code Disponiveis

| Comando           | Descricao                                        |
|-------------------|--------------------------------------------------|
| `/fork-status`    | Status rapido do fork (divergencia, versao, etc) |
| `/sync-upstream`  | Sincronizar com Postiz upstream                  |
| `/new-release`    | Criar nova release (versao, tag, Docker)         |
| `/changelog`      | Gerar/atualizar CHANGELOG.md                     |

## Documentacao Relacionada

- [CLAUDE.md](../../CLAUDE.md) — instrucoes detalhadas do projeto
- [../../docs/planning/agents.md](../../../docs/planning/agents.md) — contexto para agentes IA
- [CHANGELOG.md](../../CHANGELOG.md) — historico de mudancas
