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
- Quando estiver satisfeito, considere usar /new-release para publicar
- NAO faca push de main ainda se quiser testar mais
```

## Customizacoes Divergentes do Upstream (nao sobrescrever!)

Esta secao lista correcoes e customizacoes aplicadas no fork que NAO existem
no upstream Postiz. Ao resolver conflitos ou ao aceitar mudancas do upstream
em qualquer um dos arquivos abaixo, **leia esta secao antes**, e confirme com
o usuario que nao estamos regredindo uma correcao ja feita.

Formato: **arquivo** — descricao + data em que verificamos que o upstream
continuava bugado. Se o upstream eventualmente corrigir, remova o item desta
lista durante o proprio sync e registre no CHANGELOG.

### Bugs de upload de midia / erros engolidos no X provider (2026-04-10)

- **`libraries/nestjs-libraries/src/integrations/social/x.provider.ts`** —
  metodo `uploadMedia` (proximo linha 350-395 no nosso fork).
  - **Bug upstream (duplo):**
    1. Usa `client.v2.uploadMedia` da lib `twitter-api-v2`, que bate no
       endpoint NOVO X API v2 `/2/media/upload/initialize` (chunked). Esse
       endpoint requer tier pago ou OAuth 2.0 com escopo `media.write` e
       **nao funciona em contas do tier Free**, que so tem acesso ao endpoint
       legado v1.1 `/1.1/media/upload.json`. No tier Free a chamada falha
       com "Unknown Error" no wrapper do `runInConcurrent`.
    2. Convertia TODA imagem nao-mp4 para GIF via
       `sharp(...).resize({width:1000}).gif().toBuffer()`, mas passava
       `media_type: (lookup(m.path) || '')` (MIME do arquivo original, ex.
       `image/png`). Buffer GIF com MIME PNG e rejeitado pelo X.
  - **Nosso fix:**
    1. Migrado para `client.v1.uploadMedia(buffer, { mimeType })` — endpoint
       v1.1 que funciona em todos os tiers. Media IDs do v1.1 sao aceitos
       pelo `client.v2.tweet` (media IDs sao globalmente validos no X).
    2. Buffer e `mimeType` agora sao coerentes por formato:
       - video/mp4 -> buffer cru + `video/mp4`
       - image/gif animado -> `sharp({animated:true}).gif()` + `image/gif`
       - image/png -> `sharp().png()` + `image/png`
       - image/webp -> `sharp().webp()` + `image/webp`
       - outros -> `sharp().jpeg()` + `image/jpeg`
  - **Ao sincronizar:** verificar o upstream atual com
    `git show upstream/main:libraries/nestjs-libraries/src/integrations/social/x.provider.ts | grep -A 5 "uploadMedia"`.
    - Se ainda usar `client.v2.uploadMedia`: **NAO** aceite a versao upstream.
      Mantenha o nosso `client.v1.uploadMedia`.
    - Se ainda usar `.gif()` hardcoded: mantenha o nosso fluxo por formato.
    - Se o upstream tiver corrigido os dois pontos, adote a versao upstream e
      remova este item da lista.

- **`libraries/nestjs-libraries/src/integrations/social/x.provider.ts`** —
  metodos `getClient`, `post`, `comment`, `autoRepostPost`, `repostPostUsers`,
  `autoPlugPost`, `analytics`, `postAnalytics`, `mention` e helper privado
  `resolveAppKeys`.
  - **Bug upstream:** hardcodam `process.env.X_API_KEY!` e
    `process.env.X_API_SECRET!` em todos os pontos, impossibilitando uso de
    Consumer Keys por perfil (feature do fork — cada Profile tem suas
    proprias credenciais OAuth via `ProviderCredential`).
  - **Nosso fix:** helper `resolveAppKeys(integration?)` decripta
    `integration.customInstanceDetails` (armazenado pelo controller via
    `AuthService.fixedEncryption`) e cai para env var como ultimo recurso.
    Todos os metodos acima aceitam `integration?: Integration` para encadear
    as credenciais corretas ate o `TwitterApi`.
  - **Assinaturas alteradas:** `post` ganhou 4o parametro `integration?`,
    `analytics/postAnalytics` ganharam ultimo parametro `integration?`, e a
    interface `SocialProvider` em `social.integrations.interface.ts` foi
    atualizada para refletir isso.
  - **Ao sincronizar:** conflitos em `x.provider.ts`, `instagram.provider.ts`
    (analytics/postAnalytics), `instagram.standalone.provider.ts`,
    `social.integrations.interface.ts`, `integration.service.ts` (caller de
    `analytics`) e `posts.service.ts` (caller de `postAnalytics`) devem
    preservar as assinaturas estendidas com `integration?: Integration`.

- **`libraries/nestjs-libraries/src/integrations/social.abstract.ts`** —
  metodo `runInConcurrent` (aprox. linhas 74-99).
  - **Bug upstream:** o `catch` envolve qualquer exception em
    `BadBody('Unknown Error')` SEM logar o erro original. Resultado: falhas
    reais de APIs de provider (X, Facebook, etc) aparecem no Temporal como
    "Unknown Error" sem stack trace nem mensagem do provider.
  - **Nosso fix:** adicionado `console.error('[runInConcurrent] provider error:', ...)`
    logando `err.data`, `err.message` e `err.stack` antes do `handleErrors`,
    para que o worker do orchestrator mostre a causa real no terminal / docker
    logs.
  - **Ao sincronizar:** se o upstream tambem nao estiver logando, preserve
    nosso `console.error`. Se o upstream introduziu log proprio, aceitar a
    versao upstream desde que o erro original seja visivel nos logs.

### Credenciais OAuth por perfil (feature do fork, nao upstream)

- **`libraries/nestjs-libraries/src/database/prisma/credentials/credential.service.ts`** —
  metodo `validateCredential` case `twitter`.
  - **Contexto:** o fork suporta credenciais OAuth por perfil via UI de
    Configuracoes. O teste de credenciais do X usa
    `new TwitterApi({appKey, appSecret}).appLogin()` da lib `twitter-api-v2`
    (que resolve o endpoint correto v1.1 `/oauth2/token`). O upstream Postiz
    nao tem esse fluxo de teste; se ele introduzir algo parecido, verifique
    que continua usando o helper da lib em vez de `fetch` direto contra URL
    hardcoded (veja historia: versao anterior do nosso codigo batia em
    `https://api.x.com/oauth2/token`, endpoint inexistente).
  - **Arquivos correlatos nao-upstream:**
    `apps/frontend/src/components/settings/provider-credential-form.component.tsx`,
    endpoints `/credentials/:provider/test` em
    `apps/backend/src/api/routes/credentials.controller.ts`.

## Regras Importantes

- NUNCA executar `git push --force` em nenhuma branch
- NUNCA commitar diretamente na branch `postiz`
- Sempre pedir confirmacao antes de resolver conflitos
- Se algo parecer errado, parar e perguntar ao usuario
- O build e opcional mas fortemente recomendado
- **Sempre reler a secao "Customizacoes Divergentes do Upstream" antes de
  aceitar qualquer resolucao de conflito nos arquivos listados.**
