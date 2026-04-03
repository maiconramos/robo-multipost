import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { AutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { OnlyURL } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';

@ApiTags('Autopost')
@Controller('/autopost')
export class AutopostController {
  constructor(private _autopostsService: AutopostService) {}

  @Get('/')
  async getAutoposts(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this._autopostsService.getAutoposts(org.id, profile?.id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.WEBHOOKS])
  async createAutopost(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: AutopostDto
  ) {
    return this._autopostsService.createAutopost(org.id, body, undefined, profile?.id);
  }

  @Put('/:id')
  async updateAutopost(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: AutopostDto,
    @Param('id') id: string
  ) {
    return this._autopostsService.createAutopost(org.id, body, id, profile?.id);
  }

  @Delete('/:id')
  async deleteAutopost(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._autopostsService.deleteAutopost(org.id, id, profile?.id);
  }

  @Post('/:id/active')
  async changeActive(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body('active') active: boolean
  ) {
    return this._autopostsService.changeActive(org.id, id, active, profile?.id);
  }

  @Post('/send')
  async sendWebhook(@Query() query: OnlyURL) {
    return this._autopostsService.loadXML(query.url);
  }
}
