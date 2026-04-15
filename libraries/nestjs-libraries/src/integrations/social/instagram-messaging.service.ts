import { Injectable, Logger } from '@nestjs/common';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';

const GRAPH_FB = 'https://graph.facebook.com/v25.0';
const GRAPH_IG = 'https://graph.instagram.com/v25.0';
const GRAPH_IG_REFRESH = 'https://graph.instagram.com/refresh_access_token';

const DAY = 86_400_000;
const REFRESH_MIN_AGE = 1 * DAY;
const REFRESH_MAX_AGE = 58 * DAY;

export interface IgMessagingTokenEntry {
  igUserId: string;
  username?: string;
  token: string;
  refreshedAt: string; // ISO
  validatedAt?: string; // ISO
}

export interface MetaSystemUserTokenInfo {
  businessId?: string;
  businessName?: string;
  pages: Array<{
    id: string;
    name: string;
    igUserId?: string;
    username?: string;
  }>;
}

export interface MessagingTokensState {
  metaSystemUserToken?: string;
  metaSystemUserTokenValidatedAt?: string;
  metaSystemUserTokenInfo?: MetaSystemUserTokenInfo;
  instagramTokens: IgMessagingTokenEntry[];
}

export interface ValidateSystemUserResult {
  ok: boolean;
  error?: string;
  businessId?: string;
  businessName?: string;
  pages?: MetaSystemUserTokenInfo['pages'];
}

export interface ValidateIgUserResult {
  ok: boolean;
  error?: string;
  igUserId?: string;
  username?: string;
}

@Injectable()
export class InstagramMessagingService {
  private readonly _logger = new Logger(InstagramMessagingService.name);

  constructor(private readonly _credentialService: CredentialService) {}

  /**
   * Send a DM to an Instagram user as a reply to a story interaction.
   * Uses the configured messaging token with priority:
   *   1. Meta System User Token (permanent, multi-account)
   *   2. Per-account Instagram User Token (60d, lazy refresh)
   * Throws user-friendly errors when no token is available or Meta rejects.
   */
  async sendStoryReply(params: {
    organizationId: string;
    profileId: string | null;
    igBusinessAccountId: string;
    recipientIgsid: string;
    message: string;
    buttonText?: string;
    buttonUrl?: string;
    integrationName?: string;
  }): Promise<void> {
    const state = await this.loadState(params.organizationId, params.profileId);

    // Priority 1 — System User Token
    if (state.metaSystemUserToken) {
      await this.postDm({
        baseUrl: `${GRAPH_FB}/${params.igBusinessAccountId}/messages`,
        token: state.metaSystemUserToken,
        recipientIgsid: params.recipientIgsid,
        message: params.message,
        buttonText: params.buttonText,
        buttonUrl: params.buttonUrl,
      });
      return;
    }

    // Priority 2 — per-account IG User Token
    const entry = state.instagramTokens.find(
      (t) => t.igUserId === params.igBusinessAccountId
    );

    if (!entry) {
      throw new Error(
        `Messaging nao configurado para ${params.integrationName || 'esta conta'}. Acesse Settings > Credenciais > Instagram e configure um System User Token ou um token por conta.`
      );
    }

    const tokenToUse = await this.ensureFreshIgToken(
      params.organizationId,
      params.profileId,
      state,
      entry
    );

    await this.postDm({
      baseUrl: `${GRAPH_IG}/me/messages`,
      token: tokenToUse,
      recipientIgsid: params.recipientIgsid,
      message: params.message,
      buttonText: params.buttonText,
      buttonUrl: params.buttonUrl,
    });
  }

  /**
   * Check whether the given Instagram-scoped user id follows the business
   * account, using the messaging token (System User or per-account IG User).
   * Used by story_reply flows since those don't have a Page Access Token in hand.
   * Returns true/false; throws only when there is no usable token.
   * On Graph API failure the check is logged and returns true (fail-open).
   */
  async isUserFollowingBusiness(params: {
    organizationId: string;
    profileId: string | null;
    igBusinessAccountId: string;
    recipientIgsid: string;
    integrationName?: string;
  }): Promise<boolean> {
    const state = await this.loadState(params.organizationId, params.profileId);

    let baseUrl: string;
    let token: string;

    if (state.metaSystemUserToken) {
      baseUrl = `${GRAPH_FB}/${params.recipientIgsid}`;
      token = state.metaSystemUserToken;
    } else {
      const entry = state.instagramTokens.find(
        (t) => t.igUserId === params.igBusinessAccountId
      );
      if (!entry) {
        throw new Error(
          `Messaging nao configurado para ${params.integrationName || 'esta conta'}. Acesse Settings > Credenciais > Instagram e configure um System User Token ou um token por conta.`
        );
      }
      const fresh = await this.ensureFreshIgToken(
        params.organizationId,
        params.profileId,
        state,
        entry
      );
      baseUrl = `${GRAPH_IG}/${params.recipientIgsid}`;
      token = fresh;
    }

    return this.fetchFollowFlag(baseUrl, token, params.recipientIgsid);
  }

  /**
   * Check follow status using an arbitrary token. Used by comment_on_post
   * flows which already have the Page Access Token on the integration row —
   * avoids requiring a messaging token setup for comment-only automations.
   */
  async isFollowingByToken(token: string, igsid: string): Promise<boolean> {
    return this.fetchFollowFlag(`${GRAPH_FB}/${igsid}`, token, igsid);
  }

  private async fetchFollowFlag(
    baseUrl: string,
    token: string,
    igsid: string
  ): Promise<boolean> {
    try {
      const res = await fetch(
        `${baseUrl}?fields=is_user_follow_business&access_token=${encodeURIComponent(token)}`
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        this._logger.warn(
          `Follow check failed for IGSID=${igsid}: ${
            body?.error?.message || `HTTP ${res.status}`
          }. Falling back to allow DM.`
        );
        return true;
      }
      return body.is_user_follow_business === true;
    } catch (e: any) {
      this._logger.warn(
        `Follow check threw for IGSID=${igsid}: ${e?.message || String(e)}. Falling back to allow DM.`
      );
      return true;
    }
  }

  /**
   * Validate a Meta System User Access Token by calling /me and /me/accounts.
   */
  async validateSystemUserToken(
    token: string
  ): Promise<ValidateSystemUserResult> {
    if (!token || token.length < 20) {
      return { ok: false, error: 'Token vazio ou invalido.' };
    }

    try {
      const meRes = await fetch(
        `${GRAPH_FB}/me?fields=id,name,business&access_token=${encodeURIComponent(token)}`
      );
      const meBody = await meRes.json();
      if (!meRes.ok || meBody.error) {
        return {
          ok: false,
          error:
            meBody?.error?.message ||
            `Meta retornou ${meRes.status} ao validar o token.`,
        };
      }

      const accountsRes = await fetch(
        `${GRAPH_FB}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
      );
      const accountsBody = await accountsRes.json();
      const pages: MetaSystemUserTokenInfo['pages'] = [];
      if (accountsRes.ok && Array.isArray(accountsBody?.data)) {
        for (const page of accountsBody.data) {
          pages.push({
            id: page.id,
            name: page.name,
            igUserId: page?.instagram_business_account?.id,
            username: page?.instagram_business_account?.username,
          });
        }
      }

      return {
        ok: true,
        businessId: meBody?.business?.id,
        businessName: meBody?.business?.name || meBody?.name,
        pages,
      };
    } catch (e: any) {
      this._logger.warn(
        `validateSystemUserToken failed: ${e?.message || String(e)}`
      );
      return { ok: false, error: e?.message || 'Erro ao validar token.' };
    }
  }

  /**
   * Validate an Instagram User Access Token by calling /me on graph.instagram.com.
   */
  async validateIgUserToken(token: string): Promise<ValidateIgUserResult> {
    if (!token || token.length < 20) {
      return { ok: false, error: 'Token vazio ou invalido.' };
    }

    try {
      const res = await fetch(
        `${GRAPH_IG}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`
      );
      const body = await res.json();
      if (!res.ok || body.error) {
        return {
          ok: false,
          error:
            body?.error?.message ||
            `Meta retornou ${res.status} ao validar o token.`,
        };
      }

      return {
        ok: true,
        igUserId: body.user_id || body.id,
        username: body.username,
      };
    } catch (e: any) {
      this._logger.warn(
        `validateIgUserToken failed: ${e?.message || String(e)}`
      );
      return { ok: false, error: e?.message || 'Erro ao validar token.' };
    }
  }

  /**
   * Read the current credential row and parse messaging-related fields.
   */
  async loadState(
    organizationId: string,
    profileId: string | null
  ): Promise<MessagingTokensState> {
    const raw = await this._credentialService.getRaw(
      organizationId,
      'facebook',
      profileId || undefined
    );

    if (!raw) {
      return { instagramTokens: [] };
    }

    let tokens: IgMessagingTokenEntry[] = [];
    if (raw.instagramTokens) {
      try {
        const parsed = JSON.parse(raw.instagramTokens);
        if (Array.isArray(parsed)) tokens = parsed;
      } catch {
        // ignore
      }
    }

    let info: MetaSystemUserTokenInfo | undefined;
    if (raw.metaSystemUserTokenInfo) {
      try {
        info = JSON.parse(raw.metaSystemUserTokenInfo);
      } catch {
        // ignore
      }
    }

    return {
      metaSystemUserToken: raw.metaSystemUserToken || undefined,
      metaSystemUserTokenValidatedAt:
        raw.metaSystemUserTokenValidatedAt || undefined,
      metaSystemUserTokenInfo: info,
      instagramTokens: tokens,
    };
  }

  /**
   * Given an entry, decide whether to refresh the IG User Token and do it if
   * needed. Returns the token that should be used for the next request.
   */
  private async ensureFreshIgToken(
    organizationId: string,
    profileId: string | null,
    state: MessagingTokensState,
    entry: IgMessagingTokenEntry
  ): Promise<string> {
    const refreshedAt = Date.parse(entry.refreshedAt);
    const age = Number.isFinite(refreshedAt)
      ? Date.now() - refreshedAt
      : Number.POSITIVE_INFINITY;

    if (age > REFRESH_MAX_AGE) {
      throw new Error(
        `Token da conta ${entry.username ? '@' + entry.username : entry.igUserId} expirado. Gere um novo no Meta Dashboard e atualize em Settings > Credenciais.`
      );
    }

    if (age < REFRESH_MIN_AGE) {
      return entry.token;
    }

    try {
      const refreshed = await this.callRefresh(entry.token);
      if (!refreshed) return entry.token;

      const newEntry: IgMessagingTokenEntry = {
        ...entry,
        token: refreshed,
        refreshedAt: new Date().toISOString(),
      };

      const updatedTokens = state.instagramTokens.map((t) =>
        t.igUserId === entry.igUserId ? newEntry : t
      );

      await this._credentialService.updateMessagingTokens(
        organizationId,
        profileId || undefined,
        { instagramTokens: updatedTokens }
      );

      return refreshed;
    } catch (e: any) {
      this._logger.warn(
        `Lazy refresh failed for igUserId=${entry.igUserId}: ${e?.message || String(e)}. Falling back to existing token.`
      );
      return entry.token;
    }
  }

  private async callRefresh(currentToken: string): Promise<string | null> {
    const res = await fetch(
      `${GRAPH_IG_REFRESH}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(currentToken)}`
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error || !body.access_token) {
      throw new Error(
        body?.error?.message ||
          `Meta retornou ${res.status} ao renovar o token.`
      );
    }
    return body.access_token as string;
  }

  private async postDm(params: {
    baseUrl: string;
    token: string;
    recipientIgsid: string;
    message: string;
    buttonText?: string;
    buttonUrl?: string;
  }): Promise<void> {
    const url = `${params.baseUrl}?access_token=${encodeURIComponent(params.token)}`;

    // Meta's button template caps text at 640 chars and button title at 20.
    // When a button is configured, send as an attachment template so the
    // CTA renders natively in Instagram. Otherwise fall back to plain text.
    const hasButton = !!(params.buttonText && params.buttonUrl);
    const messagePayload = hasButton
      ? {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: params.message.slice(0, 640),
              buttons: [
                {
                  type: 'web_url',
                  url: params.buttonUrl,
                  title: (params.buttonText || '').slice(0, 20),
                },
              ],
            },
          },
        }
      : { text: params.message };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: params.recipientIgsid },
        message: messagePayload,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const metaMsg =
        body?.error?.message || JSON.stringify(body?.error || body);
      throw new Error(
        `Meta rejeitou DM: ${metaMsg}. Verifique se o app esta em Live Mode, se o token tem a scope correta (instagram_manage_messages ou instagram_business_manage_messages) e se o destinatario interagiu nas ultimas 24h.`
      );
    }
  }
}
