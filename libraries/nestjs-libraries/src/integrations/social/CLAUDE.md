# Social Integrations — Claude Code Instructions

## Position in Hierarchy

- **Parent:** [`libraries/nestjs-libraries/CLAUDE.md`](../../../CLAUDE.md)
- **Grandparent:** [`/CLAUDE.md`](../../../../../CLAUDE.md)
- **Relevant siblings:**
  - [`src/chat/CLAUDE.md`](../../chat/CLAUDE.md) — IG webhook and HMAC validation; MCP tools that trigger integrations
  - [`src/ai/CLAUDE.md`](../../ai/CLAUDE.md) — encryption (`ENCRYPTION_KEY`) that also protects these tokens
  - [`apps/orchestrator/CLAUDE.md`](../../../../../apps/orchestrator/CLAUDE.md) — activities that call these providers

## What lives here

40+ social media providers. Each provider implements `SocialProvider` (from `social.integrations.interface.ts`) and extends `SocialAbstract` (from `../social.abstract.ts`), with OAuth, refresh token, posting, and error handling.

| Category | Content |
|---|---|
| Native providers | `bluesky`, `dev.to`, `discord`, `dribbble`, `facebook`, `farcaster`, `gmb`, `hashnode`, `instagram`, `instagram.standalone`, `kick`, `lemmy`, `linkedin`, `linkedin.page`, `listmonk`, `mastodon` (2 variants), `medium`, `mewe`, `moltbook`, `nostr`, `pinterest`, `reddit`, `skool`, `slack`, `telegram`, `threads`, `tiktok`, `tiktok-business`, `twitch`, `vk`, `whop`, `wordpress`, `x`, `youtube` |
| Providers via Zernio | `zernio-bluesky`, `zernio-facebook`, `zernio-googlebusiness`, `zernio-instagram`, `zernio-linkedin`, `zernio-pinterest`, `zernio-reddit`, `zernio-snapchat`, `zernio-telegram`, `zernio-threads`, `zernio-tiktok`, `zernio-twitter`, `zernio-youtube` |
| Instagram helpers | `instagram-route.resolver.ts`, `instagram-messaging.service.ts`, `instagram-dm-button.type.ts` |
| Base classes | `../social.abstract.ts` (`SocialAbstract` + `RefreshToken`/`BadBody`/`NotEnoughScopes`), `zernio.base.provider.ts` (base for all Zernio providers) |

## Specific Patterns and Rules

### 1. Every provider extends `SocialAbstract` and implements `SocialProvider`

`SocialAbstract` contract:

- `RefreshToken` (thrown when token is expired)
- `BadBody` (thrown when payload is invalid for the destination)
- `NotEnoughScopes` (thrown when OAuth did not request enough scopes)
- `fetch()` / `handleErrors()` / mention helper, all shared

### 2. `ClientInformation` propagation is MANDATORY in OAuth

The `generateAuthUrl(clientInformation?)` and `authenticate(...)` methods receive `ClientInformation` (from the workspace or active profile) with `clientId`, `clientSecret`, `instanceUrl` (Mastodon/Zernio), and per-profile settings.

**Never hardcode `process.env.X_CLIENT_ID`** inside the provider. Always use `clientInformation.clientId` (with an env fallback only when `clientInformation` is `undefined` — legacy path).

Reason (from auto-memory `feedback_per_profile_credentials.md`): OAuth credentials are **per-profile**, sourced from `Credentials` in the DB. Hardcoding env breaks multi-tenancy.

### 3. Instagram routing via `resolveIgRoute`

Canonical function in `instagram-route.resolver.ts`:

```typescript
import { resolveIgRoute } from '@gitroom/nestjs-libraries/integrations/social/instagram-route.resolver';
const route = await resolveIgRoute(integration, instagramMessagingService);
// route.token, route.host, route.useIgGraph, route.source
```

**Resolution priority**:

1. `providerIdentifier === 'instagram-standalone'` → `IG_LOGIN_GRAPH` (`graph.instagram.com`) + IG User Token from `Integration.token`
2. IG User Token registered in `Credentials.instagramTokens` → `IG_LOGIN_GRAPH`
3. Fallback: `FB_LOGIN_GRAPH` (`graph.facebook.com`) + Page Access Token from `Integration.token`

**Never** hardcode host or token in activities/services that touch IG endpoints (comments, DMs, follow-check, stories, reposts). Reason (from auto-memory `feedback_ig_token_routing.md`): Standard Access via IG Login bypasses App Review — critical for self-hosted deployments.

### 4. Three Meta credential layers (NEVER mix)

| Layer | Source | Use |
|---|---|---|
| **App credentials** (workspace) | `Credentials.clientId/clientSecret`, `instagramAppId/instagramAppSecret`, `threadsAppId/threadsAppSecret` | OAuth (`generateAuthUrl`/`authenticate`) and webhook HMAC validation |
| **Integration token** | `Integration.token` is a Page Access Token (`providerIdentifier='instagram'`) **OR** an IG User Token (`providerIdentifier='instagram-standalone'`) | Posting, comments, refresh |
| **Messaging tokens** (Settings > Credenciais > Instagram) | `Credentials.metaSystemUserToken` + `Credentials.instagramTokens` (per-account JSON) | DM and follow-check activities via the registered IG User Token. `metaSystemUserToken` ALSO powers the **publish self-heal**: when the human OAuth token dies (Meta account checkpoint), `MetaSystemUserService.resolveHealedToken` re-derives the Page Access Token via `reConnect(internalId, internalId, suToken)` instead of disconnecting the channel |

Details: [`docs/architecture/instagram-automations.md`](../../../../../docs/architecture/instagram-automations.md).

**Credential resolution differs between the two uses of `metaSystemUserToken` (intentional):** messaging reads via `getMessagingTokens` (`getRaw` — exact profile match, no inheritance; an org-wide channel — `profileId` null — goes through `InstagramMessagingService.loadState` → `CredentialService.getRawForOrgWide`: the null-profile row, else the Default profile row, never `getRaw(org, provider, undefined)`, which returns any profile's row; the IG token lazy refresh writes back to that same row via `MessagingTokensState.credentialProfileId`); publish self-heal reads via `CredentialService.getSystemUserToken` (`getRawShared` — inherits from the Default profile when `shareProviderCredentialsWithProfiles` is on, then falls back to env `META_SYSTEM_USER_TOKEN`, but only when the instance has a single organization — the env token belongs to the operator and must never heal another org; multi-org instances configure the token per org in the UI). `facebook`/`instagram` providers carry `noNativeRefresh = true` (their `refreshToken()` is a stub — a Page Access Token has no refresh_token flow), which tells the batch cron (`IntegrationService.refreshTokens`) to skip disconnecting them when no heal is available (the false-disconnect fix); real token death is still detected and handled at post time (`RefreshIntegrationService.refreshProcess`).

## Zernio (formerly Late / getlate.dev)

The [Zernio API](https://docs.zernio.com/llms-full.txt) is an alternative provider for channels that require complex OAuth: TikTok, Pinterest, X, Snapchat, Threads, Bluesky, Reddit, Telegram, Google Business, YouTube, Facebook, Instagram, LinkedIn (13 platforms).

### Architecture

- **Base**: `zernio.base.provider.ts` — `ZernioBaseProvider extends SocialAbstract` with the `Zernio` SDK (`@zernio/node`) and a Redis cache (TTL 5min) for usage stats.
- **Concrete providers**: `zernio-<platform>.provider.ts` — they inherit from `ZernioBaseProvider`, passing `platform`, `platformName`, `charLimit`. Marked with `hiddenFromList = true` (they do not appear under "Add Channel" directly — they enter via "Add Channel > Zernio" or "Send Invite Link > Zernio").
- **Identifier**: `zernio-${platform}` (e.g., `zernio-tiktok`, `zernio-pinterest`).
- **Per-profile API key**: resolved via `clientInformation.instanceUrl` (per-profile override) with org-level fallback controlled by the `shareZernioWithProfiles` flag.

### Supported flows

1. **Add Channel > Zernio**: admin selects an account already connected in their Zernio account.
2. **Send Invite Link > Zernio**: admin generates a per-platform OAuth link for the client to connect — endpoint `POST https://zernio.com/api/v1/platform-invites` (response shape: `{ invite: { inviteUrl, ... } }`).

After the client connects via the invite, the admin returns to "Add Channel > Zernio" and adds the new account.

### Frontend

- Modals: `apps/frontend/src/components/launches/zernio/` (`zernio-account-modal.tsx`, `zernio-invite-modal.tsx`, etc.).

### Why Zernio and not Late

The company fully rebranded Late/getlate.dev → Zernio (same company, new brand). The codebase migrated all providers and naming. There is no longer any `late.*.provider.ts` — only some legacy visual assets in `apps/frontend/public/icons/platforms/late.svg|png`.

## Key File Map

| File | Purpose |
|---|---|
| `../social.abstract.ts` | Base class + error classes (`RefreshToken`, `BadBody`, `NotEnoughScopes`, `PublishedWithError` — post already live but a follow-up step failed: `PostActivity.keepReleaseOnPublishedError` stores the platform id/URL via `PostsService.updatePublishedRelease` and rethrows `BadBody`, so the post ends ERROR with a working link); `fetch()` para publicação e `analyticsFetch()` para métricas |
| `../dashboard.function.decorator.ts` | `@DashboardFunction()` / `isDashboardFunction()` — marks provider methods that `POST /integrations/function` may run for the dashboard without making them `@Tool`; enforced by `IntegrationManager.isDashboardCallable` ("Add a new provider" step 7) |
| `social.integrations.interface.ts` | Interfaces (`SocialProvider`, `ClientInformation`, `AuthTokenDetails`, `PostDetails`, `PostResponse`). Optional `inlineImages?(settings)`: when true, `PostActivity` keeps own-media `<img>` in the `html` message (WordPress, ListMonk); every other provider gets the text without pictures (pitfall 19 of [`libraries/nestjs-libraries/CLAUDE.md`](../../../CLAUDE.md)). The fork has no X Articles, so `x.provider.ts` does not implement it |
| `facebook.provider.ts` | FB Page via Facebook Login (Page Access Token, host `graph.facebook.com`). Post analytics discriminates by id shape: `{pageId}_{postId}` → `/insights`, bare numeric id (video/reel/story) → `videoPostAnalytics` (`/video_insights`, quiet `[]` for stories) — both through `analyticsFetch`. `fetchPageInformation` throws an explicit error when the page is listed without a page token (no role on the business). `handleErrors`: 190/459 (Meta checkpoint) → `refresh-token` (self-heal path, like Instagram); the generic `(#200)` / "Sorry, something went wrong" catch-alls are evaluated last so they never shadow a specific subcode. `post()` ramifica por `settings.post_type`: feed/reel (`/photos`+`/feed`, `/videos`) **ou** Story — foto via `/photo_stories` (upload unpublished → `photo_id`) e vídeo via `/video_stories` (upload resumável 3 fases: `start`→rupload com header `file_url`→`finish`). Story não tem carrossel: cada mídia vira um story separado. Scopes de Story já estão nos `scopes` do provider (sem reconexão) |
| `instagram.provider.ts` | IG via Facebook Login (Page Access Token, host `graph.facebook.com`); includes `getMediaMetadata(mediaId, token, host?)` for inbox/dark-post enrichment. `igContainerStatus` reads `status_code,status` and throws a curated `BadBody` (or `RefreshToken` for a Meta checkpoint — the fork's self-heal path; upstream uses `disconnect`) on `ERROR`/`EXPIRED` while the V102 polling loop stays inside `post()`; collaborators go on the carousel container, never on child items |
| `instagram.standalone.provider.ts` | IG via Instagram Login (IG User Token, host `graph.instagram.com`) — preferred for self-hosted. Delegates to `InstagramLoginDelegate` (a subclass of `InstagramProvider`) that overrides `metaCheckpointError` so a Meta checkpoint fails the post with `bad-body` instead of `refresh-token` — there is no System User self-heal on Instagram Login, and `this.fetch`/`igContainerStatus` consult the delegate's `handleErrors`, not the standalone's |
| `instagram-route.resolver.ts` | `resolveIgRoute` — picks the correct host/token |
| `meta-graph.constants.ts` | Single source of truth for Meta Graph API version, Facebook/Instagram hosts and versioned base URLs. OAuth exchange/refresh endpoints remain deliberately unversioned. |
| `gmb.provider.ts` + `gmb.provider.spec.ts` | Native Google Business Profile — shared per-profile Google credentials, location discovery, confirmed local-post creation and reconnect-safe refresh tokens |
| `instagram-messaging.service.ts` | Registered tokens (Meta System User Token + per-account IG User Tokens) |
| `instagram-dm-button.type.ts` | Types for the follow-gate postback button |
| `pinterest.provider.ts` + `pinterest.provider.spec.ts` | Native Pinterest — per-profile OAuth credentials, image/video pin upload, bounded video-processing polling and 89-day analytics window; `postAnalytics` reads `summary_metrics` (period metrics — `lifetime_metrics` only carries TOTAL_COMMENTS/TOTAL_REACTIONS); `board` is validated as a numeric id in `PinterestSettingsDto` (`@Matches` deliberately above `@MinLength`) |
| `tiktok.provider.ts` + `tiktok.provider.spec.ts` | Native TikTok — publish-status polling stays inside `uploadedVideoSuccess` (publication `fetch`); `parsePublishStatus` reads the int64 public id from the raw body (JSON.parse rounds past 2^53); `resolveReleaseId` (analytics-side, `analyticsFetch`) turns a stored `v_pub_*`/`p_pub_*` publish id — or a `missing` inbox draft whose publish id rides in the `releaseURL` fragment — into the public id + URL (`/photo/` for `p_*`), returns `{ pending }` while TikTok has no public id and `{ unavailable }` for `SELF_ONLY`/`MUTUAL_FOLLOW_FRIENDS` posts; persisted by `PostsService.resolveRelease` (also called on click by `getReleaseURL`, `GET /posts/:id/release-url`); `releaseUrl` fetches the `share_url` (https TikTok only, query stripped) when a post is connected by hand; `video_cover_timestamp_ms` goes in `post_info`; publication polling is bounded (90 × 10 s) and fails fast on a non-JSON/`data`-less body; `refreshToken` takes `ClientInformation` |
| `youtube.provider.ts` + `youtube.provider.spec.ts` | YouTube via `googleapis` — quota (`defaultVideoInsertPerDayPerProject`) and thumbnail error mappings are spec'd with `googleapis` mocked. The thumbnail is `settings.thumbnail.path` (legacy, wins) or the first media's `thumbnail` (set in the composer's media panel); the upload is synchronous inside `post()`, so ANY `thumbnails.set` failure after `videos.insert` throws `PublishedWithError` (never a retryable error — a retry would upload the video again) |
| `wordpress.provider.ts` + `wordpress.provider.spec.ts` | WordPress REST connection/posting — Application Password authentication, normalized URLs, SSRF-safe diagnostics and optional status/category/tag settings; `inlineImages()` (pictures stay in the article body, attachments are not published) |
| `listmonk.provider.ts` + `listmonk.provider.spec.ts` | ListMonk campaign (HTML e-mail) — `inlineImages()` with `.content img { max-width: 100% }` |
| `zernio.base.provider.ts` | Base for all Zernio providers (Redis cache, helpers) |
| `x.provider.ts` + `x.provider.spec.ts` | X/Twitter — example of a tested provider |
| `reddit.provider.ts` + `reddit.provider.spec.ts` | Reddit — `normalizeSubreddit`, exact-first subreddit search, `submitWithRateLimit` (Reddit answers 200 with `json.errors`; RATELIMIT waits inside a 180 s per-activity budget and resubmits the same subreddit — no `checkPending` lane in the fork); websocket closed on every path (redirect, `error`, 30 s give-up); `linkFlairs`; DTO caps a post at 10 subreddits (`@ArrayMaxSize`) |
| `vk.provider.ts` + `vk.provider.spec.ts` | VK — `checkApiError` (HTTP 200 `{ error }`: code 5 → `RefreshToken`, 6/9/29 → plain `Error`, else `BadBody`); hosts `id.vk.ru`/`api.vk.ru`; `request_params` (echoes the token) stripped from the persisted error; `saveWallPhoto` goes through `this.fetch` |
| `lemmy.provider.ts` + `lemmy.provider.spec.ts` | Lemmy — `handleErrors`; `getJwtAndService` through `this.fetch` with the login failure rebuilt without the request body (stored password); `authenticate()` stays on `ssrfSafeFetch` |
| `slack.provider.ts` + `slack.provider.spec.ts` | Slack — `checkApiError` (HTTP 200 `{ ok: false }`); the composer rejects video client-side |
| `hashnode.provider.ts` + `hashnode.provider.spec.ts` | Hashnode — `gql-beta.hashnode.com`, tags by `slug` (unknown ids skipped), `coverImage`, GraphQL `errors` → `BadBody` |
| `telegram.provider.ts` + `telegram.provider.spec.ts` | Telegram — `sendMessage` wraps `sendMessageInternal`: ETELEGRAM 400 → `BadBody` (permanent rejection), others propagate; `/connect` handshake: `getBotId` stores the chat id under a one-time nonce (`telegram:connect:<nonce>`, 10 min) and returns only the nonce, `authenticate` accepts only that nonce (see pitfall 19) |
| `tiktok.business.provider.ts` + `tiktok.business.provider.spec.ts` | TikTok for Business (`tiktok-business`, Business API v1.3, port of upstream 4ace3a7a..97ee8b9f) — own OAuth app resolved per workspace/profile under the `tiktok-business` credential key (env `TIKTOK_BUSINESS_CLIENT_ID/SECRET` only as fallback); redirect URI **must** end with `/` (`/integrations/social/tiktok-business/`) and the callback arrives with `auth_code` (mapped in `continue.integration.tsx`; missing code → `BadBody` before the token call). Every endpoint answers HTTP 200 with `{ code, message, data }`: the body is classified after each call (`throwIfTokenError`). `postPending` + single-shot `checkPostStatus` (V112 lane) and a blocking `post()` capped at 8 min (V102, below the 10-min activity timeout) — after the publish nothing in `post()` may throw a retryable error (a retried activity republishes): timeout or `RefreshToken` during the status check become `PublishedWithError` with the share_id. `assertPublishable` repeats the composer's media rules, the caption limit (`tiktok.caption`) and the 1080px image pre-check (sharp, one image at a time, 25 MB cap and 60 s total budget, unreadable image passes) before publishing. Settings DTO `TikTokBusinessDto` (`music`/`location` on top of `TikTokDto`); `musicSearch`/`locationSearch` are `@Tool`s used by the composer (`tiktok.music.tsx`/`tiktok.location.tsx`) and the MCP agent |
| `tiktok.caption.ts` + `tiktok.caption.spec.ts` | TikTok text limits in one place (video caption 2,200, photo description 4,000, photo title 90 — UTF-16): `tiktokCaptionTooLong`, `tiktokPlainText`, `isTikTokPhotoPost`, `truncateTikTokCaption`; used by `PostsService.createPost` (`TIKTOK_IDENTIFIERS`: `tiktok`, `zernio-tiktok`, `tiktok-business`), `TiktokProvider.post`, `TiktokBusinessProvider.postPending`, `ZernioTikTokProvider.assertPublishable` and the repost (`apps/orchestrator/src/activities/repost.caption.ts`) |
| `nostr.provider.ts` + `nostr.provider.spec.ts` | Nostr — `secretKey(hex)` validates 64 hex chars (`BadBody`; `authenticate` answers 'Invalid credentials') → `Uint8Array` for `getPublicKey`/`finalizeEvent` |
| `farcaster.provider.ts` + `farcaster.provider.spec.ts` | Farcaster via Neynar **managed signers** (upstream #2078/#2080; SIWN removed), fixed host `https://api.neynar.com/v2/farcaster` without `@neynar/nodejs-sdk`: writes (`/signer/`, `/signer/signed_key/`, `/cast/`, channel search) via `this.fetch` (`neynarWrite` rethrows `BadBody`/`RefreshToken` without `signer_uuid`/signature in the Temporal details), status reads via `ssrfSafeFetch` (`neynarRead` → `FarcasterNeynarError` with a stable `reason`), 30 s `AbortSignal.timeout` on every call. `createSigner({ sponsor })` (EIP-712 `SignedKeyRequest` signed with `NEYNAR_APP_MNEMONIC`, https-only approval URL, QR via `qrcode`); `authenticate` takes the opaque `requestId` + `state` from the connect flow, checks the registry entry, re-reads fid/profile from Neynar and consumes the entry. Instance env credentials, not `ClientInformation` — see pitfall 22 |
| `farcaster.signer.registry.ts` | Redis registry `farcaster:signer:<requestId>` (15 min): `issue` (`makeSecureId(32)`), `get` (format-checked, `null` before any Neynar call), `consume` (single use, `DEL` = 1). Entries carry the binding: `login` (sha256 of the cookie nonce) or `channel` (org, user, profile, connect `state`) |
| `farcaster.signer.service.ts` + `.spec.ts` | `FarcasterSignerService` — HTTP-facing flow: `startLogin`/`loginStatus`/`assertLoginCode`/`loginToken`/`loginIdentity`/`consumeLogin` for the public `/auth/farcaster/signer` routes and the FARCASTER code exchange (login gate `assertLoginEnabled` → 404), `startChannel`/`channelStatus` for the authenticated `/integrations/farcaster/signer` routes (sponsorship only here). Stable error codes (`not_configured`, `invalid_state`, `invalid_signer`, `key_refused`, `no_credits`, `rate_limited`, `failed`), logs via `summarizeError` |
| `discord.provider.ts` + `discord.provider.spec.ts` | Discord — the bot token (`DISCORD_BOT_TOKEN_ID`) is shared by every org, so `post`/`comment` call `assertChannelInGuild` (snowflake format + `GET /channels/:id` `guild_id` equal to the channel internalId) before writing; `DiscordDto.channel` is `@Matches(/^\d{5,25}$/)` |
| `dribbble.provider.ts` + `dribbble.provider.spec.ts` | Dribbble — shots POST: 401 → `RefreshToken` (reconnect), other 4xx (≠ 429) → `BadBody` with the API message; `refreshToken` is the non-refreshable stub (Dribbble issues no refresh token) |

## Common Workflows

### Add a new provider

1. **Spec first** if the provider has non-trivial logic (post formatting, upload retry, response parsing). See `x.provider.spec.ts` as reference.
2. Create `<platform>.provider.ts` extending `SocialAbstract` + `implements SocialProvider`.
3. **OAuth**:
   - `generateAuthUrl(clientInformation?: ClientInformation)` — ALWAYS use `clientInformation.clientId/clientSecret/instanceUrl` (with `process.env` fallback only for legacy, ideally not at all).
   - `authenticate(...)` — same rule.
   - `state` / `codeVerifier` / `nonce` — CSPRNG only (step 8).
4. **Post**: `post(...)` with error handling that throws `RefreshToken`/`BadBody`/`NotEnoughScopes` when applicable.
5. **Refresh** (if expiration applies): the refresh method also propagates `ClientInformation`.
6. Register in `IntegrationManager` (`libraries/nestjs-libraries/src/integrations/integration.manager.ts`) with a unique identifier.
7. **Dashboard-callable methods**: `POST /integrations/function` runs a provider method by name with the channel token as first argument, but only if the method is a `@Tool` **or** is marked with `@DashboardFunction()` (`integrations/dashboard.function.decorator.ts`, checked by `IntegrationManager.isDashboardCallable`). Any helper the frontend calls through `useCustomProviderFunction` / the continue-provider `endpoint` (`pages`, `companies`, `company`, `tags`, ...) that is not a `@Tool` needs the decorator, otherwise the route answers 500 (`Function not found` in the backend log) and the picker/connect step breaks. Prefer `@DashboardFunction()` over `@Tool` for dashboard-only helpers: `@Tool` also exposes the method to the public API (`public.integrations.controller.ts`) and the MCP agent (`integration.trigger.tool.ts`). Overrides inherit the marker (`mention` is decorated only on `SocialAbstract`), so do not re-decorate them. Never make internal helpers (`readOrFetch`, `fetch`, `post`) callable this way (CVE-2026-115931). Add the pair to the `dashboardCalls` table in `integration.manager.spec.ts`.
8. **OAuth secrets**: `state`, `codeVerifier` and `nonce` MUST come from a CSPRNG: `makeSecureId` (`services/make.secure.id.ts`), or `randomBytes(n).toString('base64url')` when PKCE needs a long verifier (`vk`, `whop`, `kick`). `makeId` is `Math.random()` and is only acceptable for non-secret ids (post/message ids). `oauth.state.entropy.spec.ts` fails the build when a `*.provider.ts` assigns `state`/`nonce`/`codeVerifier` from `makeId(`/`Math.random` (regex scan; other shapes are not seen) (CVE-2026-94456).
9. **Frontend**: icon in `apps/frontend/public/icons/platforms/<provider>.png`. Composer settings/pickers in `apps/frontend/src/components/new-launch/providers/<provider>/` (registered in `show.all.providers.tsx`); a post-connect page/company picker lives in `new-launch/providers/continue-provider/<provider>/` and calls the step-7 method through `with-continue-provider.tsx` (`endpoint`).
10. **CHANGELOG.md** under `[Unreleased]`.

### Add a provider via Zernio

1. Create `zernio-<platform>.provider.ts` inheriting from `ZernioBaseProvider`. The constructor passes `(platform, platformName, charLimit)`.
2. Register in `IntegrationManager`.
3. Frontend: already exposed via "Add Channel > Zernio" — common UI.

### OAuth diagnostics

1. Is `clientInformation` arriving? Log it at the start of `generateAuthUrl`.
2. Are you using `clientInformation.clientId` or `process.env.X_CLIENT_ID`? It must be the former.
3. For IG/FB: confirm `instagramAppId`/`instagramAppSecret` or `clientId`/`clientSecret` — depends on which Meta product the app is using.

## Known Pitfalls

1. **Symptom:** OAuth works in one org but fails in another → **Cause:** provider hardcodes `process.env.X_CLIENT_ID` instead of using `clientInformation`. **Fix:** propagate `ClientInformation` in **`generateAuthUrl` AND `authenticate`** (and refresh, if applicable).
2. **Symptom:** IG comment activity returns 400/403 → **Cause:** wrong host/token for the integration type. **Fix:** always `resolveIgRoute(integration, ...)`. Never hardcode `graph.facebook.com`.
3. **Symptom:** IG webhook accepts events, but `is_user_follow_business` does not work → **Cause:** Facebook Login Page Access Token does not have Standard Access to that field. **Fix:** install `instagram.standalone.provider` (IG Login) or register an IG User Token under Settings > Credenciais > Instagram.
4. **Symptom:** Zernio returns "API key invalid" → **Cause:** `clientInformation.instanceUrl` (which carries the key) is not being read. **Fix:** check the `generateAuthUrl` flow of `ZernioBaseProvider` — the key resolves per-profile first, then org with `shareZernioWithProfiles`.
5. **Symptom:** Trying to import `late.*.provider` → **Cause:** Late was removed (rebranded to Zernio). **Fix:** use `zernio-<platform>.provider.ts`.
6. **Symptom:** Token refresh in an infinite loop → **Cause:** `RefreshToken` thrown even after a successful refresh. **Fix:** ensure the new token updates `Integration.token` and the original call is retried with the new token.
7. **Symptom:** `GET /{mediaId}?fields=...,boost_eligibility_info` returns `"(#100) Tried accessing nonexisting field"` → **Cause:** `boost_eligibility_info` only exists on the Facebook Login Graph (`graph.facebook.com`); the Instagram Login Graph (`graph.instagram.com` / standalone) does not expose it. Per [Meta docs](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media), only "Instagram API with Facebook Login" supports it. **Fix:** check `host.includes('graph.facebook.com')` before including the field. `InstagramProvider.getMediaMetadata` already implements this guard with a retry-without-field safety net — reuse it instead of writing a new Graph API call for media metadata.
8. **Symptom:** `facebook`/`instagram` channel keeps needing reconnection even though the Page/IG account is healthy → **Cause:** both providers have `noNativeRefresh = true` (stub `refreshToken()` — see "Three Meta credential layers" above); a dead human OAuth session has no native renewal path. **Fix:** configure a Meta System User token so `MetaSystemUserService.resolveHealedToken` can re-derive the Page Access Token instead of disconnecting the channel. Full pitfall write-up: [`libraries/nestjs-libraries/CLAUDE.md`](../../../CLAUDE.md) Known Pitfalls.

8. **Symptom:** saving the Meta **System User Token** fails with `"(#100) Tried accessing nonexisting field (business)"` → **Cause:** the validation asked `/me?fields=...,business`. The [System User node](https://developers.facebook.com/docs/graph-api/reference/system-user/) exposes only `id`, `name`, `created_by`, `created_time`, `finance_permission`, `ip_permission` — there is no `business` field, and the Graph rejects the whole request, so a perfectly valid token gets refused. **Fix:** validate with `/me?fields=id,name` and resolve the Business Manager via the `/me/businesses` edge (same path `InstagramProvider.pages` already uses). Related: a System User usually does **not** appear in `/me/accounts` (that edge lists pages of a user who went through the OAuth dialog) — discover its pages via `/me/assigned_pages` plus `owned_pages`/`client_pages` per business, and keep every step after `/me` fail-soft. Canonical implementation: `InstagramMessagingService.validateSystemUserToken` + `collectSystemUserPages`. **Granted scopes ≠ assigned assets:** a System User with every scope still reaches zero accounts until the Page/IG account is added under Business Settings > System Users > *Add Assets*.

9. **Symptom:** a Meta feature works in one subsystem but another still calls an older Graph version → **Cause:** a provider/service embedded `v20.0`, `v21.0` or `v25.0` directly. **Fix:** use `META_GRAPH_API_VERSION`, `META_FACEBOOK_GRAPH_URL`, `META_INSTAGRAM_GRAPH_URL` or `metaGraphUrl(host)` from `meta-graph.constants.ts`. Do not version the dedicated Instagram token exchange/refresh endpoints (`api.instagram.com/oauth/access_token`, `graph.instagram.com/access_token`, `graph.instagram.com/refresh_access_token`). Version choice never replaces `resolveIgRoute`; host/token routing remains separate.

10. **Symptom:** Pinterest video fails as corrupted when a cover image is attached before the MP4, or a workspace credential is ignored → **Cause:** the upload used `media[0]` instead of the detected MP4 and older OAuth methods read only `PINTEREST_CLIENT_ID/SECRET`. **Fix:** preserve the `findMp4.path` upload and propagate `ClientInformation` through `generateAuthUrl`, `authenticate` and `refreshToken`. Keep video download/upload on `getSsrfSafeAxios`; do not replace it with raw Axios. Pinterest analytics accepts at most 90 days, so the provider deliberately uses 89 days as a UTC safety margin. Pin analytics must read `summary_metrics`: the requested metric types are period metrics and never appear in `lifetime_metrics`.

11. **Symptom:** GMB appears published with an empty external ID, or works immediately after reconnect and falls again about one hour later → **Cause:** the v4 API may answer HTTP 200 with `state: REJECTED`, no `name`, an empty/non-JSON body, or the reconnect may discard the newly issued Google `refresh_token`. **Fix:** treat only a named, non-rejected local post as success; keep `keepReconnectAuthTokens`, `include_granted_scopes: false` and best-effort revocation aligned with YouTube. GMB intentionally resolves the per-profile credential under the `youtube` alias because the settings card represents the shared Google OAuth app. Register both `/integrations/social/youtube` and `/integrations/social/gmb` as authorized redirect URIs.

12. **Symptom:** WordPress connection reports only “Invalid credentials”, works inconsistently by domain formatting, or fails behind a security plugin → **Cause:** older code parsed every response as JSON and collapsed network, HTTP and HTML failures into one catch. **Fix:** normalize only the request URL, keep the stored token/internal ID compatible, distinguish unreachable/401-403/other HTTP/non-JSON responses, and always use `ssrfSafeFetch`; never replace it with raw `fetch`. Logs may contain origin, status and WordPress error code, but never Basic auth, username, password or raw response body. Every WordPress call sends `User-Agent: RoboMultipost/1.0 (...)` (same brand string as `credential.service.ts`) — hosts behind a WAF reject an empty UA.

13. **Symptom:** analytics waits through posting retries, emits `BadBody`, or stops triggering token self-heal after an upstream sync → **Cause:** metric reads used `fetch()` from the posting pipeline, or were replaced with raw global `fetch`. **Fix:** use `analyticsFetch()`: it keeps SSRF/DNS-pinning, performs one request, does not throw `BadBody`, and preserves only `RefreshToken` for HTTP 401/provider-classified token failures. Do not use it for posting, polling publication state outside analytics, missing-content discovery or plugs. `resolveReleaseId` (TikTok) is an analytics-side read and uses `analyticsFetch`; `uploadedVideoSuccess` keeps `fetch`.

14. **Symptom:** a legacy post with a provider flag stored as the string `"false"` enables Trial Reel, PDF carousel, TikTok disclosure/toggles, or X partnership/AI metadata → **Cause:** direct truthiness checks such as `!!settings.flag`. **Fix:** normalize persisted provider flags through `SocialAbstract.assetBoolean`. Keep the X-specific behavior that omits `made_with_ai` and `paid_partnership` unless they are truly enabled; do not copy the upstream payload shape that always sends false values.
15. **Symptom:** a change to a composer settings component or a provider DTO suddenly affects a `zernio-*` channel → **Cause:** the Zernio channels reuse the native composer components (`show.all.providers.tsx` maps `zernio-tiktok` → `TiktokProvider`, etc.) and most of the native DTOs (`all.providers.settings.ts`). **Fix:** gate native-only checks on the `identifier` argument of `checkValidity` (5th parameter, e.g. the TikTok 1080px pre-check runs only for `tiktok`/`tiktok-business` because Zernio resizes images itself) and give a Zernio channel its own DTO when the contract diverges (`tiktok.business.dto.ts` keeps `music`/`location` out of the shared `TikTokDto`; `zernio-pinterest.dto.ts`: `board` stays a required string because `ZernioBaseProvider` does not map it to Zernio's `boardId`).
16. **Symptom:** a provider failure ends as `GRPC Message too large` or bloats Temporal history instead of exposing the original API error → **Cause:** `ApplicationFailure` serializes message and details, and providers may return large HTML/base64/debug bodies. **Fix:** keep `RefreshToken` and `BadBody` routed through `truncateForTemporal` in `../social.abstract.ts` (2,000 chars for the message; 4,000 per response/body field). Short payloads and leading Meta `code`/`error_subcode` must remain byte-for-byte available. This is a size bound, not redaction: never log or persist the raw failure object in status/history surfaces.
17. **Symptom:** a plug saved with an arbitrary `func` name runs a non-plug provider method from the plug workflow → **Cause:** `PlugDto.func` was stored unchecked and `IntegrationService.processPlugs` dispatches by name. **Fix:** `createOrUpdatePlug` only accepts a `methodName` returned by `IntegrationManager.getAllPlugs()` for the channel's provider (the `@Plug` decorator metadata, `custom:plug`), with the fields the plug declares, and `processPlugs` skips unregistered functions (`return true` ends the workflow). Mark a new plug with `@Plug(...)`; never widen the allowlist to make a helper reachable (same class as CVE-2026-115931).
18. **Symptom:** a VK, Slack, Hashnode or TikTok Business post is marked as published but nothing appears on the platform → **Cause:** these APIs answer HTTP 200 with an error payload (`{ error }`, `{ ok: false }`, GraphQL `errors[]`, TikTok Business `{ code: <non-zero> }`), which `this.fetch`/`handleErrors` never see. **Fix:** check the parsed body right after the call (`VkProvider.checkApiError`, `SlackProvider.checkApiError`, Hashnode `errors` check) and throw `RefreshToken`/`BadBody` (or a plain `Error` only for rate limits, which the activity may retry). Reddit has the same shape (`json.errors`) handled in `submitWithRateLimit`. VK API hosts are `id.vk.ru`/`api.vk.ru` (the `.com` hosts stopped serving the API); release URLs keep `vk.com`.
19. **Symptom:** a member connects a Telegram chat that belongs to another org/user, or the connect flow accepts a chat id sent by the client → **Cause:** the bot is shared by every org of the instance and `authenticate({ code })` used to call `getChat(code)` with whatever the client sent. **Fix:** keep the server-side handshake: `getBotId` (polled by `GET /integrations/telegram/updates`, query validated by `TelegramUpdatesDto` — `id` needs `@Type(() => Number)` because the global pipe does no implicit conversion) only accepts a `/connect <word>` sent by a group administrator (`senderIsChatAdmin`: `creator`/`administrator`, anonymous admin via `sender_chat`, channel posts, the user itself in a private chat), claims the `/connect` message once (`SET telegram:connect-used:<chat>:<message> NX`, 24 h — the update is never acknowledged on the shared bot, so without it the same message could mint a new code after the TTL), stores the chat id under a `makeSecureId(32)` nonce in Redis and returns `{ chatId: <nonce> }`; `authenticate` resolves the nonce and only the caller whose `DEL` returns 1 proceeds (no `getdel`: the `MockRedis` fallback lacks it). The frontend word comes from `makeWebSecureId(8)`. Residual risk with a shared bot: the `getUpdates` offset is shared (a poller can acknowledge updates another org is waiting for) and anyone who sees the word in the chat can redeem it within the window.
20. **Symptom:** a TikTok post (native, `tiktok-business` or `zernio-tiktok`) fails with the generic "Invalid request parameters" (`invalid_params`) and nobody can tell why → **Cause:** the text is over TikTok's limit (video caption `post_info.title` 2,200, photo description 4,000, photo title 90 — UTF-16 units, emoji = 2), and only the composer gate (2,000, `tiktok.provider.tsx`) checked it; public API, MCP/CLI and the Instagram→TikTok repost did not. **Fix:** keep the rule in one place — `tiktok.caption.ts` (`tiktokCaptionTooLong`, `tiktokPlainText` = same HTML→text conversion as `post.activity`, `isTikTokPhotoPost`, `truncateTikTokCaption`). It is enforced in `PostsService.createPost` (400 for schedule/now/update, drafts pass), again in `TiktokProvider.post`, `TiktokBusinessProvider.postPending` and `ZernioTikTokProvider.assertPublishable` (`BadBody` before any API call — `ZernioBaseProvider.assertPublishable` is the per-platform hook), and the repost truncates `TIKTOK_FEED` captions. Do not raise the composer's 2,000 without upstream; do not slice silently on publish (the user must see the edit).
21. **Symptom:** a channel shows "reconnect" with a raw provider error the user cannot act on, or a refresh failure reason carries a token/secret → **Cause:** `RefreshIntegrationService.refresh` stores `name: message` of the provider exception as `refreshError`/`StatusEvent`, and some APIs interpolate the request URL/body in the message. **Fix:** a provider that recognizes an actionable failure implements the optional `refreshErrorMessage?(err)` (`social.integrations.interface.ts`; YouTube maps Google Workspace `invalid_rapt` to admin guidance) and returns a static string; the generic fallback is passed through `redactSecrets` and clamped to 300 chars — never return text taken from the error. Analytics/missing-content retries after `RefreshToken` happen once (`forceRefresh` guard in `PostsService.checkPostAnalytics`/`getMissingContent` and `IntegrationService.checkAnalytics`), so `postAnalytics`/`analytics` may throw `RefreshToken` on 401 (YouTube does). Reconnect never wipes a stored refresh token when the provider returns none (`createOrUpdateIntegration` and the LinkedIn `oneTimeToken` sibling propagation, which is scoped to the same org).

## Zernio V112 publishing

`ZernioBaseProvider` uses `postPending()` for one submission and `checkPostStatus()` for read-only polling. Pending state contains only the remote postId. Only `published` confirms success; `failed`, `partial` and `cancelled` are terminal errors, and unknown states remain pending. Activities stay on `main`; the accepted reference is preserved by the orchestrator before polling. Legacy synchronous `post()` remains for draining V102 histories.

22. **Symptom:** every Farcaster channel is disconnected at once, a Farcaster channel keeps publishing after the user revoked access, or someone wires Neynar credentials into the per-workspace Credentials form → **Cause:** Neynar managed signers are bound to the API key (Neynar app) that created them, and `NEYNAR_APP_MNEMONIC` is the custody wallet of the app account (it controls the whole account). **Fix:** keep `NEYNAR_SECRET_KEY`/`NEYNAR_APP_FID`/`NEYNAR_APP_MNEMONIC` instance-level env (documented exception to rule 2 — there is no per-workspace credential path at post time, and a recovery phrase per workspace widens exposure; publishing an existing channel needs only `NEYNAR_SECRET_KEY`). `FarcasterProvider.handleErrors` maps only a body mentioning "signer"/"revoked" → `refresh-token` (revoked signer or SIWN signer under another key → channel "needs reconnect" with `FARCASTER_RECONNECT_MESSAGE`); 401 (bad key), 402 (no credits) and a generic 403 (plan/endpoint) → `bad-body` so an instance-wide problem never disconnects every channel; 502/503/504 → `retry`. `subreddits` (channel search, no signer) swallows errors into `[]` — a `RefreshToken` there would disconnect a healthy channel via `/integrations/function`. Never hand the browser a `signer_uuid` or accept one from it: the flow uses the registry's opaque `requestId`, bound to the login cookie or to org/user/state, single use (see `apps/backend/CLAUDE.md` pitfall 17). Ops guide: `docs/operations/farcaster-neynar.md`.

## Commands

```bash
# Spec for a specific provider
pnpm jest libraries/nestjs-libraries/src/integrations/social/x.provider.spec.ts

# Spec for the messaging tokens (System User Token validation)
pnpm jest libraries/nestjs-libraries/src/integrations/social/instagram-messaging.service.spec.ts
```

## References

- [`docs/architecture/instagram-automations.md`](../../../../../docs/architecture/instagram-automations.md) — Meta credentials, follow-gate, IG pitfalls (REQUIRED READING before changing IG)
- [`docs/architecture/credential-validation.md`](../../../../../docs/architecture/credential-validation.md) — credential validation
- [Zernio API docs](https://docs.zernio.com/llms-full.txt)
- [`src/chat/CLAUDE.md`](../../chat/CLAUDE.md) — IG webhook validation (HMAC with two secrets)
- [`apps/orchestrator/CLAUDE.md`](../../../../../apps/orchestrator/CLAUDE.md) — `FlowActivity.resolveIgRoute` wrapper
