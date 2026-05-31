# 🛠️ HANDOFF — Correção do MCP + Novas Funções (Robô MultiPost)

> **Comece por aqui.** Este é o ponto de entrada pra trabalhar no projeto na sua IDE.
> Abra esta pasta inteira na sua IDE (VS Code/Cursor) e use o Claude Code aqui dentro.

## Onde está tudo

| O quê | Caminho |
|---|---|
| **Este repo (código do app)** | `C:\Users\marce\_postiz_src` |
| **Design / spec** | `docs/superpowers/specs/2026-05-31-mcp-fixes-and-tools-design.md` |
| **Plano de implementação** | `docs/superpowers/plans/2026-05-31-mcp-fixes-and-tools-plan.md` |
| **Tools do MCP (onde editar)** | `libraries/nestjs-libraries/src/chat/tools/` |
| **Entrada do MCP** | `libraries/nestjs-libraries/src/chat/start.mcp.ts` |
| **Contexto/auth** | `libraries/nestjs-libraries/src/chat/async.storage.ts`, `auth.context.ts` |
| Branch de trabalho | `feat/mcp-context-fix-and-tools` (já criado) |

## O que vamos fazer (resumo)

1. **Corrigir o MCP** — as tools leem o contexto do jeito frágil; trocar para `getAuth()`/`getProfileId()`.
2. **Tool `uploadMediaFromUrl`** — hospeda mídia de uma URL (resolve carrossel/imagens).
3. **Tool de automações** — criar/gerenciar Flows (comentário→resposta/DM) via MCP.

Detalhes completos no **spec**. Passo a passo no **plano**.

---

## Passo 0 — Git (você faz, eu não crio conta/login)

1. No GitHub, **Fork** de `https://github.com/maiconramos/robo-multipost` pra sua conta.
2. Aponte este clone pro **seu** fork e suba o branch:
   ```bash
   cd C:\Users\marce\_postiz_src
   git remote set-url origin https://github.com/SEU_USUARIO/robo-multipost.git
   git push -u origin feat/mcp-context-fix-and-tools
   ```
   > Dica: este clone é **shallow** (`--depth 1`). Se precisar do histórico completo:
   > `git fetch --unshallow`.

## Passo 1 — Implementar (na IDE, com o Claude)

Abra a pasta na IDE e peça ao Claude:
> "Leia `docs/superpowers/plans/2026-05-31-mcp-fixes-and-tools-plan.md` e execute o plano,
> uma fase por vez, rodando os testes."

O plano é incremental: Componente 1 (correção) → 2 (upload) → 3 (automações).

## Passo 2 — Build da imagem (a parte mais pesada)

O Postiz é um monorepo (pnpm). Duas opções:

**A) GitHub Actions (recomendado)** — build na nuvem, sem pesar seu PC:
- Crie `.github/workflows/build-image.yml` que faz `docker build` e dá push pra
  `ghcr.io/SEU_USUARIO/robo-multipost:fix-mcp`.
- (O plano inclui um workflow pronto pra colar.)

**B) Build local** — precisa de Docker + bastante RAM:
   ```bash
   docker build -t ghcr.io/SEU_USUARIO/robo-multipost:fix-mcp .
   docker push ghcr.io/SEU_USUARIO/robo-multipost:fix-mcp
   ```

## Passo 3 — Deploy (trocar a imagem no stack)

No Portainer → stack `multpost` → Editor:
- Troque `image: ghcr.io/maiconramos/robo-multipost:latest`
  por `image: ghcr.io/SEU_USUARIO/robo-multipost:fix-mcp`
- **Update the stack**. Pronto — o MCP passa a usar a imagem corrigida.

> Rollback: volte a `image:` para `ghcr.io/maiconramos/robo-multipost:latest` e update.

## Passo 4 — Validar

- Via MCP: `integrationList` deve listar os canais (sem erro de `undefined`).
- `uploadMediaFromUrl` com uma URL de imagem → devolve um `path` do Postiz.
- Agendar um carrossel passando esses `path` como `attachments`.

---

## Trilha B — Ativar automações de comentário/DM (configuração, sem código)

A engine já existe. Para **disparar** de verdade:

1. **Conectar o Instagram via IG Login (standalone)** — evita a App Review da Meta
   (Standard Access). No Postiz: Adicionar canal → Instagram (Standalone).
2. **Credenciais Meta** (Settings → Credenciais → Instagram): registrar o
   `Meta System User Token` e o `IG User Token` por conta (necessário p/ DM e follow-check).
3. **Webhook**: garantir que o Postiz recebe os eventos do Meta no endpoint de webhook do
   IG (o domínio `post.marcelofranca.pro` é público — ok). Conferir o HMAC (2 segredos).
4. **Criar o Flow**: aba "Automações" → "comentou X no post Y → responde Z e/ou DM W"
   (ou via a tool nova de automações do MCP).

> Leitura obrigatória antes de mexer em IG:
> `docs/architecture/instagram-automations.md` e
> `libraries/nestjs-libraries/src/integrations/social/CLAUDE.md`.

**Facebook:** comentários/DM do FB ainda não confirmados nos Flows — verificar nesta trilha.

---

## ⚠️ Segurança
- Nunca commitar tokens/segredos. O stack (docker-compose) tem segredos — **não** versione
  ele com valores reais (use `.env` + `.gitignore`). Este repo de **código** não tem segredos.
- A chave da OpenAI que apareceu no chat anteriormente: **rotacione** em platform.openai.com.
