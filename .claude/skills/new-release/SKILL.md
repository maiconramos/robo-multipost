---
name: new-release
description: Criar nova release do Robo MultiPost. Valida main, calcula versao, atualiza changelog, faz bump, merge em release, cria tag anotada e faz push para disparar build Docker via CI/CD.
argument-hint: "major|minor|patch ou vX.Y.Z"
---

# Release — Robo MultiPost

Voce esta guiando o usuario pela criacao de uma nova release.
Esta e uma operacao de alto impacto que dispara build de imagem Docker.
Siga cada passo com cuidado e peca confirmacao antes de acoes irreversiveis.

## Argumento

O usuario pode passar:
- `major`, `minor` ou `patch` — calcula a proxima versao automaticamente
- `vX.Y.Z` ou `X.Y.Z` — versao explicita
- Nada — analisa commits e sugere

## Verificacao de Precondicoes

Verifique TODAS antes de prosseguir:

```bash
# 1. Branch deve ser main
git branch --show-current

# 2. Working tree limpo
git status --porcelain

# 3. main sincronizado com origin
git fetch origin --quiet
git rev-parse main
git rev-parse origin/main
```

**Se qualquer precondicao falhar:**
- Branch != main -> avisar e pedir para mudar
- Working tree sujo -> avisar e pedir para commitar ou stash
- main diverge de origin/main -> avisar e pedir para push ou pull

## Passo 1: Determinar Versao

```bash
# Versao atual
node -e "console.log(require('./package.json').version)"

# Ultima tag do fork
git tag -l "v0.*" --sort=-v:refname | head -1
```

**Se argumento foi passado:**
- `major` -> X+1.0.0
- `minor` -> X.Y+1.0
- `patch` -> X.Y.Z+1
- `vX.Y.Z` ou `X.Y.Z` -> usar como esta (sem o prefixo v no package.json)

**Se nenhum argumento:**
Analisar commits desde a ultima tag (ou inicio do fork):

```bash
git log --oneline <ultima-tag>..HEAD
```

- Algum commit com "BREAKING" ou "!" -> sugerir `major`
- Algum commit com "feat:" -> sugerir `minor`
- So commits "fix:" -> sugerir `patch`
- Sync upstream -> sugerir `minor`

Apresentar a versao proposta e pedir confirmacao.

## Passo 2: Atualizar CHANGELOG.md

Ler o CHANGELOG.md atual. Transformar a secao `## [Unreleased]`:

1. Renomear `## [Unreleased]` para `## [X.Y.Z] - YYYY-MM-DD` (data de hoje)
2. Adicionar nova secao `## [Unreleased]` vazia acima

Exemplo:
```markdown
## [Unreleased]

## [0.1.0] - 2026-02-28

### Adicionado
- ...
```

Se a secao `[Unreleased]` estiver vazia, avisar o usuario e sugerir usar
`/changelog` primeiro para gerar as entradas.

Mostrar a mudanca proposta e pedir confirmacao.

## Passo 3: Bump de Versao

Atualizar os arquivos:

1. `package.json` — campo `"version": "X.Y.Z"`
2. `version.txt` — conteudo `X.Y.Z`

## Passo 4: Commit de Release

```bash
git add package.json version.txt CHANGELOG.md
git commit -m "chore: release v<X.Y.Z>"
```

## Passo 5: Push main

Pedir confirmacao antes:

```bash
git push origin main
```

## Passo 6: Merge main em release

```bash
git checkout release
git merge main
```

Este merge deve ser limpo (release so recebe merges de main).
Se houver conflitos, algo esta errado — avisar e investigar.

## Passo 7: Criar Tag Anotada

Pedir ao usuario uma descricao breve da release, depois:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z — <descricao>"
```

## Passo 8: Push release + tag

Pedir confirmacao final — este e o ponto sem retorno que dispara o CI/CD:

```bash
git push origin release
git push origin vX.Y.Z
```

Explicar: isso dispara o workflow `build-containers.yml` que vai buildar
imagens Docker multi-arch (amd64 + arm64) e publicar em
`ghcr.io/maiconramos/robo-multipost:vX.Y.Z` e `:latest`.

## Passo 9: GitHub Release (opcional)

Perguntar se o usuario quer criar um GitHub Release:

```bash
gh release create vX.Y.Z \
  --title "Robo MultiPost vX.Y.Z" \
  --notes "<conteudo do changelog desta versao>"
```

## Passo 10: Voltar para main

```bash
git checkout main
```

## Passo 11: Resumo Final

```
=== Release vX.Y.Z Concluida ===

Versao:          vX.Y.Z
Tag:             vX.Y.Z (anotada)
CHANGELOG.md:    Atualizado
package.json:    X.Y.Z
version.txt:     X.Y.Z

CI/CD:
  GitHub Actions: https://github.com/maiconramos/robo-multipost/actions
  Imagem Docker:  ghcr.io/maiconramos/robo-multipost:X.Y.Z (sem prefixo v)

Para atualizar na VPS:
  docker pull ghcr.io/maiconramos/robo-multipost:X.Y.Z
  docker compose up -d postiz
```

## Regras Importantes

- NUNCA pular a verificacao de precondicoes
- NUNCA fazer force push
- Sempre pedir confirmacao antes de push e tag
- Se algo falhar no meio, orientar o usuario sobre como reverter
- A tag deve ser ANOTADA (git tag -a), nao lightweight
- A versao no package.json NAO tem prefixo v (ex: "0.1.0", nao "v0.1.0")
- A tag no git TEM prefixo v (ex: v0.1.0)
- A imagem Docker NAO tem prefixo v (ex: ghcr.io/maiconramos/robo-multipost:0.1.0)
  O workflow strip o "v" automaticamente: tag v0.1.0 -> imagem :0.1.0
