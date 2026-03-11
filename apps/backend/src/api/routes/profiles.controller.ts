import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Profiles')
@Controller('/profiles')
export class ProfilesController {
  constructor(private _profileService: ProfileService) {}

  @Get('/')
  async getProfiles(@GetOrgFromRequest() org: Organization) {
    return this._profileService.getProfilesByOrgId(org.id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async createProfile(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: { name: string; description?: string; avatarUrl?: string }
  ) {
    return this._profileService.createProfile(org.id, body, user.id);
  }

  @Put('/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateProfile(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; avatarUrl?: string }
  ) {
    return this._profileService.updateProfile(org.id, id, body);
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteProfile(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._profileService.deleteProfile(org.id, id);
  }

  @Get('/:id/members')
  async getMembers(@Param('id') id: string) {
    return this._profileService.getMembers(id);
  }

  @Post('/:id/members')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role: 'OWNER' | 'MANAGER' | 'EDITOR' | 'VIEWER' }
  ) {
    return this._profileService.addMember(id, body.userId, body.role);
  }

  @Delete('/:id/members/:userId')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string
  ) {
    return this._profileService.removeMember(id, userId);
  }
}
