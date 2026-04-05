import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { AddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto';
import { ShortlinkPreferenceDto } from '@gitroom/nestjs-libraries/dtos/settings/shortlink-preference.dto';
import { UpdateAiCreditsDto } from '@gitroom/nestjs-libraries/dtos/settings/update.ai-credits.dto';
import { UpdateProfilePersonaDto } from '@gitroom/nestjs-libraries/dtos/settings/update.profile-persona.dto';
import { ApiTags } from '@nestjs/swagger';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { KnowledgeService } from '@gitroom/nestjs-libraries/database/prisma/knowledge/knowledge.service';

@ApiTags('Settings')
@Controller('/settings')
export class SettingsController {
  constructor(
    private _organizationService: OrganizationService,
    private _profileService: ProfileService,
    private _subscriptionService: SubscriptionService,
    private _knowledgeService: KnowledgeService
  ) {}

  @Get('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async getTeam(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getTeam(org.id);
  }

  @Post('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async inviteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AddTeamMemberDto
  ) {
    return this._organizationService.inviteTeamMember(org.id, body);
  }

  @Delete('/team/:id')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  deleteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._organizationService.deleteTeamMember(org, id);
  }

  @Get('/shortlink')
  async getShortlinkPreference(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    if (profile?.id) {
      return this._profileService.getShortlinkPreference(profile.id);
    }
    return this._organizationService.getShortlinkPreference(org.id);
  }

  @Post('/shortlink')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateShortlinkPreference(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: ShortlinkPreferenceDto
  ) {
    if (profile?.id) {
      return this._profileService.updateShortlinkPreference(profile.id, body.shortlink);
    }
    return this._organizationService.updateShortlinkPreference(
      org.id,
      body.shortlink
    );
  }

  @Get('/late')
  async getLateSettings(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    if (profile?.id) {
      return this._profileService.getLateSettings(profile.id);
    }
    return this._organizationService.getLateSettings(org.id);
  }

  @Post('/late')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async saveLateApiKey(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body('apiKey') apiKey: string
  ) {
    if (profile?.id) {
      return this._profileService.saveLateApiKey(profile.id, apiKey);
    }
    return this._organizationService.saveLateApiKey(org.id, apiKey);
  }

  @Delete('/late')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async removeLateApiKey(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    if (profile?.id) {
      return this._profileService.removeLateApiKey(profile.id);
    }
    return this._organizationService.removeLateApiKey(org.id);
  }

  @Get('/share-late-with-profiles')
  async getShareLateWithProfiles(
    @GetOrgFromRequest() org: Organization
  ) {
    return this._organizationService.getShareLateWithProfiles(org.id);
  }

  @Post('/share-late-with-profiles')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateShareLateWithProfiles(
    @GetOrgFromRequest() org: Organization,
    @Body('enabled') enabled: boolean
  ) {
    return this._organizationService.updateShareLateWithProfiles(org.id, enabled);
  }

  @Get('/profiles/:profileId/ai-credits')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getProfileAiCredits(
    @GetOrgFromRequest() org: Organization,
    @Param('profileId') profileId: string
  ) {
    const profile = await this._profileService.getAiCredits(org.id, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }

    const usedImages = await this._subscriptionService.getUsedCredits(
      org.id, 'ai_images', profileId
    );
    const usedVideos = await this._subscriptionService.getUsedCredits(
      org.id, 'ai_videos', profileId
    );

    return {
      aiImageCredits: profile.aiImageCredits,
      aiVideoCredits: profile.aiVideoCredits,
      usedImages,
      usedVideos,
      mode: process.env.AI_CREDITS_MODE ?? 'unlimited',
    };
  }

  @Put('/profiles/:profileId/ai-credits')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateProfileAiCredits(
    @GetOrgFromRequest() org: Organization,
    @Param('profileId') profileId: string,
    @Body() body: UpdateAiCreditsDto
  ) {
    const updated = await this._profileService.updateAiCredits(org.id, profileId, body);
    return {
      aiImageCredits: updated.aiImageCredits,
      aiVideoCredits: updated.aiVideoCredits,
    };
  }

  @Get('/ai-credits/summary')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getAiCreditsSummary(
    @GetOrgFromRequest() org: Organization
  ) {
    const profiles = await this._profileService.getAllProfilesWithCredits(org.id);
    const profilesWithUsage = await Promise.all(
      profiles.map(async (p) => {
        const usedImages = await this._subscriptionService.getUsedCredits(
          org.id, 'ai_images', p.id
        );
        const usedVideos = await this._subscriptionService.getUsedCredits(
          org.id, 'ai_videos', p.id
        );
        return {
          id: p.id,
          name: p.name,
          isDefault: p.isDefault,
          aiImageCredits: p.aiImageCredits,
          aiVideoCredits: p.aiVideoCredits,
          usedImages,
          usedVideos,
        };
      })
    );

    return {
      profiles: profilesWithUsage,
      mode: process.env.AI_CREDITS_MODE ?? 'unlimited',
    };
  }

  @Get('/profiles/:profileId/persona')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getProfilePersona(
    @GetOrgFromRequest() org: Organization,
    @Param('profileId') profileId: string
  ) {
    const persona = await this._profileService.getPersona(org.id, profileId);
    return { persona };
  }

  @Put('/profiles/:profileId/persona')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateProfilePersona(
    @GetOrgFromRequest() org: Organization,
    @Param('profileId') profileId: string,
    @Body() body: UpdateProfilePersonaDto
  ) {
    const persona = await this._profileService.upsertPersona(org.id, profileId, body);
    return { persona };
  }

  @Delete('/profiles/:profileId/persona')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteProfilePersona(
    @GetOrgFromRequest() org: Organization,
    @Param('profileId') profileId: string
  ) {
    await this._profileService.deletePersona(org.id, profileId);
    return { success: true };
  }

  @Get('/profiles/:profileId/knowledge')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listKnowledge(
    @GetOrgFromRequest() org: Organization,
    @Param('profileId') profileId: string
  ) {
    const documents = await this._knowledgeService.list(org.id, profileId);
    return { documents, enabled: this._knowledgeService.enabled };
  }

  @Post('/profiles/:profileId/knowledge/upload')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @UseInterceptors(FileInterceptor('file'))
  async uploadKnowledge(
    @GetOrgFromRequest() org: Organization,
    @Param('profileId') profileId: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new HttpException('File required', 400);
    }
    const doc = await this._knowledgeService.upload(org.id, profileId, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    return { document: doc };
  }

  @Delete('/profiles/:profileId/knowledge/:documentId')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteKnowledge(
    @GetOrgFromRequest() org: Organization,
    @Param('profileId') profileId: string,
    @Param('documentId') documentId: string
  ) {
    return this._knowledgeService.delete(org.id, profileId, documentId);
  }
}
