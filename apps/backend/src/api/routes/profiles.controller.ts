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
import { ProfileManage } from '@gitroom/nestjs-libraries/services/auth/profile-access/profile-access.decorators';
import { getOrgRole } from '@gitroom/nestjs-libraries/user/org.role';
import { AddProfileMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.profile-member.dto';
import { InviteProfileMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/invite.profile-member.dto';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';

@ApiTags('Profiles')
@Controller('/profiles')
export class ProfilesController {
  constructor(
    private _profileService: ProfileService,
    private _organizationService: OrganizationService
  ) {}

  @Get('/')
  async getProfiles(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    // Admin enxerga todos os perfis; org USER apenas os que e membro —
    // nao vaza nomes/rosters dos demais clientes do workspace.
    return this._profileService.getAccessibleProfiles(
      org.id,
      user.id,
      getOrgRole(org)
    );
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
  async getMembers(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    // Qualquer membro do perfil (ou admin) ve o roster; USER de fora -> 403.
    await this._profileService.assertProfileAccess(
      org.id,
      id,
      user.id,
      getOrgRole(org)
    );
    return this._profileService.getMembers(org.id, id);
  }

  // Convida por e-mail um novo membro para ESTE perfil (org-USER restrito ao
  // perfil). Papel concedido limitado ao do convidante (Dono convida ate Dono;
  // Gerente ate Gerente). Admin da org convida qualquer papel.
  @Post('/:id/members/invite')
  @ProfileManage({ param: 'id' })
  async inviteMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: InviteProfileMemberDto
  ) {
    await this._profileService.assertCanGrantProfileRole(
      org.id,
      id,
      { userId: user.id, orgRole: getOrgRole(org) },
      body.profileRole
    );
    return this._organizationService.inviteTeamMember(org.id, {
      email: body.email,
      role: 'USER',
      sendEmail: body.sendEmail,
      profileIds: [id],
      profileRole: body.profileRole,
    });
  }

  @Post('/:id/members')
  @ProfileManage({ param: 'id' })
  async addMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: AddProfileMemberDto
  ) {
    return this._profileService.addMember(org.id, id, body.userId, body.role, {
      userId: user.id,
      orgRole: getOrgRole(org),
    });
  }

  @Delete('/:id/members/:userId')
  @ProfileManage({ param: 'id' })
  async removeMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Param('userId') userId: string
  ) {
    return this._profileService.removeMember(org.id, id, userId, {
      userId: user.id,
      orgRole: getOrgRole(org),
    });
  }

  @Post('/:id/api-key/rotate')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async rotateProfileApiKey(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._profileService.updateApiKey(org.id, id);
  }
}
