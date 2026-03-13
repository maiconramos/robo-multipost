import {
  AuthTokenDetails,
  ClientInformation,
  GenerateAuthUrlResponse,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import Late from '@getlatedev/node';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

// In-memory cache for usage stats (TTL: 5 minutes)
const usageCache = new Map<string, { data: any; expiresAt: number }>();
const USAGE_CACHE_TTL = 5 * 60 * 1000;

export class LateBaseProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier: string;
  name: string;
  isBetweenSteps = false;
  scopes: string[] = [];
  editor = 'normal' as const;
  hiddenFromList = true;

  constructor(
    protected readonly platform: string,
    protected readonly platformName: string,
    protected readonly charLimit: number
  ) {
    super();
    this.identifier = `late-${platform}`;
    this.name = `${platformName} (via Late)`;
  }

  maxLength() {
    return this.charLimit;
  }

  async generateAuthUrl(
    clientInformation?: ClientInformation
  ): Promise<GenerateAuthUrlResponse> {
    const state = makeId(20);
    const codeVerifier = makeId(10);
    const lateApiKey = clientInformation?.instanceUrl;

    if (!lateApiKey) {
      throw new Error(
        'Late API key not configured. Go to Settings > Late to configure it.'
      );
    }

    const late = new Late({ apiKey: lateApiKey });
    const profileId = `postiz_${makeId(10)}`;
    const redirectUrl = `${process.env.FRONTEND_URL}/integrations/social/${this.identifier}`;

    const { data } = await late.connect.getConnectUrl({
      path: { platform: this.platform as any },
      query: {
        profileId,
        redirect_url: redirectUrl,
      },
    });

    await ioRedis.set(
      `late:${codeVerifier}`,
      JSON.stringify({ lateApiKey, profileId }),
      'EX',
      3600
    );

    return {
      url: data?.authUrl || '',
      codeVerifier,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails> {
    const lateAccountId = params.code;

    const stateData = await ioRedis.get(`late:${params.codeVerifier}`);
    if (!stateData) {
      throw new Error('Session expired. Please try connecting again.');
    }

    const { lateApiKey } = JSON.parse(stateData);
    const late = new Late({ apiKey: lateApiKey });

    const { data } = await late.accounts.listAccounts();
    const account = (data?.accounts || []).find(
      (a: any) => a._id === lateAccountId
    );

    // Late SDK doesn't provide profile pictures for accounts.
    // Use the platform icon as fallback.
    const picture =
      this.platform === 'youtube'
        ? '/icons/platforms/youtube.svg'
        : `/icons/platforms/${this.platform}.png`;

    return {
      id: lateAccountId,
      name: account?.displayName || account?.username || `${this.platformName} Account`,
      accessToken: lateApiKey,
      refreshToken: '',
      expiresIn: 999999999,
      picture,
      username: account?.username || account?.displayName || `${this.platform}_user`,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      id: '',
      name: '',
      accessToken: '',
      refreshToken: '',
      expiresIn: 999999999,
      picture: '',
      username: '',
    };
  }

  private async checkUsage(late: InstanceType<typeof Late>, apiKey: string) {
    const cached = usageCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const { data: usage } = await late.usage.getUsageStats();
    usageCache.set(apiKey, {
      data: usage,
      expiresAt: Date.now() + USAGE_CACHE_TTL,
    });
    return usage;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const late = new Late({ apiKey: accessToken });

    try {
      const usage = await this.checkUsage(late, accessToken);
      if (
        usage?.apiRequests &&
        usage.apiRequests.used >= usage.apiRequests.limit
      ) {
        throw new Error(
          `Late API request limit reached (${usage.apiRequests.used}/${usage.apiRequests.limit}). Upgrade your plan at getlate.dev`
        );
      }
    } catch (err: any) {
      if (err?.message?.includes('limit reached')) {
        throw err;
      }
    }

    // Use the real Late accountId from customInstanceDetails if available,
    // otherwise fall back to internalId (backwards compat with old integrations).
    let realAccountId = id;
    if (integration.customInstanceDetails) {
      try {
        const details = JSON.parse(integration.customInstanceDetails);
        if (details.lateAccountId) {
          realAccountId = details.lateAccountId;
        }
      } catch {}
    }

    const firstPost = postDetails[0];

    const mediaItems: Array<{ url: string }> = [];
    if (firstPost.media?.length) {
      for (const media of firstPost.media) {
        mediaItems.push({ url: media.path });
      }
    }

    const platformSpecificData = firstPost.settings || {};

    try {
      const { data } = await late.posts.createPost({
        body: {
          content: firstPost.message,
          mediaItems: mediaItems as any,
          platforms: [
            {
              platform: this.platform as any,
              accountId: realAccountId,
              platformSpecificData,
            },
          ],
          publishNow: true,
        },
      });

      const latePostId = data?.post?._id || '';

      // Poll Late API to verify the post was actually published on the platform.
      // Late accepts the post immediately but publishing may fail asynchronously
      // (e.g. expired token, account disconnected).
      if (latePostId) {
        const finalStatus = await this.pollPostStatus(late, latePostId);
        if (finalStatus === 'failed') {
          const errorMsg = await this.getPostErrorMessage(late, latePostId);
          throw new Error(
            errorMsg || `Post was sent to Late but failed to publish on ${this.platformName}. Check your Late dashboard for details.`
          );
        }
      }

      return [
        {
          id: firstPost.id,
          postId: latePostId,
          releaseURL: '',
          status: 'success',
        },
      ];
    } catch (err: any) {
      if (err?.status === 401) {
        throw new Error(
          'Late API key invalid or expired. Reconfigure in Settings > Late.'
        );
      }
      if (err?.status === 429) {
        throw new Error(
          'Late API rate limit reached. Please wait a few minutes.'
        );
      }
      throw err;
    }
  }

  private async pollPostStatus(
    late: InstanceType<typeof Late>,
    postId: string,
    maxAttempts = 10,
    intervalMs = 3000
  ): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        const { data } = await late.posts.getPost({
          path: { postId },
        });
        const status = data?.post?.status;
        if (status === 'published' || status === 'failed' || status === 'partial') {
          return status;
        }
        // 'publishing' or 'scheduled' — keep polling
      } catch {
        // Ignore errors during polling, keep trying
      }
    }
    // Timed out — assume success since Late accepted the post
    return 'unknown';
  }

  private async getPostErrorMessage(
    late: InstanceType<typeof Late>,
    postId: string
  ): Promise<string | null> {
    try {
      const { data } = await late.logs.getPostLogs({
        path: { postId },
      });
      const logs = (data as any)?.logs || [];
      const failedLog = logs.find((log: any) => log.status === 'failed');
      return failedLog?.response?.errorMessage || failedLog?.response?.rawBody || null;
    } catch {
      return null;
    }
  }
}
