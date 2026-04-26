# Auditoria: providers OAuth ignorando credenciais por perfil

## Contexto

O Robô MultiPost suporta credenciais OAuth (Client ID + Client Secret) **por
perfil** dentro de cada workspace, configuráveis em **Settings > Credenciais**.
A regra (registrada em `memory/feedback_per_profile_credentials.md`) é que todo
provider social com OAuth precisa propagar `ClientInformation` em
`generateAuthUrl(clientInformation?)` **e** `authenticate(params,
clientInformation?)`, com fallback para `process.env.X` apenas quando o
workspace não tiver credenciais cadastradas.

A infra do controller (`apps/backend/src/api/routes/integrations.controller.ts`)
já está pronta — busca credenciais por `getProviderCredentials(provider, org.id,
profile?.id)` e passa para o provider via `generateAuthUrl(getExternalUrl)`. O
ponto de vazamento é dentro do arquivo do provider quando ele descarta o
argumento e lê `process.env.*` direto.

## Sintomas

Quando o provider está quebrado, o usuário cadastra Client ID/Secret em
**Settings > Credenciais** mas o OAuth abre o consent screen com o app **errado**
(o do `.env` global) ou retorna erro como `Erro 400: invalid_request — Missing
required parameter: client_id` quando o `.env` está vazio. Cada perfil
deveria ter seu próprio app OAuth isolado, mas todos compartilham o mesmo.

## Status atual

| Provider | Status | Observação |
|----------|--------|------------|
| `facebook` | ✅ Corrigido | Padrão a copiar — `facebook.provider.ts:186` |
| `instagram` | ✅ Corrigido | |
| `instagram-standalone` | ✅ Corrigido | |
| `threads` | ✅ Corrigido | `threads.provider.ts:80,101` |
| `x` (Twitter) | ✅ Corrigido | |
| `youtube` | ✅ Corrigido | |
| `linkedin` | ✅ Corrigido | |
| `linkedin-page` | ✅ Corrigido | Compartilha credencial com `linkedin` (alias) |

## Pendentes — providers que precisam do fix

Auditados via grep `async generateAuthUrl(` sem `(clientInformation`. Listados
por **prioridade** (baseado em probabilidade de uso real pelo público do fork).

### 🔴 Alta prioridade (uso comum no público brasileiro)

| Provider | Arquivo | Tipo OAuth |
|----------|---------|------------|
| `tiktok` | `tiktok.provider.ts` | client_id/secret |
| `pinterest` | `pinterest.provider.ts` | client_id/secret |
| `reddit` | `reddit.provider.ts` | client_id/secret |
| `discord` | `discord.provider.ts` | client_id/secret |
| `slack` | `slack.provider.ts` | client_id/secret |
| `gmb` (Google My Business) | `gmb.provider.ts` | client_id/secret (compartilha com Google) |

### 🟡 Média prioridade

| Provider | Arquivo | Tipo OAuth |
|----------|---------|------------|
| `mastodon` | `mastodon.provider.ts` | client_id/secret |
| `mastodon.custom` | `mastodon.custom.provider.ts` | client_id/secret + URL dinâmica |
| `vk` | `vk.provider.ts` | client_id/secret |
| `twitch` | `twitch.provider.ts` | client_id/secret |
| `farcaster` | `farcaster.provider.ts` | client_id/secret |
| `dribbble` | `dribbble.provider.ts` | client_id/secret |
| `mewe` | `mewe.provider.ts` | client_id/secret |
| `whop` | `whop.provider.ts` | client_id/secret |
| `kick` | `kick.provider.ts` | client_id/secret |

### 🟢 Baixa prioridade (blogging/CMS, uso menor)

| Provider | Arquivo | Tipo |
|----------|---------|------|
| `medium` | `medium.provider.ts` | OAuth |
| `dev.to` | `dev.to.provider.ts` | API key (verificar se aplicável) |
| `hashnode` | `hashnode.provider.ts` | API key (verificar se aplicável) |
| `wordpress` | `wordpress.provider.ts` | OAuth |
| `lemmy` | `lemmy.provider.ts` | OAuth |
| `skool` | `skool.provider.ts` | client_id/secret |
| `moltbook` | `moltbook.provider.ts` | a verificar |

### ⚪ Não aplicável (sem OAuth client_id/secret)

| Provider | Motivo |
|----------|--------|
| `bluesky` | Login com handle + app password |
| `nostr` | Chave privada, descentralizado |
| `telegram` | Bot token (sem OAuth) |
| `listmonk` | URL + API key |
| `zernio.base` | `instanceUrl` (API key Zernio, tratamento dedicado no controller) |

## Padrão de fix

Para cada provider OAuth da lista pendente, o fix mecânico é:

1. **Importar** `ClientInformation`:

   ```ts
   import { ClientInformation } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
   ```

2. **Aceitar** `clientInformation?: ClientInformation` em `generateAuthUrl`:

   ```ts
   async generateAuthUrl(clientInformation?: ClientInformation) {
     const clientId =
       clientInformation?.client_id || process.env.X_CLIENT_ID;
     // ... resto inalterado
   }
   ```

3. **Aceitar** `clientInformation?: ClientInformation` em `authenticate`:

   ```ts
   async authenticate(
     params: { code: string; codeVerifier: string; refresh?: string },
     clientInformation?: ClientInformation
   ) {
     const clientId =
       clientInformation?.client_id || process.env.X_CLIENT_ID;
     const clientSecret =
       clientInformation?.client_secret || process.env.X_CLIENT_SECRET;
     // ... resto inalterado
   }
   ```

4. **NÃO mudar** `refreshToken`, `pages`, `post`, `analytics`, etc. — esses
   métodos só usam `accessToken` (já válido) e seguem o mesmo padrão de
   Facebook/Threads/YouTube. Limitação conhecida: `refreshToken` continua
   caindo nas env vars (vem do upstream Postiz).

Referências de implementação correta:
- `libraries/nestjs-libraries/src/integrations/social/facebook.provider.ts:186`
- `libraries/nestjs-libraries/src/integrations/social/threads.provider.ts:80,101`
- `libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts:24,161,177`

## Frontend — UI de credenciais e callback URL

Cada provider corrigido também precisa aparecer no **Settings > Credenciais**:

1. Adicionar uma entrada no registry `PROVIDERS` em
   `apps/frontend/src/components/settings/credentials-settings.component.tsx`,
   com `callbackPath` apontando para o `redirect_uri` real do provider (grep no
   `*.provider.ts` para confirmar).
2. Confirmar que o backend tem o endpoint `POST /credentials/:provider` mapeado
   para esse identificador (`apps/backend/src/api/routes/credentials.controller.ts`).
3. Confirmar que o schema de `Credentials` no Prisma cobre os campos
   necessários — alguns providers podem precisar de campos extras (como o
   Discord já tem `botToken`, Slack tem `signingSecret`).

## Critério de aceite por provider

Para considerar o fix completo, validar end-to-end:

1. Em ambiente sem `X_CLIENT_ID`/`X_CLIENT_SECRET` no `.env`.
2. Cadastrar Client ID/Secret reais em **Settings > Credenciais > Provider**.
3. Tentar conectar um canal do provider.
4. **Esperado**: tela de consent abre com o app correto (do workspace, não do
   `.env` default).
5. **Bonus**: trocar para outro perfil, cadastrar credenciais **diferentes**, e
   confirmar que cada perfil usa seu próprio app OAuth (sem vazamento entre
   perfis).

## Estratégia de batelada

**Não fazer tudo em uma PR.** Sugestão de agrupamento:

- **PR 1 — Alta prioridade Bloco A**: TikTok, Pinterest, Reddit (3 providers,
  todos com tráfego brasileiro alto)
- **PR 2 — Alta prioridade Bloco B**: Discord, Slack, GMB
- **PR 3 — Média prioridade**: Mastodon, Twitch, VK, Farcaster, Dribbble,
  Whop, Kick, MeWe
- **PR 4 — Baixa prioridade**: blogging providers (Medium, WordPress, Lemmy,
  Skool) + auditoria final dos restantes

Cada PR deve incluir:
- Fix do provider em `*.provider.ts`
- Entrada no registry `PROVIDERS` do frontend (com `callbackPath`)
- Entradas no `CHANGELOG.md` (Corrigido + Adicionado)
- Validação manual seguindo o critério de aceite acima

## Histórico

- 2026-04-25 — Documento criado após o fix do YouTube. Auditoria via grep
  identificou 29 providers candidatos; após triagem, 21 são aplicáveis e
  precisam de fix (8 alta, 9 média, 4 baixa prioridade). Demais 8 não usam
  OAuth client_id/secret e ficam fora do escopo.
- 2026-04-26 — Fix de `linkedin` e `linkedin-page` aplicado seguindo o mesmo
  padrão. Restam 6 alta + 9 média + 4 baixa prioridade.
