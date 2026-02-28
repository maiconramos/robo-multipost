---
name: changelog
description: Gerar ou atualizar CHANGELOG.md analisando commits desde a ultima tag ou inicio do fork. Categoriza mudancas em Adicionado, Corrigido, Alterado e Upstream no formato Keep a Changelog.
argument-hint: "[desde-ref] — ref git opcional para inicio do range"
---

# Gerar Changelog — Robo MultiPost

Voce esta atualizando o CHANGELOG.md do projeto. Siga cada passo na ordem.

## Passo 1: Determinar Range de Commits

Se o usuario passou um argumento (`$ARGUMENTS`), use-o como ponto de partida.

Caso contrario, determine automaticamente:

```bash
# Tentar encontrar ultima tag do fork (nao upstream)
git tag -l "v0.*" --sort=-v:refname | head -1

# Se nao encontrar, usar merge-base entre postiz e main
git merge-base postiz main
```

O ponto final e sempre `HEAD` (main atual).

## Passo 2: Coletar Commits

```bash
# Commits normais (sem merges)
git log --oneline --no-merges <inicio>..HEAD

# Commits de merge (syncs upstream)
git log --oneline --merges <inicio>..HEAD
```

## Passo 3: Categorizar

Analise cada mensagem de commit e categorize:

| Prefixo | Categoria |
|---------|-----------|
| `feat:` | ### Adicionado |
| `fix:` | ### Corrigido |
| `docs:` | ### Documentacao |
| `chore:` | ### Alterado |
| `refactor:` | ### Alterado |
| `perf:` | ### Performance |
| Merge de postiz/upstream | ### Upstream |
| Outros | ### Alterado |

## Passo 4: Formatar

Use o formato Keep a Changelog:

```markdown
## [Unreleased]

### Adicionado
- Descricao da feature (hash curto)

### Corrigido
- Descricao do fix (hash curto)

### Alterado
- Descricao da mudanca (hash curto)

### Upstream
- Sincronizado com Postiz upstream ate commit XXXXX
```

## Passo 5: Apresentar e Aplicar

1. Mostre o changelog gerado ao usuario
2. Pergunte se deseja aprovar antes de escrever
3. Se CHANGELOG.md existir, insira o conteudo sob `## [Unreleased]` (substituindo o conteudo existente da secao Unreleased)
4. Se nao existir, crie o arquivo completo com o template:

```markdown
# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Fork do [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0).

<conteudo gerado>
```

## Regras

- Escrever em portugues (sem acentos nos arquivos para compatibilidade)
- Cada entrada deve ter o hash curto do commit entre parenteses
- Agrupar entradas relacionadas quando fizer sentido
- NAO incluir commits de merge do git (merge branch X into Y) como entradas separadas
