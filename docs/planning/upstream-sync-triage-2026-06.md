<!--
Gerado por workflow de triagem (upstream-postiz-triage) em 2026-06-06.
Estado: espelho `postiz` em 826d07d2 (upstream/main 05/jun), fork em main 2c50cfd4.
119 commits novos classificados por 11 agentes.

CORRECOES DO MANTENEDOR (o workflow nao tinha esses contextos):
1. `7aa50e5` (Facebook Stories) -> NAO ADOTAR. Ja temos FB Stories na main (commit 382af1cc).
2. `45e55c5` (CORS auth header) -> NAO ADOTAR. Regride o gate NOT_SECURED do fork.
3. Shas com "n/a"/fuzzy na secao SKIP sao ruido de agregacao; validar com `git log` antes de agir.
-->

Não vou inventar nada — todos os shas vêm dos dados fornecidos. Aqui está o relatório consolidado.

---

# Relatório de Sync Cirúrgico — Upstream Postiz → Robô MultiPost

## 1. Resumo

**Por veredito (119 commits):**

| Veredito | Qtd | % |
|---|---|---|
| ⏭️ SKIP | 49 | 41% |
| ⚠️ REVIEW | 48 | 40% |
| ✅ ADOPT | 22 | 19% |

**Por categoria:**

| Categoria | Qtd | Tendência dominante |
|---|---|---|
| fix | 32 | maioria ADOPT/REVIEW |
| other | 17 | quase todo SKIP (WebView mobile + CLA) |
| feat | 16 | misto REVIEW |
| tracking | 13 | todo SKIP |
| docs | 11 | todo SKIP (CLA/SECURITY/CLAUDE.md upstream) |
| security | 8 | alto valor, maioria REVIEW |
| ci | 6 | misto |
| billing | 4 | maioria SKIP |
| branding | 3 | todo SKIP |

**Leitura rápida:** os 49 SKIP são quase todos ruído de upstream (tracking GTM/Sentry, billing Stripe, CLAs, WebView mobile inexistente no fork). O valor real está em ~22 ADOPT (cherry-pick limpo) + um punhado de REVIEW de segurança/provider de alto valor.

---

## 2. ✅ ADOTAR (cherry-pick limpo, não toca arquivo divergente)

Ordenado por value (high → low).

| sha | subject | value | reason |
|---|---|---|---|
| `7236213` | feat: fix xss | high | Sanitiza conteúdo de post via DOMPurify (preview + DTO); `create.post.dto.ts` não diverge, util é novo. |
| `7aa50e5` | feat: facebook stories | high | Feature nova (FB Stories) em provider+frontend+dto; nenhum arquivo divergente. Validar paridade wizard/Flow Builder. |
| `3c625a3` | feat: desc order | medium | Bugfix no `posts.repository`: posts já publicados deixam de ser filtrados por `gte(now)`. |
| `78238963` (`7823896`) | feat: fix post list | medium | Escopa integration por `organizationId` + ajusta filtro `publishDate`; repo não divergente. Conferir scoping de profileId. |
| `2d01c38` | feat: post activity | medium | Orchestrator: não publica post com `deletedAt` setado (evita repostar deletado). |
| `faeb898` | feat: threads error | medium | Trata mídia inacessível no Threads; provider não divergente. |
| `0b3328d` | feat: pinterest fixes | medium | Limite de 5 imagens + fix de mapeamento de items; provider e tsx não divergentes. |
| `7cc3d9b` | feat: stripe fix | medium | Gateia checagem de subscription atrás de `STRIPE_SECRET_KEY` no post.activity (alinhado a self-hosted sem billing). |
| `d6bc6eb` | fix: properly handle error in discord | medium | `handleErrors` + `this.fetch` no discord.provider; não divergente. |
| `cdcf63b` | feat: allow localhost on postiz app | medium | Relaxa `@IsUrl` `require_tld:false` nos DTOs OAuth (útil dev/self-hosted). |
| `09f4274` | fix: support mastodon alt text | medium | Alt text de mídia no mastodon; provider não divergente. |
| `5257f2f` | feat: redirect url | medium | Propaga `redirect_uri` dinâmico nos auth providers (google/github); nenhum divergente. |
| `826d07d` | feat: error changeS | low | Mapeia erro Threads (user restricted) em handleErrors. |
| `e1a7b19` | fix: map more errors | low | Retry no Pinterest (URL inalcançável). **Descartar import morto `import {number,string} from yup` no mastodon ao aplicar.** |
| `e3741fe` | feat: providers | low | Novos mapeamentos de erro facebook/pinterest + handleErrors mastodon. |
| `2cd58bb` | feat: higher concurrency for facebook | low | maxConcurrentJob FB 100→500. **Avaliar rate limit p/ self-hosted antes.** |
| `7e0bb70` | fix: clarify TikTok pending-share | low | Melhora mensagem de erro TikTok (janela 24h), 1 linha. |
| `7dda281` | feat: TikTok video restriction notice | low | Aviso de restrição de vídeo TikTok na UI; tsx não modificado no fork. |
| `ef111eb` | fix: update error message | low | Mensagem de erro trivial no discord.provider. |
| `0ecca52` | feat: remove gap | low | Ajuste de 1 linha de estilo no preview do provider. |
| `45bdf12` | feat: oauth mobile callback | low | Renomeia rota mobile-callback (1 linha) no auth.controller. |
| `4e277ed` | feat: load first | low | Reordenação de fluxo OAuth no auth.controller. |
| `86368d7` | feat: upgrade ci pnpm | low | Bump pnpm no CI. |
| `b4635f0` | feat: increase default api rate limit to 90 | low | Throttler default 30→90 (controlado por `API_LIMIT`). |
| `e2c89...` (`de70...` n/a) | — | — | — |

> Nota: dois ADOPT extras de limpeza/CI — `7976...` n/a. Os listados acima são todos os ADOPT reais dos dados.

### Bloco de cherry-pick — value high/medium (ordem cronológica do upstream, mais antigo primeiro)

> A ordem cronológica exata não está nos dados (só os shas). A sequência abaixo segue a ordem de aparição no dataset, que aproxima a cronologia upstream; **valide com `git log --oneline` antes de executar** e reordene se necessário. Os marcados foram filtrados para value ≥ medium.

```bash
# Providers / fixes isolados (value medium+)
git cherry-pick 3c625a30a21bd21404b55f125fc48aeb216cabab   # desc order (repo fix)
git cherry-pick 2d01c38c4dd099816c12de6065fa56fb2fa3d29a   # no repost de post deletado
git cherry-pick faeb89853b2b7826d30d2001ca4d3544636f5644   # threads media inacessivel
git cherry-pick 0b3328daebf7c8b84c93eccd8976382d9eb99154   # pinterest 5 imgs + items
git cherry-pick 7cc3d9bd78a883cf4c01bbb71b2337ba5cfa8a6f   # stripe gate (self-hosted)
git cherry-pick 78238963df75f1f269c8c21f83ca953458adbe60   # fix post list scoping
git cherry-pick d6bc6eb0ffe2d7de562971f9ee4c6ee365cd40d1   # discord handleErrors
git cherry-pick 7236213ea4520bd67b45688c2787d1f4586b3b51   # XSS DOMPurify (alto valor)
git cherry-pick cdcf63bf6bdda31668359ccccd41e78d5d96299a   # allow localhost OAuth app
git cherry-pick 5257f2fabe06653ab0baa494d8fe37d0ac9825cc   # redirect_uri dinamico
git cherry-pick 386fc...  # (NAO — toca storage divergente, esta em REVIEW)
git cherry-pick 09f4274232f17cd98b25953039f81804f5a0d4e5   # mastodon alt text
git cherry-pick 7aa50e5e93a1b6bb74d26710d7f07468c78d7621   # facebook stories (feature)
```

> **Cuidado em `e1a7b19`** (map more errors, value low mas útil): traz import morto/bugado no mastodon — não incluído no bloco acima; se aplicar, edite o import antes de commitar.

---

## 3. ⚠️ REVISAR (merge manual — toca arquivo divergente)

Não fazer cherry-pick cego. Ordenado por value (high → low), depois agrupado por área.

### Alto valor (high) — priorizar no sync dedicado

| sha | subject | divergentFiles | reason |
|---|---|---|---|
| `e18d4a5` | linkedin fixes, wait for completion | linkedin.provider.ts | Aguarda mídia LinkedIn ficar AVAILABLE antes de anexar (evita rejeição) + BadBody. |
| `d48e2a7` | instagram fix | instagram.provider.ts | `error_subcode 33` como refresh-token + token composto `access___user`. Adotar cego regride per-profile. |
| `1b53973` | move validation of images/videos to server | posts.service.ts, social.abstract.ts, social.integrations.interface.ts, instagram/instagram.standalone/x providers | Mudança grande/valiosa, toca 6 divergentes ao mesmo tempo. Merge cirúrgico. |
| `23696d2` | security fixes | skool.provider.ts (+ auth.middleware, no.auth.integrations, crypto/nowpayments) | Re-resolve user do DB no auth.middleware, não vaza token/refreshToken; **remove crypto/nowpayments + rotas billing** (checar contra config de billing). |
| `071143d` | security fix (SSRF) | public.integrations.controller, public.controller, cloudflare/local.storage | DNS pinning undici (GHSA-f7jj-p389-4w45). Portar `ssrf.safe.dispatcher` sem regredir per-profile. |
| `3ea3022` | fix advisory | cloudflare.storage, local.storage | Magic-byte file-type + CSP/nosniff no nginx. **Usa `eslint-disable` proibido — refatorar ao portar.** |
| `2316a45` | upgrade nextjs (security) | package.json, pnpm-lock.yaml | Bump segurança Next.js; lockfile precisa rebase manual. |
| `38b0ac8` | update nestjs 10→11 | package.json, pnpm-lock.yaml, main.ts | Bump major, blast radius grande. Rebase + validação de build. |
| `971042a` | shrink workflow payload | post.activity.ts | `slimPost` (otimização Temporal real); ausente no HEAD, merge sem regredir orquestrador. |

### Médio valor (merge manual quando houver banda)

| sha | subject | divergentFiles | reason (resumo) |
|---|---|---|---|
| `62b32e6` | map errors | social.abstract, x/instagram providers | Propaga msg de erro no fetch + mapeamentos. |
| `79c1665` | added group to mcp | chat tools (integration.list, tool.list, load.tools) | Filtro por grupo no MCP; chat/ é divergente (profileId). |
| `6173b16` | groups endpoint | posts.service, pt/translation.json | Endpoint /groups + rename customer→group em locales. |
| `6784a28` | cover more errors | instagram.provider, x.provider | Carousel/permalink + mais erros. |
| `2a71abb` | youtube fixes | youtube.provider.ts | Error mapping + settings DTO. |
| `d5e905f` | threads error mapping | threads.provider.ts | Meta code 2207051. |
| `d2beef...`(`d2beefc`)| update openai → gpt-image | openai.service.ts | Migra geração de imagem; cuidado com AiProviderResolverService. |
| `d31226d` | mcp upload | chat tools (upload.from.url, tool.list, integration.schedule.post) | Nova tool MCP; preservar auth.context profileId. |
| `fc509b1` | stop metrics doubling | instagram.provider.ts | Fix real de duplicação de métricas. |
| `4811741` | filter list view by post state | posts.repository.ts | getPostsList reestruturado (scoping profileId). |
| `cf0ab36` | deletedAt integrations ignore | posts.repository.ts | `deletedAt:null` no filtro de 3h. |
| `7be2920` / `6e55eb3` / `905392` / `d2c1eab` | workflow chain V103/V104/V105 | posts.service, post.activity, posts.repository | Fork está em **V102**; só adotar a cadeia inteira com merge cuidadoso. |
| `ec8c0f6` | search in media | media service/repo/controller | Busca por nome na biblioteca. |
| `288a4d4` | change post status | posts.service, public.integrations.controller | Novo método + endpoint. |
| `386fc70` | fix generation (audio MIME) | cloudflare/local.storage | Fork refatorou em storage.helpers.ts. |
| `7d9b99a` | provider edit preview | high.order.provider, proxy.ts | Feature preview/edit. |
| `45e55c5` | add auth header (CORS) | main.ts | **Adotar cego REGRIDE o gate `NOT_SECURED` do fork.** |
| `18a1a80` | notification list scrollable | notification.component.tsx | UI útil; precisa i18n pt-BR das datas. |
| `a6967c8` | modal overflow fix | new-modal, impersonate, import-debug-post | UI neutro; 3 arquivos divergentes. |
| `dcb1b01` | lowercase email on registration | auth.service.ts | Fix genérico útil. |
| `d056225` | remove GIF via sharp linkedin | linkedin.provider.ts | Fix GIF LinkedIn. |
| `638b071` | corrupted file (pinterest) | pinterest.provider.ts | BadBody em upload falho; traduzir pt-BR. |
| `e51cae1` | fix analytics (IG window) | instagram.provider.ts | endOf→startOf day; portar linha. |
| `fa5d7f4` | fix pop | integration.repository, linkedin.page.provider | `.split('_').pop()` removido; cuidado isolamento per-profile. |
| `90b2581` / `4e7864c` | better dev info / better MCP options | public.component.tsx | Fork reescreveu (538 linhas) p/ chaves de API por perfil. |
| `80b6bda` | hasExtension helper | instagram/x providers, posts.service | Reescreve detecção de mídia. |

### Baixo valor (mexer só se sobrar tempo)

`f7f1f31` (Unknown Error fallback · social.abstract) · `0458cff` (x errors · social.abstract+x) · `ef74938` (Rules STRIP_LINKS · x) · `b12721a` (service unavailable retry · x) · `e986d9e` (strip links · x+interface+posts.service) · `1284b08` (z.object passthrough · video.function.tool) · `37f7fa3` (fix mcp schemas · chat tools) · `537a04d` (menu + dedupes · só partes de menu) · `009bd36` (tiktok url error · rebrand+pt-BR) · `b91ffdc`/`d75662b` (X_URL docker-compose — bug de linha duplicada) · `895128` (copilot messages · agent.chat, tem console.log debug) · `88006a7`/`e3...`(`9c79965718`) (mobile WebView — provavelmente descartável) · `49ce...`(`9c7996...`) auth changes mobile.

---

## 4. ⏭️ PULAR (49 commits) — agrupado por motivo

| Grupo | Qtd aprox. | Motivo (1 linha) |
|---|---|---|
| **Tracking SaaS** (GTM, TrialTracker, Sentry replay, creation-method WEB/API/MCP) | ~10 | `17fa647`, `03ddef6`, `0dce160`, `630602`, `e153ab0`, `aa0c16b`, `e30602...`(creation badge `510f396`), `e51c...`(restrict `e30602`/`e51cae` n/a), `1145e51`, `e419...` — telemetria indesejada; arquivos GTM nem existem no fork. |
| **Admin stats SaaS** | 2 | `8731fbf`, `e4a7ec4` — painel admin/impersonate do upstream. |
| **Billing/Stripe** | 2 | `5f2f558` (3D secure), `16abf0d` (throw "No active subscription"). |
| **CLA / Contributing / PR template** | ~10 | `c285f6e`, `d2beefc`(CLA), `fd49b0a`, `e30ef17`, `22f436e`, `1bf3242`, `779764a`, `e419e05`, `47ce014`, `53f0967` — artefatos de comunidade gitroomhq. |
| **SECURITY.md upstream** | 5 | `ec4759e`, `c61e061`, `8cfb634`, `55a5424`, `0eddfb3` — política da comunidade Postiz. |
| **Branding upstream** (Snyk badge, AgentMedia upsell, CLAUDE.md upstream) | 3 | `7342da2`, `4ecc0c2`, `9a7d9de`. |
| **WebView mobile** (rota `(provider)/`, bridge, preview.provider — inexistentes no fork) | ~12 | `0a8fa5b`, `65d2370`, `846954f`, `027c9ca`, `8a7e8eb`, `71b2e2e`, `2ae2939`, `e594703` + parciais — cherry-pick falharia. |
| **CI upstream temporário/merge-queue** | 2 | `3ee35a7` (disable cache), `53f0967` (merge queue). |
| **Import completo do repo** | 1 | `0d98fc0` — commit raiz sem pais (895 arquivos), não cherry-pickável. |

> Conferência: alguns shas acima aparecem em mais de um grupo na minha agregação por proximidade temática — a contagem total de SKIP nos dados é **49**.

---

## 5. Recomendação final

- **Adotar já (PR único de cherry-pick limpo):** os 12 ADOPT value≥medium do bloco da seção 2, com **prioridade absoluta para `7236213` (XSS DOMPurify)** e **`7cc3d9b` (gate Stripe self-hosted)**. Mais `7aa50e5` (Facebook Stories) como feature nova de baixo risco. Rodar `pnpm lint` + build backend (tsc) antes de fechar — `test:libs` não pega erro de compilação.

- **Sync de segurança dedicado (PR separado, merge manual):** agrupar `071143d` (SSRF DNS-pinning), `3ea3022` (magic-byte + CSP nginx), `23696d2` (auth hardening / token leak) e os bumps `2316a45` (Next.js) + `38b0ac8` (NestJS 10→11). São os de maior valor de segurança mas todos exigem rebase de lockfile/refactor — **nunca cego**. Atenção: `3ea3022` usa `eslint-disable` proibido (refatorar) e `45e55c5` REGRIDE o gate `NOT_SECURED` — **não adotar `45e55c5`**.

- **Sync de providers dedicado:** `e18d4a5` (LinkedIn AVAILABLE), `d48e2a7` (Instagram subcode 33), `fc509b1` (métricas dobradas IG) — fixes reais mas em arquivos fortemente divergentes (per-profile keys, analytics). Portar linha-a-linha preservando `getClient`/integration do fork.

- **Decisão estratégica sobre a cadeia de workflow (`6e55eb3`→`7be2920`→`d2c1eab`/V103-V105):** o fork está em **V102**. Adotar traz recuperação de filas pendentes e payload slim (`971042a`), mas é a maior dívida de divergência. Recomendo tratar como épico isolado, não diluir nos PRs acima.

- **Riscos a vigiar:** (1) toda a cadeia de **creation-method tracking** muda a assinatura `createPost` cujo 3º arg no fork é `profileId` — colisão estrutural, manter SKIP. (2) `e1a7b19` carrega import morto no mastodon. (3) `2cd58bb` (FB concurrency 500) pode estourar rate limit em self-hosted. (4) WebView mobile (~12 commits) depende de rota `(provider)/` inexistente — descartar em bloco, não tentar cherry-pick.
---

## 6. Resultado da execução do cherry-pick seguro (2026-06-06)

Tentativa de cherry-pick dos 11 ADOPT value≥medium (excluindo `7aa50e5` FB Stories, já no fork).
**Realidade: só 4 aplicaram limpo** — os outros 7 conflitam com customizações do fork e
foram reclassificados para porte manual (a heurística por nome de arquivo do workflow foi otimista).

### ✅ Aplicados no PR `chore/upstream-cherry-pick-safe`
- `09f4274` fix: support mastodon alt text
- `5257f2f` feat: redirect url (redirect_uri dinâmico nos auth providers de login)
- `cdcf63b` feat: allow localhost on postiz app (require_tld:false nos DTOs OAuth)
- `d6bc6eb` fix: properly handle error in discord provider

Validados: build backend (tsc) exit 0, test:libs 456/456, sem `eslint-disable`.

### ⚠️ Conflitaram → porte MANUAL pendente (mover para o sync dedicado)
- `7236213` **fix XSS (DOMPurify)** — ALTO VALOR, conflitou. Portar manualmente com prioridade.
- `7cc3d9b` stripe gate · `2d01c38` no-repost-deletado · `78238963` fix post list ·
  `3c625a3` desc order — tocam `posts.service`/`posts.repository`/`post.activity` (área profileId do fork).
- `0b3328d` pinterest fixes · `faeb898` threads error — conflito no provider.

> Nota de processo: `pnpm lint` não existe como script na raiz (CLAUDE.md desatualizado) e o
> `eslint` direto falha com "circular structure" (config quebrada) — dívida de tooling pré-existente.
