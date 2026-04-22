import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile } from '@prisma/client';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import Zernio from '@zernio/node';

const SUPPORTED_ZERNIO_PLATFORMS = [
  'twitter',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
  'pinterest',
  'reddit',
  'bluesky',
  'threads',
  'googlebusiness',
  'telegram',
  'snapchat',
];

@ApiTags('Zernio Integrations')
@Controller('/integrations/zernio')
export class ZernioIntegrationsController {
  constructor(
    private _organizationService: OrganizationService,
    private _profileService: ProfileService,
    private _integrationService: IntegrationService
  ) {}

  private async getZernioApiKey(
    org: Organization,
    profile?: Profile
  ): Promise<string> {
    let zernioApiKey: string | null = null;
    if (profile?.id) {
      zernioApiKey = await this._profileService.getDecryptedZernioApiKey(
        profile.id
      );
      // If profile has no key, check if org shares Zernio with profiles
      if (!zernioApiKey) {
        const shareSettings =
          await this._organizationService.getShareZernioWithProfiles(org.id);
        if (shareSettings?.shareZernioWithProfiles) {
          zernioApiKey =
            await this._organizationService.getDecryptedZernioApiKey(org.id);
        }
      }
    } else {
      // No active profile — use org-level key
      zernioApiKey = await this._organizationService.getDecryptedZernioApiKey(
        org.id
      );
    }
    if (!zernioApiKey) {
      throw new HttpException(
        'Zernio API key not configured. Go to Settings > Zernio to configure it.',
        400
      );
    }
    return zernioApiKey;
  }

  @Get('/profiles')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getZernioProfiles(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile
  ) {
    const apiKey = await this.getZernioApiKey(org, profile);
    const zernio = new Zernio({ apiKey });

    const { data, error } = await zernio.profiles.listProfiles();
    if (error) {
      throw new HttpException('Failed to fetch Zernio profiles', 500);
    }

    return {
      profiles: (data?.profiles || []).map((p: any) => ({
        _id: p._id,
        name: p.name,
        isDefault: p.isDefault,
      })),
    };
  }

  @Get('/accounts')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getZernioAccounts(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile,
    @Query('profileId') zernioProfileId: string
  ) {
    if (!zernioProfileId) {
      throw new HttpException('profileId is required', 400);
    }

    const apiKey = await this.getZernioApiKey(org, profile);
    const zernio = new Zernio({ apiKey });

    const { data, error } = await zernio.accounts.listAccounts({
      query: { profileId: zernioProfileId },
    });
    if (error) {
      throw new HttpException('Failed to fetch Zernio accounts', 500);
    }

    return {
      accounts: (data?.accounts || []).map((a: any) => ({
        _id: a._id,
        platform: a.platform,
        username: a.username,
        displayName: a.displayName,
        profileUrl: a.profileUrl,
        isActive: a.isActive,
      })),
    };
  }

  @Post('/connect-account')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async connectZernioAccount(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile,
    @Body()
    body: {
      zernioProfileId: string;
      accountId: string;
      platform: string;
      username: string;
      displayName: string;
    }
  ) {
    const { zernioProfileId, accountId, platform, username, displayName } = body;

    if (!SUPPORTED_ZERNIO_PLATFORMS.includes(platform)) {
      throw new HttpException(`Unsupported platform: ${platform}`, 400);
    }

    if (!accountId || !platform) {
      throw new HttpException('accountId and platform are required', 400);
    }

    const apiKey = await this.getZernioApiKey(org, profile);
    const providerIdentifier = `zernio-${platform}`;
    const name = displayName || username || `${platform} Account`;

    // Zernio SDK doesn't provide profile pictures for accounts.
    // Use the platform icon as fallback so the integration doesn't show a blank avatar.
    const picture =
      platform === 'youtube'
        ? '/icons/platforms/youtube.svg'
        : `/icons/platforms/${platform}.png`;

    // Compose internalId with profileId suffix so the same Zernio account can exist
    // in multiple profiles (the unique constraint is [organizationId, internalId]).
    // The real accountId is stored in customInstanceDetails for use during posting.
    const internalId = profile?.id
      ? `${accountId}_p${profile.id}`
      : accountId;

    const integration =
      await this._integrationService.createOrUpdateIntegration(
        undefined,
        false,
        org.id,
        name.trim(),
        picture,
        'social',
        internalId,
        providerIdentifier,
        apiKey,
        '',
        999999999,
        username,
        false,
        undefined,
        undefined,
        JSON.stringify({ zernioProfileId, zernioAccountId: accountId }),
        profile?.id
      );

    return {
      id: integration.id,
      inBetweenSteps: false,
    };
  }

  @Post('/invite-link')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async createInviteLink(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile,
    @Body() body: { profileId: string; platform: string }
  ) {
    if (!body.profileId || !body.platform) {
      throw new HttpException('profileId and platform are required', 400);
    }

    const apiKey = await this.getZernioApiKey(org, profile);

    // Undocumented Zernio endpoint carried over from the Late era — direct HTTP
    // call (not in SDK). If Zernio removed it the UI should fall back to the
    // dashboard, so we translate any non-2xx into a 501 the frontend can catch.
    let response: Response;
    try {
      response = await globalThis.fetch(
        'https://zernio.com/api/v1/platform-invites',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            profileId: body.profileId,
            platform: body.platform,
          }),
        }
      );
    } catch (err) {
      throw new HttpException(
        {
          error: 'INVITE_UNSUPPORTED',
          message:
            'Use the Zernio dashboard to invite platform connections.',
        },
        501
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new HttpException(
          {
            error: 'INVITE_UNSUPPORTED',
            message:
              'Use the Zernio dashboard to invite platform connections.',
          },
          501
        );
      }
      const err = await response.json().catch(() => ({}));
      throw new HttpException(
        err.message || 'Failed to create Zernio platform invite',
        response.status >= 500 ? 502 : response.status
      );
    }

    return await response.json();
  }

  @Get('/new-account-url')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getNewAccountUrl(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile,
    @Query('platform') platform: string,
    @Query('zernioProfileId') zernioProfileId: string
  ) {
    if (!SUPPORTED_ZERNIO_PLATFORMS.includes(platform)) {
      throw new HttpException(`Unsupported platform: ${platform}`, 400);
    }

    if (!zernioProfileId) {
      throw new HttpException('zernioProfileId is required', 400);
    }

    const apiKey = await this.getZernioApiKey(org, profile);
    const zernio = new Zernio({ apiKey });

    const redirectUrl = `${process.env.FRONTEND_URL}/integrations/social/zernio-${platform}`;

    const { data, error } = await zernio.connect.getConnectUrl({
      path: { platform: platform as any },
      query: {
        profileId: zernioProfileId,
        redirect_url: redirectUrl,
      },
    });

    if (error || !data?.authUrl) {
      throw new HttpException('Failed to get connect URL from Zernio', 500);
    }

    return { url: data.authUrl };
  }
}
