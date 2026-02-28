---
name: sync-upstream
description: Sincronizar o fork Robo MultiPost com o repositorio upstream Postiz. Guia passo a passo com fetch, merge na branch postiz, merge em main, resolucao de conflitos e verificacao de build.
argument-hint: "[--dry-run] — simular sem executar merges"
---

# Sync Upstream — Postiz -> Robo MultiPost

Voce esta guiando o usuario pela sincronizacao com o upstream Postiz.
Este e um processo delicado que requer atencao a conflitos. Siga cada passo.

## Verificacao de Precondicoes

Antes de tudo, verifique TODAS as condicoes:

```bash
# 1. Branch atual
git branch --show-current

# 2. Working tree limpo
git status --porcelain

# 3. Remote upstream existe
git remote get-url upstream 2>/dev/null

# 4. Branches postiz e main existem
git branch --list postiz main
```

**Se qualquer precondicao falhar:**
- Branch != main -> `git checkout main`
- Working tree sujo -> avisar e pedir para commitar ou stash
- Upstream nao existe -> `git remote add upstream https://github.com/gitroomhq/postiz-app`
- Branch postiz nao existe -> avisar (problema grave)

## Passo 1: Fetch Upstream

```bash
git fetch upstream
git fetch origin
```

Depois mostre ao usuario:

```bash
# Quantos commits novos no upstream
git log --oneline postiz..upstream/main | wc -l

# Listar os commits (ultimos 20)
git log --oneline postiz..upstream/main | head -20

# Procurar breaking changes
git log --oneline postiz..upstream/main | grep -iE "BREAKING|!"
```

Apresente um resumo:
- N commits novos no upstream
- Quaisquer breaking changes encontradas
- Perguntar se deseja prosseguir

**Se `--dry-run` foi passado como argumento:** pare aqui e mostre apenas o resumo.

## Passo 2: Atualizar Branch postiz

```bash
git checkout postiz
git merge upstream/main
```

**Se merge limpo:**
- Reportar sucesso
- Mostrar `git diff --stat HEAD~1` (arquivos alterados)

**Se merge com conflitos:**
- Isso NAO deveria acontecer (postiz e espelho limpo)
- Se acontecer, algo esta errado — alguem commitou na branch postiz
- Listar conflitos e recomendar `git merge --abort`
- Investigar o que foi commitado indevidamente

Apos merge bem-sucedido:
```bash
git push origin postiz
```

## Passo 3: Merge postiz em main

```bash
git checkout main
git merge postiz
```

**Se merge limpo:**
- Reportar sucesso
- Listar arquivos alterados com `git diff --stat HEAD~1`

**Se merge com conflitos:**
- Listar TODOS os arquivos conflitantes:
  ```bash
  git diff --name-only --diff-filter=U
  ```

- Agrupar por area e dar orientacao especifica:

  | Area | Arquivos | Orientacao |
  |------|----------|-----------|
  | Frontend | `apps/frontend/` | Manter nossas customizacoes de UI/branding, aceitar novas features |
  | Traducoes | `libraries/react-shared-libraries/src/translation/` | Manter nossas traducoes pt-BR, adicionar chaves novas do upstream |
  | Backend | `apps/backend/`, `libraries/nestjs-libraries/` | Geralmente aceitar upstream, verificar se nao quebra integracao |
  | Config | `package.json`, `tsconfig*` | Aceitar deps do upstream, manter metadados do fork (nome, versao) |
  | CI/CD | `.github/workflows/` | Manter nosso registry (maiconramos), aceitar melhorias de workflow |
  | Docs | `README.md`, `docs/` | Manter nosso README, aceitar docs novos |
  | Branding | Logos, imagens | Sempre manter os nossos |

- Para cada conflito, mostrar o conteudo conflitante e sugerir resolucao
- Pedir confirmacao antes de cada resolucao

Apos resolver todos os conflitos:
```bash
git add .
git commit -m "chore: sync upstream postiz ($(git log -1 --format=%h upstream/main))"
```

## Passo 4: Verificacao de Build

Perguntar ao usuario se deseja rodar o build (demora):

```bash
pnpm install
pnpm build
```

**Se build OK:** reportar sucesso
**Se build falhar:** analisar erro e orientar correcao

## Passo 5: Gerar Entrada no Changelog

Ler os commits upstream que foram mergidos. Criar uma entrada sugerida para
a secao `### Upstream` do CHANGELOG.md:

```markdown
### Upstream
- Sincronizado com Postiz upstream ate commit <hash> (<data>)
- Principais mudancas: <resumo das features/fixes mais relevantes>
```

Apresentar a entrada e perguntar se deseja adicionar ao CHANGELOG.md.

## Passo 6: Resumo Final

```
=== Sync Upstream Concluido ===

Commits mergidos:       N
Conflitos resolvidos:   N (ou nenhum)
Build:                  OK / Nao executado / Falhou
Changelog:              Atualizado / Nao atualizado

Proximos passos:
- Testar a aplicacao localmente (pnpm dev)
- Quando estiver satisfeito, considere usar /release para publicar
- NAO faca push de main ainda se quiser testar mais
```

## Regras Importantes

- NUNCA executar `git push --force` em nenhuma branch
- NUNCA commitar diretamente na branch `postiz`
- Sempre pedir confirmacao antes de resolver conflitos
- Se algo parecer errado, parar e perguntar ao usuario
- O build e opcional mas fortemente recomendado
