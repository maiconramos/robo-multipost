---
name: fork-status
description: Status rapido do fork Robo MultiPost. Mostra divergencia com upstream Postiz, commits pendentes, versao atual e prontidao para release. Use quando quiser saber o estado geral do fork.
---

# Fork Status — Robo MultiPost

Voce esta gerando um relatorio de status do fork. Execute os comandos abaixo e compile o resultado.

## Coleta de Dados

Execute todos estes comandos para coletar informacoes:

### 1. Estado do Git
```bash
git branch --show-current
git status --porcelain
```

### 2. Divergencia com Upstream
```bash
git fetch upstream --quiet 2>/dev/null
git fetch origin --quiet 2>/dev/null
git log --oneline postiz..upstream/main 2>/dev/null | wc -l
git log --oneline postiz..upstream/main 2>/dev/null | head -10
```
Se o fetch falhar, informar que o remote upstream nao esta configurado.

### 3. Commits Custom em main
```bash
git log --oneline postiz..main
```

### 4. Commits Pendentes para Release
```bash
git log --oneline release..main
```

### 5. Versao
```bash
node -e "console.log(require('./package.json').version)"
cat version.txt
git describe --tags --abbrev=0 2>/dev/null || echo "Nenhuma tag encontrada"
```

### 6. Saude do CI/CD
```bash
grep -c "maiconramos/robo-multipost" .github/workflows/build-containers.yml
grep -c "gitroomhq" .github/workflows/build-containers.yml
```

### 7. CHANGELOG
```bash
test -f CHANGELOG.md && echo "CHANGELOG.md existe" || echo "CHANGELOG.md NAO existe"
```

## Formato do Relatorio

Apresente os resultados neste formato:

```
=== Robo MultiPost — Fork Status ===

Branch atual:          <branch>
Working tree:          limpo / N arquivos modificados

Versao do fork:        X.Y.Z (package.json)
version.txt:           X.Y.Z
Ultima tag:            vX.Y.Z (ou nenhuma)

--- Upstream (Postiz) ---
Commits atras:         N commits
Ultimos commits upstream:
  - <hash> <mensagem>
  - ...

--- Customizacoes (main) ---
Total de commits custom:    N
Nao incluidos em release:   N
  - <hash> <mensagem>
  - ...

--- Saude ---
Registry CI/CD:        OK (maiconramos) / ERRO (gitroomhq)
CHANGELOG.md:          Existe / Nao existe

--- Prontidao para Release ---
<PRONTO / NAO PRONTO>
Motivos (se nao pronto):
  - ...
```

### Criterios de Prontidao
- Working tree limpo
- Commits em main nao incluidos em release existem (tem algo para lançar)
- Registry CI/CD correto
- CHANGELOG.md existe
