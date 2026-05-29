import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetPublicApiProfileId } from '@gitroom/nestjs-libraries/user/public.api.profile.from.request';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { Organization } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';

@ApiTags('Public API')
@Controller('/public/v1')
export class PublicProfilesController {
  constructor(private _profileService: ProfileService) {}

  @Get('/profiles')
  async listProfiles(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (publicApiProfileId) {
      const profile = await this._profileService.getProfileById(org.id, publicApiProfileId);
      if (!profile) return [];
      return [{ id: profile.id, name: profile.name, isDefault: profile.isDefault, hasApiKey: !!profile.apiKey }];
    }
    const profiles = await this._profileService.getProfilesByOrgId(org.id);
    return profiles.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault, hasApiKey: !!(p as any).apiKey }));
  }
}
