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
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { SetsService } from '@gitroom/nestjs-libraries/database/prisma/sets/sets.service';
import {
  UpdateSetsDto,
  SetsDto,
} from '@gitroom/nestjs-libraries/dtos/sets/sets.dto';

@ApiTags('Sets')
@Controller('/sets')
export class SetsController {
  constructor(private _setsService: SetsService) {}

  @Get('/')
  async getSets(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this._setsService.getSets(org.id, profile?.id);
  }

  @Post('/')
  async createASet(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: SetsDto
  ) {
    return this._setsService.createSet(org.id, body, profile?.id);
  }

  @Put('/')
  async updateSet(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: UpdateSetsDto
  ) {
    return this._setsService.createSet(org.id, body, profile?.id);
  }

  @Delete('/:id')
  async deleteSet(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._setsService.deleteSet(org.id, id, profile?.id);
  }
}
