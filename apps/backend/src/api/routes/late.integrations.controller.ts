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
import Late from '@getlatedev/node';

const SUPPORTED_LATE_PLATFORMS = [
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

@ApiTags('Late Integrations')
@Controller('/integrations/late')
export class LateIntegrationsController {
  constructor(
    private _organizationService: OrganizationService,
    private _profileService: ProfileService,
    private _integrationService: IntegrationService
  ) {}

  private async getLateApiKey(
    org: Organization,
    profile?: Profile
  ): Promise<string> {
    let lateApiKey: string | null = null;
    if (profile?.id) {
      // When a profile is active, only use that profile's key — no fallback to org
      lateApiKey = await this._profileService.getDecryptedLateApiKey(
        profile.id
      );
    } else {
      // No active profile — use org-level key
      lateApiKey = await this._organizationService.getDecryptedLateApiKey(
        org.id
      );
    }
    if (!lateApiKey) {
      throw new HttpException(
        'Late API key not configured. Go to Settings > Late to configure it.',
        400
      );
    }
    return lateApiKey;
  }

  @Get('/profiles')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getLateProfiles(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile
  ) {
    const apiKey = await this.getLateApiKey(org, profile);
    const late = new Late({ apiKey });

    const { data, error } = await late.profiles.listProfiles();
    if (error) {
      throw new HttpException('Failed to fetch Late profiles', 500);
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
  async getLateAccounts(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile,
    @Query('profileId') lateProfileId: string
  ) {
    if (!lateProfileId) {
      throw new HttpException('profileId is required', 400);
    }

    const apiKey = await this.getLateApiKey(org, profile);
    const late = new Late({ apiKey });

    const { data, error } = await late.accounts.listAccounts({
      query: { profileId: lateProfileId },
    });
    if (error) {
      throw new HttpException('Failed to fetch Late accounts', 500);
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
  async connectLateAccount(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile,
    @Body()
    body: {
      lateProfileId: string;
      accountId: string;
      platform: string;
      username: string;
      displayName: string;
    }
  ) {
    const { lateProfileId, accountId, platform, username, displayName } = body;

    if (!SUPPORTED_LATE_PLATFORMS.includes(platform)) {
      throw new HttpException(`Unsupported platform: ${platform}`, 400);
    }

    if (!accountId || !platform) {
      throw new HttpException('accountId and platform are required', 400);
    }

    const apiKey = await this.getLateApiKey(org, profile);
    const providerIdentifier = `late-${platform}`;
    const name = displayName || username || `${platform} Account`;

    // Late SDK doesn't provide profile pictures for accounts.
    // Use the platform icon as fallback so the integration doesn't show a blank avatar.
    const picture =
      platform === 'youtube'
        ? '/icons/platforms/youtube.svg'
        : `/icons/platforms/${platform}.png`;

    const integration =
      await this._integrationService.createOrUpdateIntegration(
        undefined,
        false,
        org.id,
        name.trim(),
        picture,
        'social',
        accountId,
        providerIdentifier,
        apiKey,
        '',
        999999999,
        username,
        false,
        undefined,
        undefined,
        JSON.stringify({ lateProfileId }),
        profile?.id
      );

    return {
      id: integration.id,
      inBetweenSteps: false,
    };
  }

  @Get('/new-account-url')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getNewAccountUrl(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile,
    @Query('platform') platform: string,
    @Query('lateProfileId') lateProfileId: string
  ) {
    if (!SUPPORTED_LATE_PLATFORMS.includes(platform)) {
      throw new HttpException(`Unsupported platform: ${platform}`, 400);
    }

    if (!lateProfileId) {
      throw new HttpException('lateProfileId is required', 400);
    }

    const apiKey = await this.getLateApiKey(org, profile);
    const late = new Late({ apiKey });

    const redirectUrl = `${process.env.FRONTEND_URL}/integrations/social/late-${platform}`;

    const { data, error } = await late.connect.getConnectUrl({
      path: { platform: platform as any },
      query: {
        profileId: lateProfileId,
        redirect_url: redirectUrl,
      },
    });

    if (error || !data?.authUrl) {
      throw new HttpException('Failed to get connect URL from Late', 500);
    }

    return { url: data.authUrl };
  }
}
