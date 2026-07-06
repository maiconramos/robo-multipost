# E-mails multi-idioma (i18n) — Agent Reference

Como os e-mails e as notificações do app são traduzidos (pt/en). Documento
para agentes de IA e engenharia entenderem rapidamente onde o idioma é
resolvido, onde o texto vive, e como as notificações são escopadas por perfil.

> Contexto: o backend/orchestrator **não** tinha camada de i18n (só o frontend,
> via `useT()`, que não alcança o código de e-mail rodando no Temporal). Esta
> arquitetura fecha essa lacuna.

---

## 1. Camada de i18n de e-mail

`libraries/nestjs-libraries/src/emails/i18n/`

- **`catalog.ts`** — `CATALOG = { pt, en }`, mapa flat `snake_case` → template com
  interpolação `{{var}}` (mesma convenção do i18next do frontend). Contém as
  chaves de e-mail transacional, os assuntos/mensagens de notificação e o
  assunto do digest.
- **`email.i18n.ts`** — funções **puras**:
  - `emailT(key, lang, params?)` — lookup `CATALOG[lang][key] ?? CATALOG['pt'][key] ?? key`, interpola `{{var}}`.
  - `normalizeLang(raw)` — `pt-BR`→`pt`, `en-US`→`en`, default `pt`.
  - `resolveOrgLang(org)` — `normalizeLang(org?.language)`.
  - `renderDigestEmail(items, lang)` — renderiza um lote de notificações (usado pela activity de e-mail).

**Regra de ouro:** `emailT`/o catálogo **nunca** são importados dentro de um
`*.workflow.ts` do Temporal (a renderização vive em services/activities). Os
workflows carregam apenas **chave + params** e delegam a renderização à
activity `EmailActivity.sendDigestEmail`. Isso mantém o bundle de workflow
determinístico (mesma regra do `make.is.ts` sobre `crypto`).

## 2. Idioma por workspace (`Organization.language`)

Decisão: **um idioma por organização** (não por usuário). Resolução dos e-mails:
`org.language ?? 'pt'`.

- **Coluna:** `Organization.language String?` (`schema.prisma`).
- **Captura no cadastro:** o decorator `@AcceptLanguage()`
  (`libraries/nestjs-libraries/src/user/user.agent.ts`) lê o header
  `x-i18next-current-language` (enviado pelo proxy do frontend) com fallback
  `accept-language`; `AuthController.register` → `routeAuth` →
  `createOrgAndUser` grava `normalizeLang(header)` na org nova.
- **Ajuste manual:** `GET/POST /settings/language` (`settings.controller.ts`,
  guard `Sections.ADMIN`) + seletor no frontend
  (`settings/language-preference.component.tsx`, em Configurações Globais).
- **E-mails de conta (forgot/resend):** usuário possivelmente multi-org →
  `OrganizationRepository.getFirstOrgLanguageByUserId` usa a org **mais antiga**
  (a criada no cadastro, onde o locale foi capturado). Fallback `'pt'`.

## 3. Onde cada e-mail resolve o idioma

| E-mail | Arquivo | Idioma |
|---|---|---|
| Ativar conta / reenviar / redefinir senha | `auth.service.ts` | org do usuário (cadastro / mais antiga) |
| Convite de equipe | `organization.service.ts` | org que convida |
| Notificações (imediatas) | `notification.service.ts` `sendEmailsToOrg` | `org.language` |
| Digest / streak | activity `sendDigestEmail` | `org.language` (via `getTeamForNotifications`) |
| Rodapé do wrapper | `email.service.ts` (`lang` propagado até `sendEmailSync`) | idioma do e-mail |

O nome do remetente vem 100% de `EMAIL_FROM_NAME` (env) — sem código.

## 4. Notificações: chave+params + escopo por perfil

`NotificationService.inAppNotification(orgId, { subjectKey, messageKey, params, profileId }, sendEmail, digest, type)`

- Grava a linha `Notifications` com `contentKey`, `contentParams` e `profileId`
  (mais `content` renderizado em `org.language` como **fallback** para o sino
  legado). Colunas novas: `contentKey String?`, `contentParams Json?`,
  `profileId String?` + `@@index([profileId])`.
- **Sininho in-app** (`notification.component.tsx`): renderiza
  `t(contentKey, contentParams)` no locale de **quem vê** (fallback `content`),
  passando pelo `sanitizePostContent` (os templates podem conter `<a>`/`<br>`).
- **E-mail imediato:** `emailT(...)` no `org.language` para cada destinatário.
- **Digest/streak:** a chave+params viaja no signal do Temporal (`Email` em
  `signals/email.signal.ts`); o workflow filtra por preferência **e por perfil**;
  a activity `sendDigestEmail` renderiza via `renderDigestEmail`.

### Escopo por perfil (autorização)

Destinatários de e-mail **e** visibilidade do sino são filtrados pelo perfil
dono do canal (`Integration.profileId`, ou `post.profileId` como fallback):

- **E-mail:** `OrganizationRepository.getUsersForNotification(orgId, profileId)`
  → admins/superadmins da org **OU** `ProfileMember` do `profileId`.
  `profileId` nulo = org-wide (todos — comportamento anterior, ex. streak).
- **Sino:** `buildProfileScope({ isAdmin, profileIds })` em
  `notifications.repository.ts` filtra as 3 queries de leitura
  (`getMainPageCount`/`getNotifications`/`getNotificationsPaginated`):
  `profileId IS NULL OR profileId IN (viewerProfileIds) OR isAdmin`. O escopo do
  viewer é resolvido em `notifications.controller.ts` (que é
  `@SkipProfileAccess()`) via `ProfileService.getUserProfileIds(user.id, orgId)`
  + `getOrgRole(org)` — **sempre a partir do usuário autenticado**, nunca de
  input do cliente.

> O digest e o `getTeamForNotifications` escopam os `profileMembers` por
> `profile.organizationId = orgId` — um usuário pode pertencer a perfis de
> várias orgs; o filtro só usa os perfis **desta** org.

## 5. Paridade de chaves (backend ↔ frontend)

As chaves de **mensagem** de notificação (`notif_*`, exceto `_subject`) são
usadas nos dois lugares: no sino (i18next do frontend) e no e-mail (`emailT`).
Elas devem existir com o mesmo texto e os mesmos `{{params}}` em:

- `libraries/nestjs-libraries/src/emails/i18n/catalog.ts`
- `libraries/react-shared-libraries/src/translation/locales/{pt,en}/translation.json`

O teste `email.i18n.spec.ts` (`NOTIFICATION_MESSAGE_KEYS`) falha se alguma chave
sumir de qualquer um dos catálogos.

## 6. Pontos de mudança comuns

- **Novo e-mail transacional:** adicione a chave em `catalog.ts` (pt/en) e use
  `emailT(key, lang, params)` no service — nunca string literal.
- **Nova notificação:** adicione a chave de mensagem em `catalog.ts` **e** no
  `translation.json` (pt/en); chame `inAppNotification` com
  `{ subjectKey, messageKey, params, profileId }`. Escolha o `profileId` do
  canal/entidade dona (ou `null` para org-wide).
- **Rebrand:** os textos de e-mail voltados ao usuário usam "Multipost"; créditos
  AGPL e identificadores de código/env (`POSTIZ_OAUTH_*`, agente `postiz`) são
  preservados.
