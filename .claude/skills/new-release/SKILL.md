---
name: new-release
description: Criar nova release do Robo MultiPost. Suporta 3 modos — estavel (major/minor/patch), pre-release RC, e promote (promover RC para estavel sem rebuild).
argument-hint: "major|minor|patch|rc|promote ou vX.Y.Z"
---

# Release — Robo MultiPost

Voce esta guiando o usuario pela criacao de uma nova release.
Esta e uma operacao de alto impacto que pode disparar build de imagem Docker.
Siga cada passo com cuidado e peca confirmacao antes de acoes irreversiveis.

## Detectar Modo

O usuario pode passar um argumento (`$ARGUMENTS`). Determine o modo:

| Argumento | Modo |
|-----------|------|
| `major`, `minor`, `patch` | **Estavel** — release completa via branch `release` |
| `vX.Y.Z` ou `X.Y.Z` (sem hifen) | **Estavel** — versao explicita |
| `rc` | **RC** — pre-release via tag em `main` |
| `vX.Y.Z-rc.N` ou `X.Y.Z-rc.N` | **RC** — versao RC explicita |
| `promote` | **Promote** — promover ultimo RC para estavel |
| Nada | Analisar commits e sugerir modo |

Se nenhum argumento foi passado, analise os commits recentes e pergunte:
- Tem mudancas significativas prontas para teste? → sugerir `rc`
- Ja tem RC testado? → sugerir `promote`
- Mudanca pequena e segura? → sugerir `patch`

---

## Modo: Estavel (major/minor/patch/vX.Y.Z)

### Precondicoes

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

### Passo 1: Determinar Versao

```bash
# Versao atual
node -e "console.log(require('./package.json').version)"

# Ultima tag do fork
git tag -l "v[0-9]*" --sort=-v:refname | grep -v '\-' | head -1
```

- `major` -> X+1.0.0
- `minor` -> X.Y+1.0
- `patch` -> X.Y.Z+1
- `vX.Y.Z` ou `X.Y.Z` -> usar como esta

Apresentar a versao proposta e pedir confirmacao.

### Passo 2: Atualizar CHANGELOG.md

Ler o CHANGELOG.md atual. Transformar a secao `## [Unreleased]`:

1. Renomear `## [Unreleased]` para `## [X.Y.Z] - YYYY-MM-DD` (data de hoje)
2. Adicionar nova secao `## [Unreleased]` vazia acima

Se a secao `[Unreleased]` estiver vazia, avisar o usuario e sugerir usar
`/changelog` primeiro para gerar as entradas.

Mostrar a mudanca proposta e pedir confirmacao.

### Passo 3: Bump de Versao

Atualizar os arquivos:

1. `package.json` — campo `"version": "X.Y.Z"`
2. `version.txt` — conteudo `X.Y.Z`

### Passo 4: Commit de Release

```bash
git add package.json version.txt CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
```

### Passo 5: Push main

Pedir confirmacao antes:

```bash
git push origin main
```

### Passo 6: Merge main em release

```bash
git checkout release
git merge main
```

Este merge deve ser limpo (release so recebe merges de main).
Se houver conflitos, algo esta errado — avisar e investigar.

### Passo 7: Criar Tag Anotada

Pedir ao usuario uma descricao breve da release, depois:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z — <descricao>"
```

### Passo 8: Push release + tag

Pedir confirmacao final — este e o ponto sem retorno que dispara o CI/CD:

```bash
git push origin release
git push origin vX.Y.Z
```

Explicar: isso dispara o workflow `build-containers.yml` que vai buildar
imagens Docker multi-arch (amd64 + arm64) e publicar em
`ghcr.io/maiconramos/robo-multipost:X.Y.Z` e `:latest`.

### Passo 9: GitHub Release (obrigatorio)

Criar o GitHub Release com as notas do CHANGELOG desta versao.
Escrever as notas em um arquivo temporario e usar `--notes-file`:

```bash
# Escrever notas em /tmp/release-notes.md com conteudo do CHANGELOG da versao
gh release create vX.Y.Z \
  -R maiconramos/robo-multipost \
  --title "vX.Y.Z: <descricao curta>" \
  --latest \
  --notes-file /tmp/release-notes.md
```

IMPORTANTE: Sempre usar `-R maiconramos/robo-multipost` (o `gh` pode apontar para o upstream).
Sempre usar `--notes-file` (o flag `--body` nao existe no `gh release create`).

### Passo 10: Voltar para main

```bash
git checkout main
```

### Resumo Final (Estavel)

```
=== Release vX.Y.Z Concluida ===

Versao:          X.Y.Z
Tag:             vX.Y.Z (anotada)
CHANGELOG.md:    Atualizado
package.json:    X.Y.Z
version.txt:     X.Y.Z
GitHub Release:  https://github.com/maiconramos/robo-multipost/releases/tag/vX.Y.Z

CI/CD:
  GitHub Actions: https://github.com/maiconramos/robo-multipost/actions
  Imagem Docker:  ghcr.io/maiconramos/robo-multipost:X.Y.Z + :latest

Para atualizar na VPS:
  docker pull ghcr.io/maiconramos/robo-multipost:X.Y.Z
  docker compose up -d postiz
```

---

## Modo: RC (pre-release)

### Precondicoes

```bash
# 1. Branch deve ser main
git branch --show-current

# 2. Working tree limpo
git status --porcelain
```

NAO precisa verificar sync com origin (RC e mais flexivel).

### Passo 1: Determinar Versao RC

```bash
# Versao atual
node -e "console.log(require('./package.json').version)"

# Ultima tag RC existente
git tag -l "v*-rc.*" --sort=-v:refname | head -5

# Ultima tag estavel
git tag -l "v[0-9]*" --sort=-v:refname | grep -v '\-' | head -1
```

**Se argumento foi `rc`:**
- Pegar versao atual do package.json
- Se ja e uma versao RC (ex: `0.3.0-rc.1`), incrementar N → `0.3.0-rc.2`
- Se e uma versao estavel (ex: `0.2.0`), calcular proxima minor e adicionar `-rc.1` → `0.3.0-rc.1`
- Perguntar ao usuario se quer minor ou patch antes de criar RC

**Se argumento e uma versao RC explicita (ex: `0.3.0-rc.1`):**
- Usar como esta

Apresentar a versao RC proposta e pedir confirmacao.

### Passo 2: Bump de Versao

Atualizar os arquivos:

1. `package.json` — campo `"version": "X.Y.Z-rc.N"`
2. `version.txt` — conteudo `X.Y.Z-rc.N`

**NAO atualizar CHANGELOG.md** — RC nao consolida changelog.

### Passo 3: Commit

```bash
git add package.json version.txt
git commit -m "chore: pre-release vX.Y.Z-rc.N"
```

### Passo 4: Push main

```bash
git push origin main
```

### Passo 5: Criar Tag RC

```bash
git tag -a vX.Y.Z-rc.N -m "Pre-release vX.Y.Z-rc.N"
```

### Passo 6: Push tag

Pedir confirmacao — isso dispara build Docker:

```bash
git push origin vX.Y.Z-rc.N
```

Explicar: isso dispara o workflow `build-containers.yml` que vai buildar
a imagem Docker mas **NAO atualizar :latest**. A imagem fica disponivel
apenas como `ghcr.io/maiconramos/robo-multipost:X.Y.Z-rc.N`.

### Passo 7: GitHub Release (obrigatorio)

Gerar notas da release a partir dos commits desde a ultima tag.
Listar os commits com `git log <ultima-tag>..HEAD --oneline` e agrupar por tipo:
- Novidades (feat)
- Correcoes (fix)
- Outros (chore, refactor, etc.)

Escrever as notas em um arquivo temporario e criar o release:

```bash
# Escrever notas em /tmp/release-notes.md
gh release create vX.Y.Z-rc.N \
  -R maiconramos/robo-multipost \
  --title "vX.Y.Z-rc.N: <descricao curta>" \
  --prerelease \
  --notes-file /tmp/release-notes.md
```

IMPORTANTE: Sempre usar `-R maiconramos/robo-multipost` (o `gh` pode apontar para o upstream).
Sempre usar `--notes-file` (o flag `--body` nao existe no `gh release create`).
Sempre usar `--prerelease` para marcar como pre-release.

Incluir no final das notas:

```markdown
---
> **Pre-release** — para teste. Nao atualiza `:latest`.
>
> ```bash
> docker pull ghcr.io/maiconramos/robo-multipost:X.Y.Z-rc.N
> ```
```

### Resumo Final (RC)

```
=== Pre-Release vX.Y.Z-rc.N ===

Versao:          X.Y.Z-rc.N
Tag:             vX.Y.Z-rc.N (anotada)
package.json:    X.Y.Z-rc.N
version.txt:     X.Y.Z-rc.N
GitHub Release:  https://github.com/maiconramos/robo-multipost/releases/tag/vX.Y.Z-rc.N (pre-release)

CI/CD:
  GitHub Actions: https://github.com/maiconramos/robo-multipost/actions
  Imagem Docker:  ghcr.io/maiconramos/robo-multipost:X.Y.Z-rc.N
  :latest:        NAO ATUALIZADO (pre-release)

Para testar esta RC:
  docker pull ghcr.io/maiconramos/robo-multipost:X.Y.Z-rc.N

Quando estiver satisfeito com o teste:
  /new-release promote
```

---

## Modo: Promote (RC -> Estavel)

### Precondicoes

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

### Passo 1: Encontrar Ultimo RC

```bash
git tag -l "v*-rc.*" --sort=-v:refname | head -5
```

Se nao encontrar nenhum RC, avisar que nao ha RC para promover.

Extrair a versao estavel do RC: `v0.3.0-rc.2` → `0.3.0`

Apresentar:
- RC encontrado: `v0.3.0-rc.2`
- Versao estavel proposta: `0.3.0`
- Perguntar se deseja prosseguir

### Passo 2: Bump para Versao Estavel

Atualizar os arquivos:

1. `package.json` — campo `"version": "X.Y.Z"`
2. `version.txt` — conteudo `X.Y.Z`

### Passo 3: Atualizar CHANGELOG.md

Mover `## [Unreleased]` para `## [X.Y.Z] - YYYY-MM-DD`.
Adicionar nova secao `## [Unreleased]` vazia acima.

Se `[Unreleased]` estiver vazio, sugerir rodar `/changelog` primeiro.

### Passo 4: Commit

```bash
git add package.json version.txt CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
```

### Passo 5: Push main

```bash
git push origin main
```

### Passo 6: Merge main em release

```bash
git checkout release
git merge main
```

### Passo 7: Criar Tag Estavel

Pedir descricao ao usuario:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z — <descricao>"
```

### Passo 8: Push release + tag

```bash
git push origin release
git push origin vX.Y.Z
```

### Passo 9: Disparar Promote no CI

Usar o workflow `promote-release.yml` para re-tagar a imagem RC como estavel + `:latest`
sem precisar rebuildar:

```bash
gh workflow run promote-release.yml \
  -f rc_version=X.Y.Z-rc.N \
  -f stable_version=X.Y.Z
```

Explicar: isso re-taga a imagem Docker existente do RC como `:X.Y.Z` e `:latest`,
sem rebuild. Muito mais rapido que um build completo.

O push da tag estavel no passo 8 tambem dispara `build-containers.yml`.
O workflow `promote-release.yml` e um atalho — se ele falhar, o build normal
via tag ainda cria a imagem estavel.

### Passo 10: GitHub Release (obrigatorio)

Criar o GitHub Release com as notas do CHANGELOG desta versao.
Escrever as notas em um arquivo temporario e usar `--notes-file`:

```bash
# Escrever notas em /tmp/release-notes.md com conteudo do CHANGELOG da versao
gh release create vX.Y.Z \
  -R maiconramos/robo-multipost \
  --title "vX.Y.Z: <descricao curta>" \
  --latest \
  --notes-file /tmp/release-notes.md
```

IMPORTANTE: Sempre usar `-R maiconramos/robo-multipost` (o `gh` pode apontar para o upstream).
Sempre usar `--notes-file` (o flag `--body` nao existe no `gh release create`).

### Passo 11: Voltar para main

```bash
git checkout main
```

### Resumo Final (Promote)

```
=== Release vX.Y.Z (promovida de RC) ===

RC original:     vX.Y.Z-rc.N
Versao estavel:  X.Y.Z
Tag:             vX.Y.Z (anotada)
CHANGELOG.md:    Atualizado
package.json:    X.Y.Z
version.txt:     X.Y.Z
GitHub Release:  https://github.com/maiconramos/robo-multipost/releases/tag/vX.Y.Z

CI/CD:
  Promote:        https://github.com/maiconramos/robo-multipost/actions (re-tag sem rebuild)
  Build backup:   Tambem disparado via tag vX.Y.Z
  Imagem Docker:  ghcr.io/maiconramos/robo-multipost:X.Y.Z + :latest

Para atualizar na VPS:
  docker pull ghcr.io/maiconramos/robo-multipost:X.Y.Z
  docker compose up -d postiz
```

---

## Regras Importantes

- NUNCA pular a verificacao de precondicoes
- NUNCA fazer force push
- Sempre pedir confirmacao antes de push e tag
- Se algo falhar no meio, orientar o usuario sobre como reverter
- A tag deve ser ANOTADA (git tag -a), nao lightweight
- A versao no package.json NAO tem prefixo v (ex: "0.3.0", nao "v0.3.0")
- A tag no git TEM prefixo v (ex: v0.3.0)
- A imagem Docker NAO tem prefixo v (ex: ghcr.io/maiconramos/robo-multipost:0.3.0)
  O workflow strip o "v" automaticamente: tag v0.3.0 -> imagem :0.3.0
- Pre-releases (RC) NAO passam pela branch `release` — sao tags em `main`
- Pre-releases NAO atualizam `:latest` no Docker
- Pre-releases NAO consolidam o CHANGELOG.md
