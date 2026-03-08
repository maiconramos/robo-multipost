---
name: changelog
description: Consolidar e limpar a secao [Unreleased] do CHANGELOG.md. Cruza o rascunho incremental com commits git para preencher gaps, deduplicar e padronizar entradas no formato Keep a Changelog.
argument-hint: "[desde-ref] — ref git opcional para inicio do range"
---

# Consolidar Changelog — Robo MultiPost

Voce esta consolidando o CHANGELOG.md do projeto. A secao `## [Unreleased]`
ja contem um rascunho incremental preenchido durante o desenvolvimento.
Seu trabalho e **revisar, completar e limpar** — nao gerar do zero.

## Passo 1: Ler Rascunho Existente

Leia o CHANGELOG.md e extraia todo o conteudo da secao `## [Unreleased]`.
Este e o rascunho incremental que foi preenchido ao longo do desenvolvimento.

Se `[Unreleased]` estiver vazio, avise o usuario e siga para o Passo 2 para
gerar entradas a partir dos commits (modo fallback).

## Passo 2: Coletar Commits

Determine o range de commits para cruzar com o rascunho.

Se o usuario passou um argumento (`$ARGUMENTS`), use-o como ponto de partida.

Caso contrario, determine automaticamente:

```bash
# Ultima tag do fork
git tag -l "v0.*" --sort=-v:refname | head -1

# Se nao encontrar, usar merge-base entre postiz e main
git merge-base postiz main
```

Colete os commits:

```bash
# Commits normais (sem merges)
git log --oneline --no-merges <inicio>..HEAD

# Commits de merge (syncs upstream)
git log --oneline --merges <inicio>..HEAD
```

## Passo 3: Cruzar Rascunho com Commits

Compare o rascunho com os commits encontrados:

### 3a. Entradas no rascunho sem commit correspondente
- **Manter** — podem ter sido escritas manualmente antes do commit
- Marcar com `(manual)` no relatorio para o usuario revisar

### 3b. Commits sem entrada no rascunho
- Categorizar usando prefixo do commit:

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

- Apresentar como **"Possivelmente faltando"** para o usuario decidir se inclui
- Ignorar commits triviais (typo, merge branch, ajuste de lint)

### 3c. Entradas duplicadas ou similares
- Sugerir merge em uma unica entrada
- Mostrar ambas para o usuario escolher

## Passo 4: Limpar e Formatar

Aplicar as seguintes regras ao resultado final:

1. **Linguagem:** Portugues sem acentos
2. **Estilo:** Descrever impacto para o usuario, nao detalhe tecnico
3. **Hash:** Adicionar hash curto do commit entre parenteses no final de cada entrada
   - Ex: `- Suporte a agendamento de Reels no Instagram (a1b2c3d)`
   - Entradas manuais sem commit ficam sem hash
4. **Categorias:** Remover categorias vazias
5. **Ordem das categorias:** Adicionado > Corrigido > Alterado > Removido > Performance > Documentacao > Upstream
6. **Dentro de cada categoria:** Ordenar por relevancia (features maiores primeiro)

## Passo 5: Apresentar para Aprovacao

Mostrar ao usuario:

1. **Resumo:**
   - N entradas do rascunho mantidas
   - N entradas novas adicionadas (de commits)
   - N duplicatas removidas/mergeadas
   - N commits ignorados (triviais)

2. **Diff:** Mostrar o conteudo ANTES (rascunho original) e DEPOIS (consolidado)

3. Perguntar se deseja aprovar, ajustar, ou cancelar

## Passo 6: Aplicar

Substituir o conteudo da secao `## [Unreleased]` no CHANGELOG.md com o resultado aprovado.

Manter intactas todas as secoes de versoes anteriores (ex: `## [0.2.0]`).

## Regras

- Escrever em portugues (sem acentos nos arquivos para compatibilidade)
- NAO incluir commits de merge do git (merge branch X into Y) como entradas separadas
- Agrupar entradas relacionadas quando fizer sentido
- Sempre pedir aprovacao antes de escrever no arquivo
- Se nao houver rascunho NEM commits novos, informar que nao ha nada para consolidar
