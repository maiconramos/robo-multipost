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

export class LateTikTokProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'late-tiktok';
  name = 'TikTok (via Late)';
  isBetweenSteps = false;
  scopes: string[] = [];
  editor = 'normal' as const;

  maxLength() {
    return 2200;
  }

  async generateAuthUrl(
    clientInformation?: ClientInformation
  ): Promise<GenerateAuthUrlResponse> {
    const state = makeId(20);
    const lateApiKey = clientInformation?.instanceUrl;

    if (!lateApiKey) {
      throw new Error(
        'Late API key not configured. Go to Settings > Late to configure it.'
      );
    }

    const late = new Late({ apiKey: lateApiKey });
    const profileId = `postiz_${makeId(10)}`;
    const redirectUrl = `${process.env.FRONTEND_URL}/integrations/social/late-tiktok`;

    const { authUrl } = await late.connect.getConnectUrl({
      platform: 'tiktok',
      profileId,
      redirectUrl,
      headless: true,
    });

    // Store Late API key and profileId in Redis for callback retrieval
    await ioRedis.set(
      `late:${state}`,
      JSON.stringify({ lateApiKey, profileId }),
      'EX',
      3600
    );

    return {
      url: authUrl,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails> {
    // For Late, the "code" is the Late account ID returned in the callback
    const lateAccountId = params.code;

    // The codeVerifier contains the Late state, retrieve API key from Redis
    const stateData = await ioRedis.get(`late:${params.codeVerifier}`);
    if (!stateData) {
      throw new Error('Session expired. Please try connecting again.');
    }

    const { lateApiKey } = JSON.parse(stateData);
    const late = new Late({ apiKey: lateApiKey });

    // Get account details from Late
    const { accounts } = await late.accounts.listAccounts();
    const account = accounts?.find((a: any) => a._id === lateAccountId);

    return {
      id: lateAccountId,
      name: account?.name || 'TikTok Account',
      accessToken: lateApiKey,
      refreshToken: '',
      expiresIn: 999999999,
      picture: account?.picture || '',
      username: account?.username || account?.name || 'tiktok_user',
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    // Late manages token refresh automatically
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

    const usage = await late.usage.getUsageStats();
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

    // Check usage before posting
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
      // If usage check fails, continue with the post attempt
    }

    const firstPost = postDetails[0];

    // Prepare media items
    const mediaItems: Array<{ url: string }> = [];
    if (firstPost.media?.length) {
      for (const media of firstPost.media) {
        mediaItems.push({ url: media.path });
      }
    }

    try {
      const { post } = await late.posts.createPost({
        content: firstPost.message,
        mediaItems,
        platforms: [
          {
            platform: 'tiktok' as any,
            accountId: id,
          },
        ],
        publishNow: true,
      });

      return [
        {
          id: firstPost.id,
          postId: post?._id || '',
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
}
